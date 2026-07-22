- [Overview](#overview)
- [Folder Path](#folder-path)
- [Concepts](#concepts)
- [API Endpoints](#api-endpoints)
  - [Auth](#auth)
  - [Account](#account)
  - [Keys](#keys)
  - [Introspect](#introspect)
  - [Health](#health)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Host-only scripts](#host-only-scripts)

---

# Overview

`auth-server` is a centralized login service (port **62000**) other Shattered Archive apps
validate bearer tokens against. It does nothing by itself: it only manages accounts and
issues/verifies per-service API keys and browser sessions mapped to one master identity.
Signup is open and username-based, gated by a 3-question anti-bot challenge. Phase 2 added
the browser UI (`apps/auth-client`, [`docs/auth-client.md`](./auth-client.md)) and a real
`/api/introspect` consumer — `mud-builder-server`'s `GET /api/auth/introspect-check`.

For local setup instructions, see [`../apps/auth-server/README.md`](../apps/auth-server/README.md).

# Folder Path

- `apps/auth-server`

# Concepts

- **Sessions ARE key records.** A login mints a short-TTL (24h) key record with
  `kind:'session'`, delivered via an httpOnly `SameSite=Lax` cookie (`sa_session`). One
  verification path (`key-store.ts`'s `verify()`) covers both browser sessions and
  service API keys.
- **Epoch-based invalidation.** Every account has an integer `epoch`; every key/session
  records the epoch it was minted at. A password change or an explicit "rotate master"
  bumps the account's epoch, instantly invalidating every previously issued key/session —
  no need to touch each record. Both of those actions mint a **fresh** session at the new
  epoch before responding, so the caller doesn't appear logged out.
- **Forced password change.** Both the system-issued signup password and any
  operator-issued temp password set `mustChangePassword: true`. While set, every route
  except `GET /api/auth/me`, `POST /api/account/change-password`, and
  `POST /api/auth/logout` returns 403.
- **At-rest encryption.** Every JSON store except the anti-bot question pool (which is
  meant to be hand-edited) is AES-256-GCM encrypted under a key held externally — see
  `apps/auth-server/README.md`'s security section for the exact threat model.
- **Server-to-server introspection.** `/api/introspect` is gated by a per-service Ed25519
  signed assertion (`X-Service-Assertion` header), never a session cookie. Multiple
  concurrently-valid keys per service are supported so rotation never causes an outage.

---

# API Endpoints

## Auth

### `GET /api/auth/challenge`

Per-IP throttled. Returns 3 random question prompts (never answers).

```json
{ "challengeId": "...", "prompts": [{ "questionId": "q1", "prompt": "..." }] }
```

### `POST /api/auth/signup`

```json
{ "username": "alice", "challengeId": "...", "answers": { "q1": "...", "q2": "...", "q3": "..." } }
```

A failed challenge creates **no account** and never reveals which answer was wrong (400).
On success, `201` with the one-time password **shown exactly once**:

```json
{ "username": "alice", "password": "...", "note": "..." }
```

### `POST /api/auth/login`

```json
{ "username": "alice", "password": "..." }
```

Sets the `sa_session` cookie. Returns:

```json
{ "id": "...", "username": "alice", "mustChangePassword": true, "emailOnFile": false, "emailVerified": false }
```

### `POST /api/auth/logout`

Session-guarded. Revokes the current session and clears the cookie.

### `GET /api/auth/me`

Session-guarded (allowed even mid-`mustChangePassword`). Same response shape as login.

### `POST /api/auth/forgot-password`

```json
{ "username": "alice" }
```

**Always** returns the same generic message, whether or not the account/email exists
(anti-enumeration). Mails a reset link only if the account has a verified email.

### `POST /api/auth/reset-password`

```json
{ "token": "...", "newPassword": "..." }
```

Applies the new password (12-char minimum) and bumps the account's epoch. Does **not**
auto-login.

## Account

All routes below are session-guarded and blocked while `mustChangePassword` is set,
**except** `change-password` itself.

### `POST /api/account/change-password`

```json
{ "currentPassword": "...", "newPassword": "..." }
```

Verifies the current password, bumps epoch, mints a fresh session (new `sa_session`
cookie in the response).

### `POST /api/account/email`

```json
{ "email": "alice@example.com" }
```

Mails a verification link. Does not touch `email`/`emailVerifiedAt` until verified.

### `POST /api/account/email/verify`

```json
{ "token": "..." }
```

### `POST /api/account/rotate-master`

No body. Bumps epoch (independent of a password change), mints a fresh session.

## Keys

All routes below are session-guarded and blocked entirely during `mustChangePassword`.

### `GET /api/keys`

Lists the caller's API keys (excludes sessions, never returns the token hash).

### `POST /api/keys`

```json
{ "service": "some-consumer", "label": "laptop", "expiresAt": null }
```

`expiresAt`: an ISO date in the future, or `null`/omitted for no expiration. Plaintext
token shown exactly once.

### `POST /api/keys/:id/rotate`

New token for the same id/label; the old value stops working immediately.

### `DELETE /api/keys/:id`

Revokes the key. 404 (not 403) for a key belonging to someone else.

## Introspect

### `POST /api/introspect`

Server-to-server **only** — never reachable via a browser session cookie. Requires an
`X-Service-Assertion` header: a compact, Ed25519-signed, ≤60s-lived assertion
(`{service, iat, exp, nonce}`) from a key registered via `register-service` (see
[Host-only scripts](#host-only-scripts)).

```json
{ "token": "the-api-key-or-session-token-to-check" }
```

An invalid/missing/unverifiable **assertion** is `401`. An unknown/expired/revoked
**token** being checked is a normal `{"valid": false}` — not an error:

```json
{ "valid": true, "accountId": "...", "service": "some-consumer", "label": "laptop" }
```

## Health

### `GET /health`

```json
{ "status": "ok", "uptimeSeconds": 12345 }
```

---

# Configuration

See `apps/auth-server/README.md`'s [Environment variables](../apps/auth-server/README.md#environment-variables)
table.

---

# Deployment

Deployed at `https://auth.shatteredarchive.dev` (port 62000, `expose`-only, never
`ports:`-published) in both `deploy/docker-compose.yml` and
`deploy/docker-compose.shattered-archive-experimental.yml`, behind the edge nginx's
resolver+variable pattern (same as `build.shatteredarchive.dev`) so the edge starts
cleanly even if `auth-server` isn't running. The data-encryption key is delivered via a
mounted file in a dedicated `auth-server-secrets` volume — self-generated on first boot,
persists across container recreation, kept separate from `auth-server-data` so a leaked
data volume alone can't be decrypted. See [`deploy.md`](./deploy.md) for the general
deployment architecture.

---

# Host-only scripts

These are **never** HTTP routes — they run on the host with direct access to the
encrypted stores:

| Script | Purpose |
|---|---|
| `pnpm --filter @shatteredarchive/auth-server temp-password <username>` | Issue a one-time recovery password for an existing account (forces a password change on next login) |
| `pnpm --filter @shatteredarchive/auth-server register-service <name>` | Generate an Ed25519 keypair for a consuming service; prints the private key once |
| `pnpm --filter @shatteredarchive/auth-server revoke-service-key <name> <keyId>` | Second half of a no-downtime service-key rotation |

> Don't add a `--` before the arguments — on this repo's pinned `pnpm@11.x`,
> `pnpm --filter <pkg> <script> -- <args>` forwards the literal `--` through as an argument
> instead of stripping it. None of these scripts take flag-shaped arguments, so it's never
> needed.
