# auth-server

Centralized login service for the Shattered Archive ecosystem. It manages accounts and
issues/verifies per-service API keys and browser sessions mapped to one master identity.
Phase 2 added the browser UI (`apps/auth-client`, run alongside this via `pnpm
start:oauth`) and a real consumer of `/api/introspect` (`mud-builder-server`'s `GET
/api/auth/introspect-check`, a diagnostic-only proof). Phase 4 made `mud-builder-server`'s
actual write guard accept a centrally-issued account key too — see
[`docs/auth-server.md`](../../docs/auth-server.md) for both.

See [`../../docs/auth-server.md`](../../docs/auth-server.md) for the full API reference,
and this app's `.ai-context` for the design rationale (epoch-based invalidation, at-rest
encryption, Ed25519 service auth).

## Prerequisites

- Node.js and pnpm, installed per the [repo root README](../../README.md#installation).
- No database, no external services required for local dev.

## Running locally

```bash
pnpm install
pnpm --filter @shatteredarchive/auth-server dev
```

The very first thing boot does is load a data-encryption key — **it will not start without
one**. For local dev, generate one and put it in `.env` (do not export it as a shell
variable only — this app's `dotenv.config({ override: true })` will overwrite a
shell-exported value with whatever `.env` has, same as every other server in this repo):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the result into `DATA_ENCRYPTION_KEY=` in `apps/auth-server/.env`.

Once running:

```bash
curl http://localhost:62000/health
# {"status":"ok","uptimeSeconds":...}
```

### The anti-bot question pool

Signup is gated by a 3-question challenge drawn from an operator-maintained pool. Unlike
every other store in this app, it is **plain JSON, not encrypted** — it's meant to be
hand-edited with a text editor. Copy the tracked template to your data dir and edit it:

```bash
cp dsl-questions.example.json data/dsl-questions.json
# then edit data/dsl-questions.json with real questions
```

Changes are picked up live (mtime-checked) — no restart needed. Fewer than 3 questions in
the pool and `/api/auth/challenge` returns a 503 telling you so.

### Recovering a locked-out account

There's no HTTP route for this by design — it's a host-only operator action:

```bash
pnpm --filter @shatteredarchive/auth-server temp-password <username>
```

Prints a one-time password to the console (never logged to a file) and forces a password
change on next login, exactly like signup does.

> **Don't add a `--` before the argument.** On this repo's pinned `pnpm@11.x`,
> `pnpm --filter <pkg> <script> -- <args>` forwards the literal `--` token through to the
> script instead of stripping it as a pnpm/script-args separator (confirmed live during
> Phase 2 verification — `<username>` silently became the string `"--"`). None of this
> app's host scripts take flag-shaped arguments, so the separator is never needed here —
> just pass the positional argument(s) directly, as above.

### Registering a consuming service (Phase 2+)

```bash
pnpm --filter @shatteredarchive/auth-server register-service <service-name>
pnpm --filter @shatteredarchive/auth-server revoke-service-key <service-name> <key-id>
```

`register-service` prints a private key PEM exactly once — save it as
`shattered-service.key` on the *consuming* service's host (this server never stores it).
`revoke-service-key` is the second half of a no-downtime rotation: register a new key, roll
it out, confirm it's live, then revoke the old one. Same `--`-omission note as above applies.

`mud-builder-server` is a real consumer — see its `SERVICE_PRIVATE_KEY_PATH`/
`AUTH_SERVER_URL` env vars. Phase 2 wired the diagnostic-only `GET
/api/auth/introspect-check`; Phase 4 made its actual write guard (`authGuard`) fall back to
introspection for any bearer token unrecognized by the local `builder-auth.json` store — a
key minted here with `service: 'mud-builder-server'` authenticates a real mutation there,
local-key holders unaffected and no network dependency for them. Code-complete and
live-verified against real local processes for both phases. **Not yet active in either
deployed compose file**, though: `mud-builder-server`'s service block in
`deploy/docker-compose.shattered-archive-experimental.yml` sets neither env var (and
`mud-builder-server` isn't in prod `docker-compose.yml` at all), so a deployed instance still
behaves exactly as it did before Phase 2/4 — this was a deliberate choice in Phase 2 ("do not
wire into compose unless the user asks"), not an oversight, but it means the introspect
fallback is currently local-dev-only in practice.

## Running via the monorepo root

```bash
pnpm dev:auth-server           # tsx, hot dev server
pnpm start:auth-server         # built dist/, node
pnpm start:oauth               # BOTH auth-client + auth-server together, like the other
                                # client/server pairs in this repo (concurrently).
```

## Tests

```bash
pnpm --filter @shatteredarchive/auth-server build
pnpm --filter @shatteredarchive/auth-server test
```

94 tests across 9 suites (5 store-level, 4 route-level via a real `app.listen(0)` +
native `fetch`, no `supertest`). Route-level tests spin up a throwaway temp data dir per
suite and clean it up afterward — nothing touches `apps/auth-server/data`.

## Docker

```bash
# validate config without running anything
docker compose -f ../../deploy/docker-compose.shattered-archive-experimental.yml config

# bring up just this service
docker compose -f ../../deploy/docker-compose.shattered-archive-experimental.yml \
  up -d --build auth-server
```

The deployed encryption key is delivered via a **mounted file**, not an env var — a
separate `auth-server-secrets` Docker volume (kept apart from `auth-server-data` on
purpose: the key must never live alongside the data it decrypts). It self-generates on
first boot and persists across `--force-recreate`. See
[`../../docs/deploy.md`](../../docs/deploy.md) for the full deployment architecture.

Deployed at `https://auth.shatteredarchive.dev` in both compose files, `expose`-only
(never `ports:`-published) at 62000, reached only through the edge nginx.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | no (default `62000`) | Listen port |
| `DATA_DIR` | no (default `./data`) | Where the encrypted JSON stores + question pool live |
| `DATA_ENCRYPTION_KEY` | one of this or `_FILE` | 64 hex chars (32 bytes) — local dev/test |
| `DATA_ENCRYPTION_KEY_FILE` | one of this or above | Deploy path — self-generated on first boot if the file is absent but its directory exists |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` | no | Blank = console mail transport (prints the link instead of sending) |
| `PUBLIC_ORIGIN` | no (default `http://localhost:62080`) | Used to build recovery-link URLs in emails |

## Security model, in one paragraph

Passwords are scrypt-hashed, never stored or logged in plaintext. Every JSON store except
the (deliberately plain) question pool is AES-256-GCM encrypted at rest under a key held
externally — this protects a stolen disk image or backup, **not** a running-process
compromise (an attacker with code execution can just ask the service, like any at-rest
scheme on a single host). A password change or an explicit "rotate master" bumps an
account-level epoch counter, instantly invalidating every previously issued API key and
session with no need to touch each record — the tradeoff is that both of those actions
must mint a fresh session before responding, or the caller would appear logged out right
after the action that was supposed to keep them in. `/api/introspect` is server-to-server
only, gated by a per-service Ed25519 signed assertion (never a session cookie), with
replay protection and support for multiple concurrently-valid keys per service so
rotation never causes an outage.
