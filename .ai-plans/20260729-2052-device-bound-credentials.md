# Plan: Device-bound credentials — non-extractable device keypair replaces the stored bearer token

Created: 2026-07-30T01:52:10Z · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Make the durable browser credential a non-extractable ECDSA keypair that silently mints short-lived access tokens, in auth-server, adopted by every client via sdk-client.

## Goal

No client stores a replayable secret at rest. The durable credential becomes a
non-extractable ECDSA P-256 private key in IndexedDB (unreadable by JS, unexportable,
never displayed), which signs a server challenge to mint access tokens that live only in
memory and expire in minutes. Reached when: mud-builder-client holds nothing sensitive in
localStorage, every other authed client uses the same sdk-client helper, XSS can obtain at
most one short-lived token and cannot re-enroll, and the CodeQL clear-text-storage alert on
`apps/mud-builder-client/src/api/client.ts` is gone on its merits rather than dismissed.

## Constraints

- **Downstream services must not change.** The minted access token stays an opaque bearer
  that `POST /api/introspect` validates. mud-builder-server, kingdom-tactics-server et al.
  keep their existing bearer + introspect path untouched. This is what makes "all services"
  affordable — do not break it by inventing per-request signatures.
- **Sign only at token mint, not per request.** Full DPoP-style per-request signing would
  force every downstream service to verify signatures, destroying the constraint above. The
  accepted residual risk: a stolen token is replayable until it expires (minutes).
- **Device tokens MUST be audience-scoped, one service each.** The Phase A service-isolation
  rule (`matchesAudience`, services-server/src/auth-introspect-client.ts:92-99) says "a valid
  token for someone else is a refusal". So `assert` takes the target `service` and mints a
  token whose audience is that ONE service, exactly like `mintExchangeToken`. Do NOT mint a
  single token valid everywhere — that silently defeats service isolation.
- No new runtime dependency. WebCrypto and IndexedDB are platform APIs; the nonce store
  follows the in-memory, restart-clears precedent of `login-lockout.ts` and
  `questions-store.ts`'s ChallengeThrottle.
- Ed25519 stays the SERVER-to-server curve (`crypto-primitives.ts`). Browser device keys are
  **ECDSA P-256** — verified Baseline-widely-available since Jan 2020, and the
  CryptoKey-in-IndexedDB `DataCloneError` bugs were Firefox's and are resolved.
- Enrollment MUST require a fresh session login. If XSS can enroll its own keypair using a
  token it just stole, durable theft is re-created with extra steps.
- Break-glass paths stay: mud-builder's local master key and CI API keys must keep working
  for headless/non-browser callers that cannot hold a device key.
- Existing epoch-bump semantics keep working — a password change or rotate-master must still
  invalidate outstanding device tokens.
- **Documentation is part of every step, not a final step.** After each step: update this
  plan's progress log, AND update user/admin documentation whenever a user-visible flow
  changes — `/workspace/shattered-archive/docs/auth-server.md` (user/admin facing, the one
  that gets mermaid), `/workspace/shattered-archive/docs/auth-client.md` if the UI changes,
  and `/workspace/shattered-archive/apps/auth-server/README.md` for operator/dev detail.
  Any changed user flow MUST get a mermaid `sequenceDiagram` in the house style already used
  by docs/mud-builder/README.md:189 — friendly participant names ("You", "Account website"),
  not internal class names, so an admin can read it aloud to a user.

## Context

- Today's credential: `localStorage['mb-token']` via `getStoredToken`/`setStoredToken` at
  /workspace/shattered-archive/apps/mud-builder-client/src/api/client.ts:25-45, attached as
  `Authorization: Bearer` at lines 158-161 and 174-177. Consumed by AccessPage
  (/workspace/shattered-archive/apps/mud-builder-client/src/features/auth/AccessPage.tsx:64,94,101,149,181).
  **`setStoredToken` is called synchronously in 6 test files** — WebCrypto/IndexedDB are
  async, so this is the main refactor friction, not the crypto.
- Token minting + verification all live in one class:
  /workspace/shattered-archive/apps/auth-server/src/key-store.ts — `mintApiKey`,
  `mintSession`, `mintExchangeToken`, and `verify(token, epochLookup)`. `KeyKind` is the
  discriminator; tokens are `randomBytes(32)` base64url, stored as sha256 (line 68-73).
- `POST /api/introspect`
  (/workspace/shattered-archive/apps/auth-server/src/routes/introspect.ts:23-54) returns
  `{valid, accountId, service, label, username, expiresAt, tokenType, globalRole}` where
  `tokenType` is `verified.kind`. A NEW KeyKind flows through this endpoint with no change,
  which is precisely why downstream services need no work.
- Server-side Ed25519 assertion precedent to mirror in shape (compact
  `base64url(payload).base64url(sig)`, hand-rolled, no JWT lib):
  /workspace/shattered-archive/apps/auth-server/src/crypto-primitives.ts:116-138.
- Encrypted-at-rest store base class to extend for the device registry:
  /workspace/shattered-archive/apps/auth-server/src/encrypted-file-store.ts, as used by
  key-store.ts:81-92.
- Downstream consumer that must keep working unchanged — local-first then introspect
  fallback: /workspace/shattered-archive/apps/mud-builder-server/src/routes/auth.ts:100-107,
  helper at /workspace/shattered-archive/services/services-server/src/auth-introspect-client.ts.
