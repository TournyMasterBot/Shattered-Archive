---
id: auth-service
title: Auth hub (auth-server): service registry, device origins, encryption key, server-to-server calls
kind: protocol
tags: [auth, sso, service-registry, redirect-uri, device, encryption, introspect, docker]
repo: ShatteredArchive
paths: [deploy/docker-compose.yml, apps/auth-server/src/service-registry-reconciler.ts, apps/auth-server/src/config.ts, apps/auth-server/src/crypto-primitives.ts, apps/auth-server/src/routes/sso.ts, deploy/nginx/edge-subdomains.conf]
verified_date: 2026-10-03
verified_commit: ad565a6
status: current
---

# Auth hub

`apps/auth-server` is the hub (public origin `https://auth.shatteredarchive.dev`, internal port 62000); `apps/auth-client` is its UI. Services that use SSO do not share secrets with it: each one publishes a public key.

## SERVICE_REGISTRY is a full reconcile

- `SERVICE_REGISTRY` (a JSON env var in `deploy/docker-compose.yml`) is the source of truth for which services may use SSO and which redirect URIs each may return to. It is reconciled into the encrypted service-key store at boot and every 30 seconds (`service-registry-reconciler.ts`).
- **It prunes.** A service or redirect URI removed from the list is deregistered on the next pass, so the list must be exhaustive: every service that uses the hub needs an entry or it loses access.
- Three refusals limit the damage: unparseable JSON skips the whole pass; an unset or empty value skips the whole pass; a declared service that has published no public key yet keeps its existing keys instead of being revoked while it boots.
- **A missing entry fails silently.** On 2026-08-16 both `simulacrum-server` and `mud-builder-server` were missing from the list, and every account-based sign-in to them was rejected no matter how valid the credential. Declare a service here even before it ships in this stack (an entry with no published key is a harmless no-op).
- Redirect URIs are matched byte for byte by `/api/sso/approve` (`routes/sso.ts`): no trailing slash, no case-insensitivity, no normalisation. They must equal exactly what the consuming service sends.
- Nothing secret goes in `SERVICE_REGISTRY`. Keys are not listed there.

## Service keys

Each consuming service generates its own keypair and publishes the public half into the `sa-service-pubkeys` volume, which the hub mounts read-only (`SERVICE_PUBLIC_KEY_DIR`). The directory is scanned at boot and every 30 seconds, so start order does not matter. Only the service that owns a key writes it.

## Device credentials and origins

- `DEVICE_ORIGIN_SERVICES` maps an origin to the services a device enrolled there may mint tokens for: `origin=service`, comma separated, `origin=svc1|svc2` for several. Empty means deny all, which is the correct fail-closed state. It also derives the CORS allowlist for `/api/device`, so the two cannot drift.
- Origins are lowercase, scheme plus host, no path, and no default port (a browser sends `https://x.dev`, never `https://x.dev:443`). Wildcards are unsupported: invalid with credentials, and reflecting arbitrary origins would let any hostile page enroll itself against a signed-in account.
- A `shatteredarchive.com` origin cannot use the device path: it is cross-site relative to the `.dev` hub, so the `SameSite=Lax` session cookie is never sent and enrollment cannot authenticate. Such an app needs the SSO code flow.
- `DEVICE_GRANT_REQUIRED_SERVICES` lists services that also require an active API key on the account.

## Encrypted stores

- The encrypted stores live in `SECURE_DATA_DIR` (`config.ts` `secureDataDir`), keyed by `DATA_ENCRYPTION_KEY_FILE` (the `auth-server-secrets` volume, self-generated on first boot; precedence in `crypto-primitives.ts` `loadDataKey()`).
- **Never share one `SECURE_DATA_DIR` between two stacks.** On 2026-09-13 the prod and experimental stacks shared a directory while each read its own project-scoped key; whichever wrote second re-encrypted the files, and the other stack's next read failed the AES-GCM tag check and the store LOCKED. The lock is in memory, not on disk: nothing was lost; stop the intruder and restart the locked stack's process. Each stack now has its own `SECURE_DATA_DIR`.
- `dsl-questions.json` and `audit.log` stay in the shared `DATA_DIR` on purpose: `dsl-questions.json` is a plain file operators edit by hand (`questions-store.ts`).

## Server-to-server calls

Services call the hub (token exchange, introspect) directly at `auth-server.shatteredarchive.dev:62000` over `sa-shared`, not through the edge. Service traffic must not be counted against the browser-sized per-IP `limit_req` zones (`auth_login`, `auth_api` in `edge-subdomains.conf`), which would see every container as one client. The hub is attached to `sa-shared` under the same alias for this reason, so the C# site (a separate compose project) can resolve it.