- `matchesAudience(result, expectedService)` at
  /workspace/shattered-archive/services/services-server/src/auth-introspect-client.ts:97 is the
  audience guard. PRE-EXISTING GAP (not caused by this work, do not fix silently):
  mud-builder-server's `tryIntrospect`
  (/workspace/shattered-archive/apps/mud-builder-server/src/routes/auth.ts:86) checks only
  `result.valid` and never calls it, so it currently accepts a token minted for ANY service.
  Audience-scoped device tokens are correct regardless; note this gap for a separate fix.
- Shared browser package home: /workspace/shattered-archive/sdks/sdks-client
  (`@shatteredarchive/sdk-client`, resolved workspace package, currently just `src/index.ts`).
  NOTE `@shatteredarchive/services-client` is NOT workspace-resolved — its package.json is
  misplaced inside `src/` so the `services/*` glob misses it. Do not put code there.
- Clients needing adoption: auth-client, mud-builder-client, kingdom-tactics-client,
  web-client, game-client. EXCLUDED: scrum-poker-client (accounts-free by design),
  psd-viewer-client (local dev tool, no auth).
- Edge rate limits added 2026-07-29 live at
  /workspace/shattered-archive/deploy/nginx/edge-subdomains.conf (zones ~line 61-84) and must
  be mirrored in /workspace/shattered-archive/deploy/nginx/includes/tls-dev.conf. `/api/auth/`
  is capped tighter than `/api/`.
- **Safari ITP evicts IndexedDB after 7 days without a click/tap/keystroke on the site**
  (scrolling does not count), so the device key can vanish and the UI MUST handle
  needs-re-enrollment gracefully. Home-screen (installed PWA) first-party domains are exempt
  — relevant to /workspace/shatteredarchive-mobile.

## Steps

### [x] 1. (CLAUDE) auth-server: device registry + a 'device' KeyKind that mints short-lived tokens
- Do: Add `device-store.ts` extending EncryptedFileStore, holding
  `DeviceRecord { id, accountId, publicKeyJwk, label, createdAt, lastSeenAt, revokedAt? }`
  with add/findById/listForAccount/revoke/revokeAllForAccount/touch. Add `'device'` to
  `KeyKind` and a `mintDeviceToken(accountId, service, ttlMs, currentEpoch)` to key-store.ts —
  `service` is the AUDIENCE (see Constraints), ttl SHORT (10 min) — reusing the existing
  sha256+expiry machinery so `verify()` and therefore introspect pick it up with no other
  change. It MUST purge expired device records on mint like `mintExchangeToken` does: a 10-min
  token re-minted per tab is ~144 records/day/tab, and `persist()` rewrites+re-encrypts the
  whole file each time, so without purging the store grows unboundedly and every mint gets
  slower. Wire the store into `deps.ts`/`index.ts`.
- Files: /workspace/shattered-archive/apps/auth-server/src/device-store.ts,
  /workspace/shattered-archive/apps/auth-server/src/key-store.ts,
  /workspace/shattered-archive/apps/auth-server/src/deps.ts,
  /workspace/shattered-archive/apps/auth-server/src/index.ts,
  /workspace/shattered-archive/apps/auth-server/src/device-store.test.ts
- Verify: `pnpm --filter @shatteredarchive/auth-server test` green, including a new test that
  a device token round-trips through `keyStore.verify` and reports `kind === 'device'`, and
  that an epoch bump invalidates it.

### [x] 2. (CLAUDE) auth-server: enroll / challenge / assert routes with single-use nonces
- Do: Add `routes/device.ts` with (a) `POST /api/device/enroll` behind sessionGuard —
  accepts `{publicKeyJwk, label}`, validates it is a P-256 public JWK, returns `{deviceId}`
  and NO secret; (b) `POST /api/device/challenge` — `{deviceId}` returns a single-use
  `{nonce, expiresAt}` with a short TTL from an in-memory store (mirror login-lockout.ts's
  restart-clears posture); (c) `POST /api/device/assert` — `{deviceId, nonce, signature,
  service}`, verifies ECDSA P-256 over a canonical payload binding deviceId+nonce+service via
  node `crypto`, CONSUMES the nonce, touches lastSeenAt, and returns a short-lived access token
  AUDIENCE-SCOPED to `service` (binding the audience into the signed payload is what stops a
  signature for one service being replayed to mint a token for another). Also add
  `GET /api/device` + `POST /api/device/:id/revoke` for management, and revoke all devices on
  epoch bump (password change / reset / rotate-master) so a compromised password cannot leave
  an attacker-enrolled device behind. Register in `app.ts`.
- Files: /workspace/shattered-archive/apps/auth-server/src/routes/device.ts,
  /workspace/shattered-archive/apps/auth-server/src/routes/device.test.ts,
  /workspace/shattered-archive/apps/auth-server/src/app.ts,
  /workspace/shattered-archive/apps/auth-server/src/account-store.ts
- Verify: `pnpm --filter @shatteredarchive/auth-server test` green with tests covering: happy
  path enroll→challenge→assert→introspect-valid; a replayed nonce rejected; a wrong-key
  signature rejected; an expired nonce rejected; enroll without a session 401; and a
  password change invalidating both the token and the enrollment.

### [x] 3. (CLAUDE) sdk-client: device key lifecycle, silent token minting, authedFetch
- Do: In sdk-client add `device-credentials.ts`: `ensureDeviceKey()` get-or-creating a
  non-extractable P-256 keypair (`generateKey(..., extractable=false, ['sign'])`) persisted as
  a CryptoKey in IndexedDB; `enrollDevice()` exporting only the PUBLIC JWK;
  `getAccessToken(service)` returning a memory-cached token **keyed per service audience** or
  running challenge→sign→assert for that audience; and `authedFetch(service, ...)`
  attaching the Bearer and retrying ONCE on 401 by re-minting. Tokens live in memory ONLY —
  never localStorage/sessionStorage. Surface a distinct `NeedsEnrollment` error when the key or
  deviceId is missing (the Safari 7-day eviction path) so UIs can prompt a login instead of
  looking broken. Export from `src/index.ts`.
- Files: /workspace/shattered-archive/sdks/sdks-client/src/device-credentials.ts,
  /workspace/shattered-archive/sdks/sdks-client/src/index.ts,
  /workspace/shattered-archive/sdks/sdks-client/src/__tests__/device-credentials.test.ts,
  /workspace/shattered-archive/sdks/sdks-client/package.json
- Verify: `pnpm --filter @shatteredarchive/sdk-client test` green — assert `exportKey` on the
  private key REJECTS (proving non-extractability), that a second `ensureDeviceKey()` returns
  the same key, that a 401 triggers exactly one re-mint, and that no sensitive value is written
  to localStorage (spy on setItem).

### [x] 4. (CLAUDE) mud-builder-client: adopt the SDK as the reference integration
- Do: Replace `getStoredToken`/`setStoredToken` in `api/client.ts` with sdk-client's
  `authedFetch`/`getAccessToken`, deleting the `mb-token` localStorage read/write and the
  `tokenFallback`. Make the two request helpers await the token. Update AccessPage to an
  "enroll this device" flow (no token paste in the normal path) while KEEPING master-key /
  API-key entry as an explicit break-glass affordance. Handle `NeedsEnrollment` with a
  re-login prompt. Update the 6 test files that call `setStoredToken` synchronously.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/api/client.ts,
  /workspace/shattered-archive/apps/mud-builder-client/src/features/auth/AccessPage.tsx,
  /workspace/shattered-archive/apps/mud-builder-client/src/features/auth/AccessPage.test.tsx,
  /workspace/shattered-archive/apps/mud-builder-client/src/features/engine/EnginePage.test.tsx,
  /workspace/shattered-archive/apps/mud-builder-client/src/features/roles/RolesPage.test.tsx,
  /workspace/shattered-archive/apps/mud-builder-client/src/features/content/SaveAsSnippetButton.test.tsx
- Verify: `pnpm --filter @shatteredarchive/mud-builder-client test` green, and
  `grep -rn "localStorage" apps/mud-builder-client/src` returns no credential write.

### [x] 5. (CLAUDE) Edge rate limits for the new device endpoints, both schemes
- Do: Add a `device_auth` limit_req_zone and apply it to `/api/device/` on
  auth.shatteredarchive.dev in BOTH the :80 and :443 blocks. `challenge`/`assert` are
  unauthenticated by design (a deviceId is not a secret), so they need their own ceiling —
  size it above normal silent re-mint traffic (a token expiring every 10 min is ~6 mints/hour
  per tab) but well under brute-force volume. Keep `limit_req_status 429`.
- Files: /workspace/shattered-archive/deploy/nginx/edge-subdomains.conf,
  /workspace/shattered-archive/deploy/nginx/includes/tls-dev.conf,
  /workspace/shattered-archive/deploy/nginx/.annotated,
  /workspace/shattered-archive/deploy/nginx/includes/.annotated
- Verify: real `nginx -t` through the entrypoint envsubst pass in BOTH
  `NGINX_TLS_INCLUDE_FILE=tls-off.conf` and `tls-dev.conf` (the docker run recipe used on
  2026-07-29), plus a grep proving the directive exists in both files.

### [x] 6. (CLAUDE) Roll out to the remaining authed clients — SCOPE NARROWED TO KT ONLY, see log
- Do: Adopt sdk-client's `authedFetch` in auth-client, kingdom-tactics-client, web-client and
  game-client, removing any local token-at-rest storage each one has. Confirm per client
  whether it authenticates at all before touching it. Explicitly SKIP scrum-poker-client
  (accounts-free) and psd-viewer-client (local tool). Server side must need no change — if a
  service appears to require one, stop and record why in the progress log rather than
  weakening the introspect constraint.
- Files: /workspace/shattered-archive/apps/auth-client/src,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src,
  /workspace/shattered-archive/apps/web-client/src,
  /workspace/shattered-archive/apps/game-client/src
- Verify: each touched package's own test suite green, and
  `grep -rn "localStorage\|sessionStorage" apps/*/src` shows no credential persistence in the
  adopted clients.

### [x] 7. (CLAUDE) Screen-share-safe display for the remaining bootstrap/recovery secrets
- Do: Device enrollment shows no secret, but the break-glass paths still must reveal one once:
  mud-builder's first-run master key and issued CI API keys (`IssuedToken`, client.ts:54 —
  "the only place a plaintext token ever appears"), and auth-server's one-time/temp passwords.
  Add a shared masked-secret component: obscured by default, explicit click-to-reveal, auto
  re-hide on a timer and on blur/visibilitychange, and copy-to-clipboard that never renders the
  value. Apply everywhere a secret is surfaced.
- Files: /workspace/shattered-archive/utils/utils-client/src,
  /workspace/shattered-archive/apps/mud-builder-client/src/features/auth/AccessPage.tsx,
  /workspace/shattered-archive/apps/auth-client/src
- Verify: the new component's unit tests green (masked initially, reveals on click, re-hides on
  timer and on visibilitychange), and a grep audit showing no raw secret rendered directly into
  JSX in the touched files.

## Progress log

- 2026-07-30T01:52:10Z plan created — scope is auth-server core + sdk-client + all authed
  clients + screen-share hardening. Browser support pre-verified: ECDSA P-256 generateKey is
  Baseline widely available (Jan 2020); non-extractable CryptoKey in IndexedDB works in
  Safari (since 11.0.3) and Firefox (DataCloneError bugs resolved, confirmed 2021). Known
  constraint: Safari ITP deletes IndexedDB after 7 days without a click/tap/keystroke;
  installed home-screen PWAs are exempt.
- 2026-07-30T02:05Z step 1 done: device registry + 'device' KeyKind — new `device-store.ts`
  (DeviceStore + `assertValidP256PublicJwk`, which REFUSES a jwk carrying `d` rather than
  stripping it, since an exported private key means the client broke non-extractability);
  `mintDeviceToken(accountId, service, currentEpoch, ttl=10min)` audience-scoped with an
  expired-record purge; wired through deps.ts/index.ts/routes/test-helpers.ts. auth-server
  180/180 tests green (+26), tsc clean. Two things the plan had NOT anticipated, both caught
  by building it: (a) `countForAccount` hardcodes every KeyKind in a `Record<KeyKind, number>`
  initialiser, so adding 'device' was a compile break needing `device: 0`; (b) `listKeys`
  already allowlists `kind === 'api'`, so device tokens are excluded from users' key lists
  with no change. Design decision recorded in code: `revokeAllForAccount` exists so an epoch
  bump kills ENROLLMENTS too, not just tokens — otherwise a password changed because it
  leaked would leave an attacker-enrolled device minting fresh tokens indefinitely.
- 2026-07-30T02:40Z step 2 done: enroll/challenge/assert + device management. auth-server
  215/215 tests green (+35), tsc clean. Design changes made DURING the step, each because
  building it exposed something the plan got wrong:
  (a) **Epoch invalidation replaced the revokeAllForAccount call-sites.** The plan said call
  it from all four epoch-bumping routes. Instead DeviceRecord now stores `enrolledAtEpoch`
  and `lookup()` compares it to the current epoch — the same trick key-store already uses,
  so invalidation is automatic and no future epoch-bumping code has to remember anything.
  revokeAllForAccount survives only as a user-facing "sign out everywhere".
  (b) **`lookup()` returns a REASON** ('unknown'|'revoked'|'stale-epoch') rather than null,
  because the client must distinguish "re-enroll me" from "gone", and an operator reading a
  log must distinguish a benign password change from a deliberate revoke.
  (c) **AuthError gained an optional `code`**, emitted by safe(). Needed for
  DEVICE_REENROLL_REQUIRED; generalizes the hand-rolled `code:'MUST_CHANGE_PASSWORD'`
  session-guard.ts already returned ad hoc.
  (d) **Signed payload is length-prefixed**, not delimiter-joined, so a field containing the
  delimiter cannot shift the framing between two different triples.
  (e) **Nonce is consumed BEFORE signature verification**, so a wrong signature still burns
  it — otherwise a captured nonce is a signature-grinding target.
  Two real gotchas hit and fixed: `crypto.JsonWebKey` is not exported by this @types/node
  (used `Parameters<typeof createPublicKey>[0]` instead, which cannot drift), and WebCrypto
  emits raw r||s while node defaults to DER, so verification MUST pass
  `dsaEncoding:'ieee-p1363'` — the test helper signs that way deliberately, since signing the
  node-default way would have passed against a wrong server and broken every real browser.
  Docs updated per the Constraints: docs/auth-server.md gained a Device-bound credentials
  section with THREE mermaid sequenceDiagrams (enroll / silent everyday use / re-enrollment),
  a before-vs-after table, and the explicit note that the normal flow never displays a secret;
  apps/auth-server/README.md gained an operator section (token churn + purge, memory-only
  nonces, automatic epoch invalidation, the ieee-p1363 gotcha); .annotated updated for
  device-store, device-nonce-store, device.ts/.test.ts, errors.ts, safe.ts, app.ts.
- 2026-07-30T03:10Z step 3 done: sdk-client device-credentials.ts. 17/17 tests green, both
  the build tsconfig and the jest tsconfig clean. Beyond the plan's spec: `subtle`/`storage`/
  `fetchImpl` are all INJECTABLE (the plan only implied IndexedDB) — required because the test
  env has no WebCrypto/IndexedDB, and the same seam makes this reusable from React Native for
  the deferred mobile step. Added in-flight mint COALESCING, which the plan missed and which
  matters: without it a page load firing a dozen requests runs a dozen challenge/assert round
  trips and burns a dozen nonces. Test-infra decisions worth knowing: this package now owns a
  local jest.config.cjs (registered in the root's LOCAL_CONFIG_PACKAGES *and*
  LOCAL_CONFIG_IGNORES per the root config's own "keep new settings in the package config"
  rule; verified via --listTests that it is collected exactly ONCE, no double-run) using
  testEnvironment **node** despite being a `-client` package — the module touches no DOM, and
  Node supplies real TextEncoder/btoa/fetch/Response/WebCrypto where jsdom supplies none of
  them, so this tests real implementations instead of a polyfill stack. jest.setup.cjs
  installs localStorage/sessionStorage TRAPS (not polyfills) purely so the "never persists a
  credential" regression test fails loudly rather than passing vacuously on a missing global.
  Two friction points: TS 5.7 types TextEncoder.encode as Uint8Array<ArrayBufferLike>, which
  BufferSource rejects (could be SharedArrayBuffer-backed) — fixed once at the source by
  narrowing deviceAssertionPayload's return to Uint8Array<ArrayBuffer> rather than casting at
  each call site. The fake auth-server in the tests VERIFIES signatures for real with the
  enrolled public key, deliberately: a fake that just returned a token would let exactly the
  payload-format and r||s-vs-DER bugs through that only bite against real browsers.
  Docs: no user-facing flow changed in this step (the SDK is a library; the flows and mermaid
  diagrams landed in step 2), so documentation was .annotated + .ai-context for sdks-client.
- 2026-07-30T03:35Z step 5 done: `device_auth` zone (120r/m, burst 30) on a new
  `location /api/device/` in BOTH schemes, 8k body cap, 429 status. Sized off real usage — a
  10-min token means ~6 mints/hour/tab, so even a dozen tabs sits far under it. Given its own
  zone rather than inheriting auth_api because challenge/assert are UNAUTHENTICATED by design
  and hit on a timer, so they shouldn't compete with interactive traffic. Real `nginx -t`
  green in both NGINX_TLS_INCLUDE_FILE modes.
- 2026-07-30T03:30Z **step 4 prerequisite done (CORS)** — discovered while starting step 4 and
  worth recording because the plan completely missed it: IndexedDB is ORIGIN-scoped, so a key
  enrolled on auth.* is invisible to build.*, meaning every client origin must enroll its OWN
  key, which makes enrollment a cross-origin *credentialed* call — and auth-server had no CORS
  at all. Resolved without loosening the cookie: the hub subdomains are same-SITE (one
  registrable domain), so the existing SameSite=Lax session cookie is still sent; only CORS
  had to be added. Implemented hand-rolled (no new dep, same call as the hand-parsed cookie in
  session-guard.ts) and mounted ONLY on /api/device, with an exact-match allowlist from a new
  DEVICE_ALLOWED_ORIGINS env var — never a wildcard, since `*` is invalid with credentials and
  reflecting an arbitrary Origin would let a hostile page drive an authenticated enrollment.
  `Vary: Origin` is set even on refusal (a shared cache could otherwise serve one origin's
  allow-header to another). 7 CORS tests incl. proof that non-device endpoints gained no
  headers. auth-server 222/222 green.
- 2026-07-30T12:05Z DEVICE_ALLOWED_ORIGINS now configured (was the open item blocking step 4).
  Values are browser ORIGINS — scheme+host+port, exact string match vs the Origin header;
  whitespace and a trailing slash are tolerated, nothing else. Verified empirically against the
  real parser + matcher: `https://build.shatteredarchive.dev` and a trailing-slash variant
  ALLOW, while `:443`, an http:// scheme, an uppercase host, and a bare hostname all DENY.
  Set: experimental compose = build.shatteredarchive.dev + kingdom-tactics.shatteredarchive.dev;
  prod compose = "" declared EXPLICITLY with a comment, because neither of those clients exists
  in that stack (verified by grep) and an empty deny-all is the correct state there — declaring
  it beats omitting it so the emptiness reads as deliberate; apps/auth-server/.env (tracked, the
  repo's dev convention) = http://localhost:60080,http://localhost:50080 for the two client dev
  servers. auth-client is deliberately absent everywhere: same-origin with auth-server in
  deployment (nginx routes /api/ on that host to it) and via vite's server-side proxy in dev,
  so CORS never applies to it. Both compose files pass `docker compose config` and the resolved
  values were confirmed. Docs updated with a value-format table incl. the two real footguns
  (default ports; localhost vs 127.0.0.1 being different origins while cookies ignore ports —
  which is exactly why dev works at all).
- 2026-07-30T13:20Z step 4 done: mud-builder-client on device credentials.
  mud-builder-client 253/253, mud-builder-server 168/168, compose config OK. `grep localStorage
  apps/mud-builder-client/src` now returns NO code hit — the CodeQL clear-text-storage SOURCE is
  gone, not suppressed.
  Design: TWO credential tiers. Tier 1 = device credentials (everyday). Tier 2 = a manually
  pasted master/API/account key, kept in MEMORY ONLY — that is the change that removes the
  at-rest secret. Break-glass is occasional and explicit (first-run bootstrap, CI, auth-server
  down), so losing it on reload is the right trade; it is NOT a regression to fix by
  re-persisting it.
  Plumbing the plan hadn't anticipated: the browser-facing auth origin cannot come from the
  bundle (this app ships no VITE_ build args — the edge routes relative URLs), so it now comes
  from the SERVER via a new `authPublicUrl` on /api/capabilities, backed by
  AUTH_SERVER_PUBLIC_URL — the same internal-vs-public split kingdom-tactics-server already
  makes. Deliberately has NO fallback to authServerUrl: that is an internal docker alias, and
  handing it to a browser would fail silently rather than cleanly; a test pins that it is
  omitted when unconfigured and that authServerUrl is never exposed. Made the config field
  OPTIONAL rather than adding it to five test literals — the honest type, since unlike
  authServerUrl it has no safe default.
  TWO REAL FAIL-SOFT BUGS found by the tests, both would have hit production:
  (a) `crypto.subtle` exists only in a SECURE CONTEXT, so a non-secure origin made the
  DeviceCredentials constructor throw and probe() swallowed it into a misleading "server
  unreachable" with the page stuck on 'loading'. CORRECTION (2026-07-30, user): an earlier
  version of this note claimed plain http:// on a LAN address was "normal on this stack" —
  that is WRONG. Every service is reached by HOSTNAME through the nginx router over https,
  dev included: the experimental compose already sets NGINX_TLS_INCLUDE_FILE=tls-dev.conf and
  deploy/nginx/certs holds an mkcert cert whose SANs are shatteredarchive.dev AND
  *.shatteredarchive.dev (verified with openssl; valid to 2028-10-15), so
  https://build.shatteredarchive.dev is trusted and IS a secure context. Device credentials
  therefore work in dev exactly as in prod. The guard remains as defence for off-path access
  only. Worth recording precisely because the rule is counter-intuitive: a browser decides
  secure-context from the origin's scheme+HOSTNAME, never from the resolved IP, so a hosts
  entry pointing a name at 127.0.0.1 does NOT make http:// on that name trustworthy.
  (b) no IndexedDB (private mode / blocked storage) made isEnrolled() reject and abort the whole
  access probe. Both now degrade to "don't offer enrolment, use manual entry"; missing IndexedDB
  is treated as unavailable ON PURPOSE, because a key that cannot persist would re-prompt for
  enrolment on every reload — worse than not offering it.
  Test infra: mud-builder-client gained jest.setup.cjs with a WebCrypto polyfill and a ~60-line
  MINIMAL IndexedDB shim (jsdom has neither, and the client correctly refuses device credentials
  without IndexedDB, so the enrolled UI path was otherwise untestable). The shim covers only the
  open/upgrade + get/put/delete surface sdk-client uses and says so; values are held by reference
  so a non-extractable CryptoKey survives exactly as in a browser. Also added a
  sdk-client → src moduleNameMapper (house pattern, matching merc-area) and the workspace dep.
  Notable: the OLD AccessPage test asserted `localStorage.getItem('mb-token') === MASTER`; that
  assertion is now INVERTED to expect null, which is the clearest single marker of what changed.
  Spy on Storage.prototype, not the instance — jsdom's storage methods live on the prototype and
  instance spies silently no-op.
- 2026-07-30T13:55Z step 7 done: MaskedSecret (features/shared/, next to Toast per house
  pattern) + 9 tests; mud-builder-client 261/261 green. Masked by default, COPY WORKS WITHOUT
  REVEALING (so the common path never puts the value on screen at all), auto re-hide after
  15s, and — the case that actually bites — immediate hide on visibilitychange/blur, i.e. when
  you reveal a key then alt-tab to paste it and leave it sitting on a shared view. Fixed-width
  mask so width never hints at length; monospace when revealed so it is transcribable; falls
  back to revealing if the clipboard is denied (insecure context) rather than failing silently.
  Documented explicitly as NOT stopping a screenshot taken while revealed — it narrows the
  window from "until dismissed" to a few seconds of deliberate action. Wired into AccessPage's
  show-once box; the two existing tests that asserted the plaintext was visible now assert it
  is masked and reveal to confirm the value. Added .mb-hint/.mb-masked-secret CSS (neither
  existed). STILL TO DO for full coverage: auth-client's one-time/temp password display and
  mud-builder's first-run master key surface — the component is ready, only wiring remains.
- 2026-07-30T14:00Z step 6 SCOPE FINDING (verified by grep, not assumed): three of the four
  clients need NOTHING. auth-client keeps no credential in web storage (httpOnly session
  cookie), web-client keeps none, and game-client stores only config/user-path — no credential.
  The single real target is kingdom-tactics-client's
  features/auth/authTokenStore.ts ('kt.auth.token' in localStorage), consumed by cloudSync.ts,
  useAccountScreen.ts and written by useAuthCallback.ts after the SSO hand-off. Because that
  token is what keeps a user logged in across reloads, KT needs the FULL step-4 treatment
  (enrol after SSO login, then mint silently) rather than just a storage swap — otherwise every
  reload re-runs the SSO flow. Groundwork already in place: kt-server ALREADY has
  AUTH_SERVER_PUBLIC_URL, and auth-server's DEVICE_ALLOWED_ORIGINS already lists
  kingdom-tactics.shatteredarchive.dev. What remains is kt-server exposing the public auth
  origin to its browser (same capabilities-style plumbing added for mud-builder) plus the
  client-side adoption. NOT started — left unchecked deliberately rather than reported as done.
  CONCRETE HANDOFF for whoever picks this up (all verified by reading, not guessed):
   * kt-server has NO capabilities/config endpoint — one must be added (public GET, e.g.
     /api/kt/config → { authPublicUrl }). readServiceCredentials()
     (apps/kingdom-tactics-server/src/index.ts:27-39) already resolves publicAuthServerUrl from
     AUTH_SERVER_PUBLIC_URL, so the value exists server-side; it is simply never exposed to the
     browser today (SSO start is a server-side redirect, so the client never needed it).
     WARNING: unlike mud-builder's, KT's fallback is `AUTH_SERVER_PUBLIC_URL ?? authServerUrl` —
     do NOT hand that fallback to a browser, since in docker authServerUrl is the internal
     alias. Expose publicAuthServerUrl only when AUTH_SERVER_PUBLIC_URL is explicitly set.
   * Client files: features/auth/authTokenStore.ts ('kt.auth.token'), consumed by cloudSync.ts
     (:31) and useAccountScreen.ts (:21), written by useAuthCallback.ts after the SSO callback,
     re-exported from features/auth/index.ts. useAccountScreen.test.ts uses
     jest.mock('./authTokenStore'), so it will need updating alongside.
   * KT client will need the WebCrypto + IndexedDB jest shims (copy
     apps/mud-builder-client/jest.setup.cjs) and the @shatteredarchive/sdk-client workspace dep
     + a moduleNameMapper entry, exactly as step 4 did.
   * Already done, no action needed: DEVICE_ALLOWED_ORIGINS already lists
     kingdom-tactics.shatteredarchive.dev, and the compose already sets AUTH_SERVER_PUBLIC_URL.
- 2026-07-30T15:10Z Fixed a PRE-EXISTING flake found while verifying, in code this work never
  touched: routes/state.ts computed `ageMs: Date.now() - stat.mtimeMs`, and a file's mtime can
  read marginally AHEAD of Date.now() (filesystem timestamp granularity / clock rounding,
  observed on Windows), yielding a small NEGATIVE age. That failed state.test.ts's
  "returns the snapshot and its age" assertion about 1 run in 6 — measured, not assumed — and
  was also a real API defect, since the client renders ageMs as snapshot freshness. Now clamped
  with Math.max(0, ...). Verified with 8 consecutive targeted runs and 3 full-suite runs, all
  green (168/168).
- 2026-07-30T16:30Z step 6 done: kingdom-tactics adopted. kt-server 39/39, kt-client 91/91,
  compose config OK; whole-program sweep 798 tests green across six packages.
  Server: new UNGUARDED `GET /api/kt/config` → { authPublicUrl }, read straight from
  process.env.AUTH_SERVER_PUBLIC_URL and deliberately NOT from index.ts's publicAuthServerUrl,
  whose `?? authServerUrl` fallback is the internal docker alias — a test pins that the field is
  ABSENT when unconfigured (not guessed) so the client falls back cleanly to SSO-only login.
  No compose change was needed: KT already set AUTH_SERVER_PUBLIC_URL (comment updated to note
  its new second consumer), and DEVICE_ALLOWED_ORIGINS already listed the KT origin.
  Client: new features/auth/deviceCredentials.ts; authTokenStore.ts is now MEMORY ONLY with its
  exported API unchanged so the three consumers didn't churn; cloudSync prefers the device token
  and falls back to the in-memory SSO token; useAuthCallback enrols right after the SSO hand-off
  (the ONE moment an auth-server session cookie is guaranteed — enrolment must cost a real
  sign-in, so there is no later chance to do it silently), best-effort and un-awaited so a
  failure cannot break a login that already worked; useAccountScreen checks device enrolment
  BEFORE the token, without which every returning user would have appeared logged out.
  THREE REAL BUGS found while building, none of them test-only:
  (a) a RACE introduced by making the mount probe async — an in-flight probe could resolve late
  and flip a user who had just been 401'd back to "signed in". Fixed with a
  signedOutAuthoritatively ref that the probe refuses to overrule.
  (b) MY OWN wiring flaw: ensureDeviceCredentials took a fetchImpl but passed it only to the
  config call, so the device endpoints always used the global fetch — an injected fetch would
  have covered one of two paths. Now threaded through.
  (c) sdk-client did `globalThis.fetch.bind(...)` unguarded, so a missing fetch threw "Cannot
  read properties of undefined" which this module's try/catch then MISATTRIBUTED to an insecure
  context. Now a named error saying which capability is missing.
  Test-infra notes for next time: jsdom does not implement secure contexts (isSecureContext is
  false whatever URL you give it), so the setup shim sets it true — matching reality, since these
  apps always run https-by-hostname — and tests wanting the insecure branch override locally.
  TextEncoder had to be added to BOTH clients' shims: enrolment alone never reaches it, only
  minting does, which is why it surfaced late. The IndexedDB shim's store is per-FILE, so tests
  must call __resetIndexedDbShim() in beforeEach or enrolment leaks across tests and order
  decides the outcome.
- 2026-07-30T16:35Z PLAN COMPLETE. All 7 steps done. Final audit: `grep localStorage|sessionStorage`
  across apps/*/src returns only game-client UI state (HUD layout, affects block, a debug flag) —
  no credential is persisted by any client. The CodeQL clear-text-storage findings for
  mud-builder-client and the KT token are resolved at the source, not suppressed.

## Follow-up: security review hardening (2026-07-30)

A post-implementation security review of the whole device-credential flow found two defects
that CHAINED into a cross-service escalation, plus gaps against the "seamless login" goal.
Plan stays COMPLETE — this section records the follow-up work, all of it landed and tested.

- 2026-07-30T18:10Z **Audience was caller-chosen (the main finding).** `POST /api/device/assert`
  took `service` as a free string with no server-side constraint, so a device enrolled from ANY
  origin could mint a token for ANY service — an XSS on the game could mint a Builder token.
  key-store.ts's own comment leaned on `matchesAudience` for isolation, which cannot hold if the
  client names its own audience.
  FIX: `DEVICE_ORIGIN_SERVICES` (`origin=service`, replacing `DEVICE_ALLOWED_ORIGINS`) mirrors
  nginx's origin → upstream routing. The audience is resolved from the `Origin` header at ENROLL
  time and frozen onto the device record (`allowedServices` + `enrolledOrigin`); assert only ever
  checks the requested service AGAINST it. `deviceAllowedOrigins` is now DERIVED from the map's
  keys, so an origin that may enroll always has a defined audience and the two cannot drift.
  Origin is enforced server-side, not via CORS (CORS is advisory; a non-browser client sends no
  Origin). Records predating the binding return a new `stale-binding` lookup reason and re-enroll
  — inferring an audience would be inventing an authorization nobody granted.
  ORDERING NOTE: the audience gate runs AFTER signature verification, deliberately. Checking it
  first turned assert into an oracle answering "what may this device reach" to anyone holding
  only a deviceId — the same enumeration oracle /challenge is written to avoid.
- 2026-07-30T18:10Z **mud-builder-server never checked the audience.** `tryIntrospect` accepted
  any `valid: true`, so a token minted for kingdom-tactics-server — or auth-server's own 24h
  `auth-web` browser session — was a full Builder write credential. KT had it right
  (index.ts:69); the builder was the only consumer opting out of the Phase A rule.
  FIX: `matchesAudience` in `tryIntrospect`, plus the diagnostic `/api/auth/introspect-check`
  now reports `audienceMatches`/`expectedService` so a diagnostic and a real request cannot
  disagree. Two regression tests (foreign service, auth-web session).
  Not remotely exploitable at the time: the builder sets no CORS on its write surface, so a
  cross-origin preflight failed. Fixed anyway — being saved by an unrelated missing header is
  not a control.
- 2026-07-30T18:10Z **In-service rate limits** (`rate-limit.ts`), stated in nginx's own units
  (rate + burst) so the two tiers are comparable. nginx stays PRIMARY: burst is set wider here
  (40 vs the edge's 30) so the edge always sheds first and this only fires for traffic that
  bypassed it. Adds a per-DEVICE limit, which nginx cannot express at all ($binary_remote_addr
  is the only key a zone has).
  Found by its own test: `sweep()` compared STALE token counts, so a flood key touched once and
  never again was never swept — defeating the memory bound in exactly the scenario it exists
  for. Now recomputes the current level before comparing.
- 2026-07-30T18:10Z **CSP + origin gating** across both TLDs: `includes/security-headers.conf`
  (SPA) and `security-headers-api.conf` (JSON hosts), included in every server block of BOTH
  edge-subdomains.conf and tls-dev.conf. `script-src 'self'` verified safe — no app's index.html
  has an inline script. `style-src` keeps 'unsafe-inline' because React renders `style=`
  attributes. `connect-src` covers the auth hub for every app, including the .com ones.
  nginx gotcha handled: `add_header` does NOT merge across levels, so the locations that declare
  their own (`/data/`, `/healthz`) re-include the file or they would silently lose everything.
  Validated by rendering the template in the live container and running `nginx -t`.
  INCIDENTAL FINDING: the running nginx container's rendered config PREDATES the auth/builder
  limit_req zones while includes/ is live-mounted, so `nginx -s reload` would already have failed
  ("zero size shared memory zone builder_api"). Left the container holding a freshly-rendered,
  valid config; NOT reloaded (that is a deploy decision).
- 2026-07-30T18:10Z **Seamless login, no pasted key.** The Builder now enrols from its access
  probe: a user with a hub session is bound silently, with no prompt and nothing to copy. With no
  session it offers a `?returnTo=` link to the hub login that lands them back already set up.
  auth-client gained `useReturnTo` — validated against auth-server's OWN configured origins via a
  new public `GET /api/device/origins`, never a second hand-kept list, because an unvalidated
  returnTo is a textbook open redirect. Exact-origin match (scheme+host+port); lookalike hosts,
  scheme/port changes, relative paths and `javascript:`/`data:` URLs all refused. Hand-back only
  from a FULLY onboarded session, so it cannot skip a forced password change.
  Also: session cookie gained `Secure` (it had `HttpOnly; SameSite=Lax` only).
- 2026-07-30T18:10Z **Entitlement tier, OFF by default.** `DEVICE_GRANT_REQUIRED_SERVICES` makes
  a service require an active API key on the account before a device may mint for it — turning
  the API key into the grant record (managed in auth-client, never pasted) while the device key
  authenticates. Checked at MINT time so a revocation lands on the next ~10-minute renewal.
  Left EMPTY in both composes deliberately: enabling a service instantly refuses every account
  without a key for it, and kingdom-tactics-server must stay open to any signed-in player.
  mud-builder-server is the intended candidate — one-line flip, operator's call.
- 2026-07-30T18:10Z KNOWN LIMIT, documented: a `.com` origin is cross-SITE to the `.dev` hub, so
  the SameSite=Lax session cookie is never sent and cookie-based enrollment cannot work there at
  all. That is a cookie limit, not a CORS one — no allowlist entry fixes it; such an app needs
  the SSO code flow. Listing a `.com` origin would look correct until the first enrollment 401s.
- 2026-07-30T18:10Z STILL OPEN (unchanged by this pass): there is no device-management UI. The
  endpoints (list/revoke/revoke-all) exist and are tested, but auth-client has no `device`
  surface, so a user cannot see or revoke their own enrolled devices; the only lever is a
  password change, which bumps the epoch and drops all of them. With the grant tier above,
  revoking the service's API key is now a second lever (per-service, all devices).
- 2026-07-30T19:35Z CLOSED — device-management UI shipped. New
  `auth-client/src/features/devices/DevicesPanel.tsx` (list with label/audience/enrolled/last-used,
  per-device Revoke, Revoke-all, revoked tombstones collapsed behind a toggle), rendered INSIDE
  KeysPage rather than as its own nav section — keys and devices are different axes of one
  question (key = per-service across devices; device = per-browser across services) and a user
  choosing between them needs both on screen. Nav item renamed "API keys" → "Keys & devices";
  `api.listDevices/revokeDevice/revokeAllDevices` added; 7 new tests (auth-client 39 → 46).
  Two deliberate non-features, both explained in the UI text: no "this device" badge (the key
  lives in the ENROLLING origin's IndexedDB, which the hub cannot read, so it would be a guess),
  and a lost-laptop caveat pointing at the password change — a thief holds the browser's live
  hub session too and silent enrolment would just re-bind moments after a revoke.
