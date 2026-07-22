# Plan: Centralized auth service — Phase 1 (auth-server core: accounts, keys, introspection)

Created: 2026-07-19T12:40:00-0500 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Build `apps/auth-server` — a new, self-contained centralized login service that all other
Shattered Archive apps (game-client, kingdom-tactics, mud-builder, the C# DSL/Server, etc.) will
eventually validate bearer tokens against. This service does nothing by itself: it only manages
accounts and issues/validates per-service API keys mapped back to one master account identity.

> DELEGATION / OWNERSHIP — READ FIRST
> This is new security-critical infrastructure (password storage, at-rest encryption, session
> issuance, asymmetric service-to-service auth, anti-bot signup gating). Steps 2-9 are tagged
> **(CLAUDE)** — they need real judgment and must not go to qwen. Step 1 is pure boilerplate
> scaffolding mirroring an existing package exactly and is tagged **(QWEN-SAFE)**, but per the
> "qwen runs in container, never mutate node_modules" rule its box stays UNCHECKED until a HOST run
> of `pnpm install`/`pnpm build` confirms it — qwen transcribes the files, the host verifies.
> - **Verification is a HOST (Claude/human) task** throughout: `pnpm --filter
>   @shatteredarchive/auth-server build|test`.
> - Exactly ONE ACTIVE plan doc per repo — check no other `.ai-plans/*.md` is `Status: ACTIVE`
>   before starting; if one is, that's a stale pointer to fix, not a reason to skip this doc.
> - **This is Phase 1 of 2 — scope widened this session to include deploy wiring.** Originally Phase 1
>   was server-code-only; the user asked to fold in `deploy/auth-server.Dockerfile`, an `auth-server`
>   service in BOTH `deploy/docker-compose.yml` and
>   `deploy/docker-compose.shattered-archive-experimental.yml`, and an nginx server block, so
>   `auth-server` is actually deployable at the end of this plan (see new step 9). Phase 2 now covers
>   only `apps/auth-client` UI, its Dockerfile/nginx conf, and ONE example consumer integration
>   (recommend mud-builder-server calling `/api/introspect`) — a SEPARATE follow-up plan, created only
>   after this one reaches `Status: COMPLETE`. Do not scope-creep Phase 2 work into this doc.
> - **10 steps, above the usual 2-7 guidance.** Justified: 9 of 10 steps are CLAUDE-owned, so the
>   "size steps for a 32k-context qwen model" rationale behind that cap doesn't bind here, and the
>   crypto/store work is tightly coupled enough that splitting further would fragment single
>   reviewable units (e.g. account-store and its temp-password script must land together).

## Goal
`apps/auth-server` exists as a working Express service with: **username-based** open self-serve
signup gated by a DSL-knowledge anti-bot challenge (three random questions drawn from an
operator-populated pool, all answered correctly, case-insensitive) — no email required. Signup
issues a cryptographically random one-time password the user must write down; both that password
and any operator-issued temporary password (minted via a host-run script, never an HTTP route)
force a mandatory password change on next login before anything else is usable. Users may
optionally attach and verify an email address after logging in, usable only for password recovery
(no 2FA in this phase). Changing a password — self-service or via the forced first-login flow —
invalidates every previously issued API key and session for that account, using the same
epoch-counter mechanism as an explicit "rotate master key" action. Per-service API keys support an
optional expiration date (anything from a short window up to no expiration at all). All JSON
stores (accounts, keys, the question pool, the service-key registry) are encrypted at rest with
AES-256-GCM under a key supplied externally via environment, never co-located with the ciphertext.
The server-to-server `/api/introspect` endpoint is gated by a per-service Ed25519 keypair (not a
shared secret): each consuming service signs a short-lived request assertion with its own private
key, and the auth-server verifies it against a registry of trusted public keys that supports
multiple concurrently valid keys per service so rotation never causes an outage. Done when `pnpm
--filter @shatteredarchive/auth-server build` and `test` both pass on the host and every route in
the Goal is covered by a test.

## Constraints
- **pnpm only**, `--frozen-lockfile` semantics respected; no exotic package sources (registry only).
  `minimum-dep-age=86400` is enforced automatically by pnpm — no special handling needed.
- **No new native/build-script dependencies, and as of this amendment, no new dependencies at
  all.** Password hashing uses Node's built-in `crypto.scrypt`; at-rest encryption uses Node's
  built-in `crypto` AES-256-GCM; service-to-service auth uses Node's built-in `crypto` Ed25519
  keygen/sign/verify. `nodemailer` remains the one exception (recovery email only now, see step 8)
  — still registry-only, no native build script.
- **No database.** JSON file store only (now encrypted-at-rest envelopes, still JSON-shaped before
  encryption), matching every other service in this repo's file-based philosophy. Real
  concurrency/scale ceiling from single-writer-at-a-time tmp+rename writes — acceptable at this
  project's scale, documented in each store's header comment. Do not swap to SQLite/Postgres here.
- **Open self-serve signup, username-based, no email required.** Gated by the anti-bot knowledge
  challenge (three questions, operator-populated pool, ALL must match case-insensitively after
  trim/whitespace-collapse normalization — this was already the design and needs no change).
  **Consequence to document, not silently paper over:** an account with no verified email on file
  has NO self-service password-recovery path if the password is forgotten — only the operator,
  via the host-run temp-password script, can restore access. This is an accepted product tradeoff
  of "email not required," not a gap to fix.
- **isHumanScore is explicitly OUT of this server, by design — not deferred, excluded.** Per the
  user's decision: any behavioral-signal scoring (mouse movement, keystroke timing, touch, keyboard
  navigation) is computed and consumed ENTIRELY client-side in the future Phase 2 UI. It is never
  transmitted to, logged by, or read by `apps/auth-server`. This is what keeps this service fully
  compliant with `.github/copilot-instructions.md`'s "Do not introduce telemetry, tracking, or
  hidden network calls" rule with no exception needed — the server simply never receives this data.
  Do not add a `telemetry`/`isHumanScore` field to any request body, store record, or log line in
  this plan. (Acknowledged tradeoff, stated by the user: this makes the challenge easier for a
  targeted/bespoke bot to pass, since it only has to answer 3 questions; the intent is to filter out
  generic bots wandering the internet, not a determined targeted attacker.)
- **Master rotation = epoch bump, not a distinct secret.** Every account has an integer `epoch`
  (starts at 0). Every key record (API key OR session) stores `mintedAtEpoch`. A key/session only
  verifies if `mintedAtEpoch === account.epoch`. Two independent triggers now bump the same epoch:
  (a) `POST /api/account/rotate-master` (explicit, "I think a key leaked, my password is fine"),
  and (b) any successful password change (self-service OR the forced first-login change) — a
  changed password means every previously issued credential dies too, no exceptions.
  - **Corollary the code must get right, for BOTH triggers when the caller has an active session:**
    the action also invalidates the caller's OWN current session (it was minted at the old epoch).
    The route must mint a **fresh** session at the new epoch before responding, or the user would
    immediately appear logged out right after the action that was supposed to keep them logged in.
    (This corollary does NOT apply to the emailed password-RESET flow — that caller never had a
    session to begin with; they must log in fresh with the new password.)
- **Forced password change scope (Claude's call, flag if you want this different):** BOTH the
  system-issued initial signup password AND any operator-issued temp password set
  `mustChangePassword: true`. While set, every route EXCEPT `GET /api/auth/me`, `POST
  /api/account/change-password`, and `POST /api/auth/logout` is rejected (403, clear reason code).
  Rationale: one flag, one enforcement path, for "you're using a password the system generated, not
  one you chose" — same logic applies whether that happened at signup or via operator recovery.
- **API keys get an optional expiration**, `expiresAt: string | null` (`null` = no expiration,
  "forever" is explicitly allowed). Offer GitHub-token-like presets at the route layer (e.g. 7 / 30
  / 60 / 90 / 365 days, a custom date, or no expiration) — the store itself just persists whatever
  ISO date or `null` it's given and enforces it in `verify()`.
- **Permissions/scopes are explicitly OUT of scope for Phase 1**, but the schema must not need a
  breaking migration to add them later: reserve an unused, always-empty `permissions?: string[]`
  field on the API key record now. The eventual design (noted for continuity, not built here): a
  per-service permission set attachable to a key, keyed off the account/profile id, with room for
  user-group-level assignment later.
- **Sessions ARE key records**, not a separate mechanism. A login mints a short-lived (e.g. 24h TTL)
  key record with `service: 'auth-web'`, `kind: 'session'`, delivered via an httpOnly, `SameSite=Lax`
  cookie. One verification path (`keyStore.verify`) for both browser sessions and service API keys.
  Do not add `express-session`/`cookie-session` or a JWT library.
- **At-rest encryption: AES-256-GCM, key supplied externally (Claude's call per the user's chosen
  option).** Every JSON store (accounts, keys, service-key registry) is written as an
  encrypted envelope (`{iv, authTag, ciphertext}`, all base64) via one shared helper, never as plain
  JSON. **Exception, resolved during implementation (see step 5 and the Progress log): the anti-bot
  questions pool is deliberately plain JSON, not encrypted** — its own step-5 text requires it to be
  directly hand-editable on the host with a text editor, mtime-reloaded live, "same operational model
  as `builder-auth.json`/`skills.dat`" (neither of which is encrypted either); an operator cannot
  hand-edit ciphertext, so encrypting this one file would defeat the requirement that defines it. The
  32-byte data-encryption key for the stores that ARE encrypted comes either from an env var
  (`DATA_ENCRYPTION_KEY`, 64 hex
  chars, local dev/test) or a mounted file (`DATA_ENCRYPTION_KEY_FILE`, self-generated on first boot
  if absent, deploy-time default per the user's follow-up request — see step 9) — NOT generated by or
  stored inside the `auth-server-data` store itself, and not baked into the container image. **Be
  precise about the actual threat model this covers, in the code comments and this doc: it protects
  a stolen DISK IMAGE OR BACKUP FILE taken without the key. It does NOT protect against a full host
  or running-process compromise** — an attacker with code execution on the box can read the env var
  or just ask the running service, same as any at-rest scheme on a single host that must decrypt its
  own data unattended. "Perfect forward secrecy" (protecting past communications after a later
  key-exchange-partner compromise) does not apply here and must not be claimed anywhere in code or
  docs — there is no key exchange between two parties, just one process encrypting its own data.
  Fail fast at boot (not silently) only if neither source yields a usable key (see step 2's
  `loadDataKey()` precedence).
- **`/api/introspect` is server-to-server, gated by per-service Ed25519 keys, not a shared secret
  (Claude's call per the user's chosen option).** Each consuming service holds its own private key
  (conventionally at `shattered-service.key` on that service's host, path overridable via
  `SERVICE_PRIVATE_KEY_PATH`) and signs a short-lived assertion on every introspect call; the
  auth-server verifies against a registry of currently-trusted PUBLIC keys per service name. Never
  reachable via a browser session cookie alone. See step 6 for the full mechanism.
- **`shattered-service.key` (and the auth-server's own service-key registry file) must never be
  committed** — add the exact filename pattern to root `.gitignore`.
- **Plaintext secrets (passwords, API key tokens, temp passwords) are shown exactly once** in the
  relevant response — never logged, never re-derivable. Only hashes are persisted.
- **Port: no numeric "allowed range" exists anywhere in this repo (verified this session)** — only
  `deploy/scripts/firewall-open-ports.ps1`/`.sh`, which allowlist explicit HOST firewall ports
  (`prod`: 80/443 only; `dev`: optional 30080/40080 for LAN Vite access). No app server (game-server
  31000, web-server 41000, mud-builder-server 61000) is ever host-firewalled — they're reached only
  through nginx's internal Docker network. `auth-server` follows the identical pattern: `expose`d
  internally only, never `ports:`-published, at **62000** (see the port-numbering Context bullet
  below for why — the naive next slot, 71000, is not a valid TCP port at all).
- **No C# integration, no client UI in this plan** — Phase 2 (see header). Docker/compose/nginx
  wiring for `auth-server` itself IS in this plan (step 9) — scope widened this session; the service
  must be deployable even though nothing has a UI to reach it yet.

## Context — verified this session (exact)
- **Reference implementation to mirror the PERSISTENCE mechanics of (not the single-operator model,
  not the plaintext-on-disk part — that's superseded by the encryption requirement above):**
  `apps/mud-builder-server/src/auth-store.ts` — atomic `tmp` + `fs.renameSync` writes, mtime-based
  reload-without-restart, a corrupt file LOCKS the store rather than silently regenerating it.
  `apps/mud-builder-server/src/routes/auth.ts` shows the route-layer pattern: a `safe()` wrapper
  mapping a typed `AuthError{message,status}` to the HTTP response, `express.json({limit:'64kb'})`
  scoped per-subpath (never one app-wide body parser).
- **House Node stack** (`apps/web-server/package.json`): `"type":"module"`, `express@^5`, scripts
  `build: tsc -p tsconfig.json`, `dev: tsx src/index.ts`, `start: node dist/index.js`, `test: jest
  --config ../../jest.config.cjs --runInBand --rootDir .`, workspace deps
  `@shatteredarchive/utils-server` / `types-server` / `utils-global` / `services-server`, `winston`,
  `dotenv`.
- **`.github/copilot-instructions.md` explicitly bans telemetry/tracking/hidden network calls** —
  this is why isHumanScore is scoped entirely client-side (Constraints above); the server-side
  design as written needs no exception to that rule.
- **No documented port range and no existing mailer** — confirmed via search this session (see
  Constraints' port bullet; no `nodemailer`/SMTP references anywhere in source or `pnpm-lock.yaml`
  before this plan).
- **`jwt-secret.dat` appears ONLY in root `.gitignore`**, with zero references anywhere else in the
  repo — a reserved-but-unused entry, NOT an existing JWT/crypto convention to mirror. Node's
  built-in `crypto` module (confirmed available: `scrypt`, `createCipheriv`/`createDecipheriv` for
  AES-GCM, `generateKeyPairSync`/`sign`/`verify` for Ed25519) covers everything this plan needs
  without inventing anything or adding a dependency.
- **Client-side reference for the eventual Phase 2 UI** (not built in Phase 1, noted for
  continuity): `apps/mud-builder-client/src/features/auth/AccessPage.tsx` — token-status state
  machine, show-once token display, React 19 + Vite + `@vitejs/plugin-react-swc`.
- **Port numbering convention — CORRECTED this session (was wrong, see Progress log).** Verified
  against every app's actual `.env`: the scheme is `<digit>0080` (client dev) / `<digit>1000`
  (server) — game=**3** (30080/31000), web=**4** (40080/41000), kingdom-tactics=**5**
  (50080/51000, reserved not deployed), mud-builder=**6** (61000; no client dev-port `.env` found
  for `mud-builder-client`). **TCP ports only go up to 65535** — digit **7** would be 70080/71000,
  and both exceed that ceiling entirely; they are not valid ports, not merely "outside policy." The
  single-digit scheme has no room left after 6. **Auth service instead takes 62000** (server) /
  **62080** (client dev port, for Phase 2) — the next free pair inside mud-builder's already-used
  60000s block (60080-65535 has room for a few more service pairs at 62/63/64/65 before the ceiling
  is hit again; a genuinely new numbering scheme is needed after that, not this plan's problem).
- **Test co-location convention**: `*.test.ts` next to the source file, root `jest.config.cjs`
  aggregator — `apps/mud-builder-server/src/routes/auth.test.ts` is the closest structural analog.

## Steps

### [x] 1. (QWEN-SAFE — box stays unchecked until HOST build verify) auth-server workspace scaffold
- Do: Create the new workspace package, mirroring `apps/web-server` except for naming/port:
  - `apps/auth-server/package.json`: name `@shatteredarchive/auth-server`, `"type":"module"`, same
    scripts as `web-server` (`build`,`test`,`format`,`dev`,`start`), dependencies `express@^5`,
    `dotenv`, `winston`, `nodemailer`, workspace deps `@shatteredarchive/utils-server`,
    `types-server`, `utils-global` (only if actually used).
  - `apps/auth-server/tsconfig.json`: copy `apps/web-server/tsconfig.json` verbatim.
  - `apps/auth-server/.env` + `.env.example`: `PORT=62000`, `DATA_DIR=./data`,
    `DATA_ENCRYPTION_KEY=` (LOCAL DEV override only — document the generation command:
    `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, must be exactly 64
    hex chars), `DATA_ENCRYPTION_KEY_FILE=` (deploy path — the file a mounted secret volume provides;
    see step 9. Blank/commented for bare local dev, where the env var above is used instead),
    `SERVICE_PRIVATE_KEY_PATH=` (unused by auth-server itself — documented here only because it's the
    convention Phase 2 consumers will read; leave blank/commented), `SMTP_HOST=` (blank = console
    mail transport), `PUBLIC_ORIGIN=http://localhost:62080`.
  - `apps/auth-server/src/index.ts`: minimal Express bootstrap — `app.get('/health', ...)` →
    `{status:'ok'}`, `app.listen(PORT)`, winston logger setup mirroring `web-server`'s. Boot must
    FAIL FAST (non-zero exit, clear log message) only if `loadDataKey()` (step 2) cannot produce a
    usable key at all — i.e. neither `DATA_ENCRYPTION_KEY` nor a readable/creatable
    `DATA_ENCRYPTION_KEY_FILE` is available. Do not start serving requests with a broken/absent
    encryption key.
  - `apps/auth-server/src/config.ts`: typed env accessor (PORT, DATA_DIR, DATA_ENCRYPTION_KEY,
    DATA_ENCRYPTION_KEY_FILE, SMTP_*, PUBLIC_ORIGIN), following
    `apps/mud-builder-server/src/config.ts`'s pattern.
  - Add to root `.gitignore`: `apps/auth-server/data/` (all per-app JSON stores live here) and the
    exact pattern `shattered-service.key` (private key files consuming services will hold in
    Phase 2 — reserved now so nobody accidentally commits one later).
  - Add `apps/auth-server` to the root `jest.config.cjs` `projects` + `ignores` per the established
    per-package-jest-config convention (add `apps/auth-server/jest.config.cjs` if the convention
    requires a local one; fixtures resolved via `__dirname` never `cwd`).
- Files: `apps/auth-server/package.json`, `tsconfig.json`, `.env`(`.example`), `src/index.ts`,
  `src/config.ts`, `apps/auth-server/jest.config.cjs` (if needed), root `jest.config.cjs`,
  `.gitignore`.
- Verify (HOST): `pnpm install --frozen-lockfile` resolves cleanly (no native build prompts from
  `nodemailer`); `pnpm --filter @shatteredarchive/auth-server build` succeeds; running `dev` WITHOUT
  `DATA_ENCRYPTION_KEY` set fails fast with a clear error; with a valid key set, `GET /health` on
  port 62000 returns `{status:'ok'}`. Box + Progress log only after this HOST check passes.

### [x] 2. (CLAUDE) crypto-primitives.ts — AES-256-GCM at-rest envelope + Ed25519 helpers
- Do: Create `apps/auth-server/src/crypto-primitives.ts`, the shared foundation every store and the
  service-key mechanism build on:
  - `encryptJson(data: unknown, key: Buffer): EncryptedEnvelope` / `decryptJson<T>(envelope, key):
    T` — AES-256-GCM via `crypto.createCipheriv`/`createDecipheriv`, a fresh random 12-byte IV per
    write (never reused), the GCM auth tag persisted alongside so tampering is detected (decrypt
    throws on a bad tag — treat exactly like `auth-store.ts`'s "corrupt file locks the store"
    behavior, do not silently fall back to empty state).
  - `loadDataKey(): Buffer` — precedence order: (1) if `DATA_ENCRYPTION_KEY` env var is set, validate
    64 hex chars and use it (local dev / test / an operator who manages the key externally by their
    own means); (2) else if `DATA_ENCRYPTION_KEY_FILE` is set, read that file, validate its contents
    are 64 hex chars, and use it; (3) else if `DATA_ENCRYPTION_KEY_FILE` is set but the file does not
    exist yet AND its parent directory does (first boot against a fresh mounted volume — see step 9),
    self-generate `crypto.randomBytes(32).toString('hex')`, write it via the same atomic
    tmp-then-`fs.rename` pattern `auth-store.ts` uses for JSON writes, `fs.chmod` it `0o600`, log ONE
    boot line noting a new encryption key was generated at that path (never log the key value
    itself), and use it; (4) else throw a clear error (this is what step 1's boot fail-fast calls).
    Case (3) is deliberately analogous to mud-builder's `builder-auth.json` self-generate-on-first-run
    precedent, scoped to just this one key file.
  - `generateServiceKeypair(): { publicKeyPem, privateKeyPem }` via
    `crypto.generateKeyPairSync('ed25519', ...)`, PEM-encoded for easy file storage/copy-paste.
  - `signAssertion(payload: object, privateKeyPem: string): string` / `verifyAssertion(compact:
    string, publicKeyPem: string): object | null` — compact `base64url(payloadJson) + '.' +
    base64url(signature)` format (JWT-shaped but hand-rolled, no JWT library). `crypto.sign(null,
    Buffer.from(payloadJson), privateKeyObject)` / `crypto.verify(null, ..., publicKeyObject,
    signatureBuffer)` — Ed25519 needs no digest algorithm argument.
- Files: `apps/auth-server/src/crypto-primitives.ts`.
- Verify (HOST): covered by step 10's tests (round-trip encrypt/decrypt, tampered-ciphertext
  rejection, sign/verify round-trip, verify rejects a signature from a DIFFERENT keypair). Box once
  those pass.

### [x] 3. (CLAUDE) account-store.ts — username accounts, one-time passwords, epoch, optional email
- Do: Create `apps/auth-server/src/account-store.ts`, persisted via step 2's `encryptJson`/
  `decryptJson` (atomic tmp+rename write of the encrypted envelope, mtime-cache-or-reload, a
  corrupt/undecryptable file LOCKS the store):
  - Record shape: `{ id, username, usernameNormalized (lowercased, for lookup), passwordHash (hex),
    passwordSalt (hex), epoch (number, starts 0), mustChangePassword: boolean, createdAt,
    email?: string, emailNormalized?: string, emailVerifiedAt?: string, pendingEmail?: { email,
    tokenSha256, expiresAt }, pendingPasswordReset?: { tokenSha256, expiresAt } }`.
  - Password hashing: `crypto.scrypt(password, salt, 64)` (promisified), random 16-byte salt per
    account; `hashPassword`/`verifyPassword` using `crypto.timingSafeEqual`.
  - `createAccount(username, password)`: rejects duplicate `usernameNormalized`. `password` here is
    ALWAYS the system-generated one-time password (see route step for generation — the route, not
    this store, owns "how a password is chosen/generated"; this function just hashes+stores
    whatever it's given and sets `mustChangePassword: true`).
  - `changePassword(accountId, newPasswordHash+Salt)`: sets the new hash/salt, clears
    `mustChangePassword`, calls `rotateEpoch` internally (password change ALWAYS bumps epoch — see
    Constraints). Used by both the self-service change-password route and the reset-password route.
  - `rotateEpoch(accountId)`: `epoch += 1`, persist, return the new epoch. (Also called directly by
    the standalone rotate-master route, independent of a password change.)
  - `requestEmail(accountId, email)`: sets `pendingEmail` with a verification token (sha256 stored,
    plaintext returned once for the mailer), does NOT touch `email`/`emailVerifiedAt` yet.
  - `verifyEmail(accountId, token)`: on match+not-expired, promotes `pendingEmail.email` to
    `email`/`emailNormalized`, sets `emailVerifiedAt`, clears `pendingEmail`.
  - `requestPasswordReset(username)`: if the account exists AND has a verified email, sets
    `pendingPasswordReset` (sha256 + TTL e.g. 1h) and returns `{email, token}` (plaintext once, for
    the mailer) — returns `null` otherwise. **The ROUTE layer must respond identically either way**
    (generic "if that account can receive a reset link, one was sent") to avoid a
    username/email-enumeration oracle; the store's honest `null` return is what lets the route do
    that without lying to itself.
  - `resetPassword(token, newPasswordHash+Salt)`: validates `pendingPasswordReset` across all
    accounts (or looked up by an index — implementation detail), not-expired, applies via the same
    `changePassword` path, clears `pendingPasswordReset`.
  - `findByUsername`, `findById`, `require(id)` (typed `AuthError`, duplicated locally rather than
    cross-imported from `mud-builder-server` to avoid an awkward cross-app dependency).
  - **Host script** `apps/auth-server/scripts/issue-temp-password.ts`: takes a username argument,
    generates a cryptographically random one-time password via
    `crypto.randomBytes(18).toString('base64url')` (24 chars, URL-safe, never an arbitrary/typed-in
    value), calls the SAME internal path `createAccount` uses to hash+store it (sets
    `mustChangePassword: true`), and prints the plaintext password to the console EXACTLY ONCE —
    never written to any log file. Wire a `pnpm --filter @shatteredarchive/auth-server temp-password
    -- <username>` script entry.
- Files: `apps/auth-server/src/account-store.ts`, `apps/auth-server/scripts/issue-temp-password.ts`,
  `package.json` script entry.
- Verify (HOST): covered by step 10. Box once those tests pass.

### [x] 4. (CLAUDE) key-store.ts — API keys (with expiration) AND sessions as one record type
- Do: Create `apps/auth-server/src/key-store.ts`, encrypted at rest via step 2:
  - Record shape: `{ id, accountId, service (string label), kind: 'api' | 'session', label,
    sha256, mintedAtEpoch, createdAt, expiresAt?: string | null (api: user-chosen, up to null =
    forever; session: always set, short TTL), permissions?: string[] (reserved, always empty in
    Phase 1), revokedAt?: string }`.
  - `mintApiKey(accountId, service, label, expiresAt: string | null)`: stamps current
    `mintedAtEpoch`, persists, returns `{id, token}` (plaintext once).
  - `mintSession(accountId, ttlMs = 24h)`: `kind:'session'`, `service:'auth-web'`, `expiresAt = now +
    ttlMs`.
  - `verify(token)`: sha256-match + `timingSafeEqual` (length-guarded) + not revoked + not expired
    (now checked for BOTH `kind`s, not just sessions — an expired API key must stop working exactly
    like an expired session) + `record.mintedAtEpoch === account.epoch` → `{accountId, keyId,
    service, label, kind}` or `null`.
  - `listKeys(accountId)`: excludes session-kind records, never returns `sha256`.
  - `rotateKey(id, accountId)` / `revokeKey(id, accountId)`: ownership-checked (404, not 403, for a
    key belonging to someone else).
  - Persistence: separate encrypted file from accounts (`auth-keys.json`) so the two stores don't
    contend on the same file lock.
- Files: `apps/auth-server/src/key-store.ts`.
- Verify (HOST): covered by step 10. Box once those tests pass.

### [x] 5. (CLAUDE) questions-store.ts — anti-bot signup challenge pool
- Do: Create `apps/auth-server/src/questions-store.ts`, backed by a **plain (unencrypted) JSON**
  hand-edited file at `<DATA_DIR>/dsl-questions.json` (operator edits directly on the host with a text
  editor, same operational model as `builder-auth.json`/`skills.dat` — neither of which is encrypted
  either; picked up live via mtime check, mirroring `auth-store.ts`'s cache-or-reload). Deliberate
  exception to the Constraints' blanket at-rest-encryption rule — see that bullet and the Progress log
  for why: an operator cannot hand-edit ciphertext, so encrypting the one file defined by "directly
  hand-editable" would be self-defeating.
  - Question record shape: `{ id, prompt, acceptedAnswers: string[] }`. Matching is normalized
    (trim, lowercase, collapse internal whitespace) then exact-matched against any accepted answer
    — this normalization IS the case-insensitivity requirement, already satisfied by this shape, no
    further change needed there.
  - Ship a tracked example file `apps/auth-server/dsl-questions.example.json` (2-3 obviously-fake
    placeholder Q&A, same plain JSON shape as the real file) as a copy-and-edit template — the
    operator copies it to `<DATA_DIR>/dsl-questions.json` and replaces the placeholders with real
    questions. Both files are unencrypted, so "example" here just means "starter content," not a
    format difference from the real one.
  - In-memory-only (not persisted, not encrypted — nothing sensitive) single-use challenge-instance
    store: `{ challengeId, questionIds: [3 random ids], expiresAt (now+10min), used: boolean }`.
    `issueChallenge()` → `{challengeId, prompts}` (prompts only, never answers). `verifyChallenge`
    checks not expired/not used, marks used immediately even on failure, requires all three correct
    (named constant `REQUIRED_CORRECT = 3`).
  - `issueChallenge()` throws a clear `AuthError` if fewer than 3 questions exist in the pool.
  - Basic per-IP throttle on challenge issuance (in-memory token bucket, no new dependency).
  - **Explicitly NOT in this store or anywhere in this server: any behavioral/telemetry field.** See
    Constraints — isHumanScore is client-only in Phase 2, full stop.
- Files: `apps/auth-server/src/questions-store.ts`, `apps/auth-server/dsl-questions.example.json`.
- Verify (HOST): covered by step 10 — pool-too-small rejection, normalized case-insensitive matching,
  single-use + expiry enforcement, per-IP throttle. Box once those pass.

### [x] 6. (CLAUDE) service-key-store.ts — per-service Ed25519 registry + introspect signature guard
- Do: Create `apps/auth-server/src/service-key-store.ts`, encrypted at rest via step 2 (integrity
  matters here even though public keys aren't secret — an attacker able to silently insert their OWN
  public key into this file would defeat the entire introspection trust chain, so the same
  authenticated-encryption tamper-detection that protects passwords also protects this registry):
  - Registry shape: `{ services: [{ serviceName, keys: [{ keyId, publicKeyPem, createdAt,
    revokedAt?: string }] }] }`. Multiple non-revoked keys per service are explicitly allowed and
    expected DURING a rotation window.
  - `registerKey(serviceName, publicKeyPem)`: appends a new key entry (keyId = random short id).
  - `revokeKey(serviceName, keyId)`: sets `revokedAt`.
  - `verifyAssertion(compactAssertion: string)`: decodes the compact `payload.signature` format from
    `crypto-primitives.ts`, requires the payload to carry `{service, iat, exp, nonce}`, rejects if
    `exp` isn't within a small window of now (e.g. `iat`/`exp` must bound a ≤60s-old, non-future
    assertion), rejects if `nonce` was already seen recently (simple in-memory Set with periodic
    sweep — same in-memory-only precedent as the per-IP throttle in step 5, not persisted), then
    tries EVERY non-revoked public key registered for the claimed `service` name until one verifies
    the signature (or none do → reject). Returns `{service}` on success, `null` on any failure —
    never leaks WHICH check failed in the response (mirrors the anti-bot challenge's
    don't-be-an-oracle rule).
  - **Host scripts** (mirroring `mud-builder`'s `generate-master-key.sh` precedent):
    `apps/auth-server/scripts/register-service.ts <serviceName>` — generates a fresh Ed25519
    keypair via `crypto-primitives.generateServiceKeypair()`, calls `registerKey`, and prints the
    PRIVATE key PEM to console EXACTLY ONCE with explicit instructions: save it to
    `shattered-service.key` on the CONSUMING service's host, never commit it, never re-print it.
    `apps/auth-server/scripts/revoke-service-key.ts <serviceName> <keyId>` — the second half of a
    no-downtime rotation (register new → roll out to the consumer, a Phase 2 concern → once
    confirmed live, revoke old). Wire both as `pnpm --filter @shatteredarchive/auth-server
    register-service -- <name>` / `revoke-service-key -- <name> <keyId>`.
  - **Cross-phase contract to document clearly, not silently assume:** Phase 1 only builds the
    auth-server side (registry + verification). A REAL consuming service reading its own
    `shattered-service.key` and signing outbound introspect calls with it is Phase 2 work. Phase 1's
    tests exercise the full mechanism with a synthetic in-test keypair (generate, register via the
    store directly, sign a fake assertion, verify) so it's fully proven without a real consumer.
- Files: `apps/auth-server/src/service-key-store.ts`,
  `apps/auth-server/scripts/register-service.ts`, `apps/auth-server/scripts/revoke-service-key.ts`,
  `package.json` script entries.
- Verify (HOST): covered by step 10. Box once those tests pass.

### [x] 7. (CLAUDE) Routes — signup/login/change-password/email/keys/rotate-master/introspect
- Do: Create under `apps/auth-server/src/routes/`:
  - `auth.ts`: `GET /api/auth/challenge` → `{challengeId, prompts}`. `POST /api/auth/signup
    {username, challengeId, answers}` → verifies the challenge FIRST (generic 400 on any failure,
    creates NO account, never says which answer was wrong); on success, generates the one-time
    password (per step 3's script logic, inlined/shared as a helper — do not duplicate the
    generation code between the route and the CLI script), creates the account, returns 201 with
    `{username, password}` **shown exactly once** and an explicit "write this down, you'll need to
    change it on first login" message — no email is sent (there isn't one yet). `POST
    /api/auth/login {username, password}` → verifies password, mints a session cookie
    (`sa_session`, httpOnly, `SameSite=Lax`), returns `{id, username, mustChangePassword, emailOnFile
    (boolean), emailVerified (boolean)}`. `POST /api/auth/logout` → revokes the session, clears the
    cookie. `GET /api/auth/me` → session-guarded (allowed even mid-`mustChangePassword`), returns
    the same shape as login. `POST /api/auth/forgot-password {username}` → always 200 with an
    identical generic message regardless of whether the account/email exists (anti-enumeration);
    internally calls `account-store.requestPasswordReset` and mails a reset link only if it returned
    non-null. `POST /api/auth/reset-password {token, newPassword}` → validates newPassword against a
    minimum-length policy (e.g. 12 chars — lightweight, no new strength-meter dependency), applies
    via `account-store.resetPassword`, does NOT auto-login (no prior session existed for this flow).
  - `account.ts`: session-guarded, and — except for the routes named in the `mustChangePassword`
    allowlist in Constraints — blocked while that flag is set. `POST /api/account/change-password
    {currentPassword, newPassword}` → verifies `currentPassword` (this is how a first-login forced
    change proves possession of the issued one-time/temp password), enforces the same min-length
    policy on `newPassword`, applies via `account-store.changePassword` (bumps epoch internally),
    then mints+sets a FRESH session at the new epoch before responding (corollary in Constraints).
    `POST /api/account/email {email}` → `account-store.requestEmail`, mails a verification link.
    `POST /api/account/rotate-master` → `account-store.rotateEpoch` directly (no password change),
    same fresh-session corollary, response is explicit about what was just invalidated.
  - `keys.ts`: session-guarded, blocked during `mustChangePassword`. `GET /api/keys` (excludes
    sessions), `POST /api/keys {service, label, expiresAt}` (`expiresAt` optional ISO date or
    omitted/`null` for no expiration — validate it's either absent, `null`, or a future date; show
    the plaintext token once), `POST /api/keys/:id/rotate`, `DELETE /api/keys/:id`.
  - `introspect.ts`: `POST /api/introspect {token}`, gated by `service-key-store.verifyAssertion`
    reading a signed assertion from a header (e.g. `X-Service-Assertion`) — NOT session-guarded, NOT
    reachable via a browser session cookie. Returns `{valid:true, accountId, service, label}` or
    `{valid:false}` for an invalid/unknown/expired TOKEN (normal "no", not an error); an invalid/
    missing/unverifiable ASSERTION is the only thing that gets a 401.
  - A `session-guard.ts` middleware (cookie → `keyStore.verify`, rejects non-`session` kinds) with a
    `mustChangePasswordGuard` wrapper enforcing the allowlist above.
  - Wire into `src/app.ts`/`index.ts`, each subpath with its own scoped `express.json({limit:...})`.
- Files: `apps/auth-server/src/routes/auth.ts`, `account.ts`, `keys.ts`, `introspect.ts`,
  `session-guard.ts`, `apps/auth-server/src/app.ts`.
- Verify (HOST): covered by step 10. Box once those tests pass.

### [x] 8. (CLAUDE) mailer.ts — pluggable transport, recovery-only (no signup email anymore)
- Do: Create `apps/auth-server/src/mailer.ts`: `sendMail({to, subject, text, html?})`. Default
  console/log transport when `SMTP_HOST` is unset (prints the link — MUST work with zero SMTP config
  for local dev). If `SMTP_HOST` is set, `nodemailer.createTransport` with configured host/port/auth.
  Used by exactly two flows now: `account.ts`'s add-email verification link, and `auth.ts`'s
  forgot-password reset link (both build a `PUBLIC_ORIGIN`-based URL). Signup no longer sends any
  email (no address exists yet at that point).
- Files: `apps/auth-server/src/mailer.ts`, edits to `routes/account.ts` and `routes/auth.ts`,
  `.env`/`.env.example` additions (`SMTP_PORT`,`SMTP_USER`,`SMTP_PASS` alongside the `SMTP_HOST` and
  `PUBLIC_ORIGIN` already added in step 1).
- Verify (HOST): a local `dev` run with no `SMTP_HOST` set logs a link to console for both flows
  instead of throwing; `pnpm install` confirms `nodemailer` needed no build-script approval (STOP
  and flag it if it did — do not silently add it to `onlyBuiltDependencies`). Box + Progress log.

### [x] 9. (CLAUDE) Deploy wiring — Dockerfile + both docker-compose files + nginx
- Do:
  1. `deploy/auth-server.Dockerfile` — multi-stage, mirror `deploy/mud-builder-server.Dockerfile`
     exactly: same pinned `node:26.3.1-alpine3.24@sha256:a2dc166a...` digest on BOTH stages, same
     `apk --no-cache upgrade` first-`RUN` + `COREPACK_ENABLE_STRICT=1` pattern, same
     build-stage-`pnpm build` → runtime-stage `pnpm install --frozen-lockfile --prod --filter ...`
     split. `EXPOSE 62000`, `CMD ["node", "apps/auth-server/dist/index.js"]`. No client Dockerfile
     yet (Phase 2, once `apps/auth-client` exists).
  2. Add an `auth-server` service to BOTH `deploy/docker-compose.yml` (prod) and
     `deploy/docker-compose.shattered-archive-experimental.yml`, using `mud-builder-server`'s entry
     as the template:
     - `expose: ["62000"]` — **never `ports:`-published**, matching the Constraints port rule and
       every other app server in this repo.
     - **`DATA_ENCRYPTION_KEY` is delivered as a MOUNTED FILE, not an env var**, per the user's
       explicit follow-up request that it persist across container recreation without an operator
       re-supplying it each time. A second, SEPARATE named volume — `auth-server-secrets` — mounts
       read-write at `/repo/apps/auth-server/secrets`, distinct from `auth-server-data`.
       `environment:` sets `DATA_ENCRYPTION_KEY_FILE:
       "/repo/apps/auth-server/secrets/encryption.key"`. First boot against a fresh volume
       self-generates the key file (step 2's `loadDataKey()`); every later recreation (image rebuild,
       `docker compose up -d --force-recreate`, host reboot) reuses the SAME file, because a named
       volume — unlike the container filesystem — survives recreation and is destroyed only by an
       explicit `docker volume rm` / `down -v`. No `env_file` entry is needed for this secret in
       either compose file.
     - **Why a volume separate from `auth-server-data`, not the same one**: preserves the "key held
       externally" property already chosen for the at-rest encryption design (see Constraints) — the
       encrypted store and the key that decrypts it must not live in the same place, so a stolen or
       leaked `auth-server-data` volume/backup ALONE stays useless without also having
       `auth-server-secrets`. Note this explicitly as an operator/backup instruction: back up (and
       restrict access to) `auth-server-secrets` at least as carefully as `auth-server-data`, and
       never bundle the two into one backup archive/export if avoidable.
     - `environment:` also carries non-secret `NODE_ENV`, `PORT: "62000"`, `LOG_LEVEL` (`info` prod /
       `debug` experimental, matching the other services' split), and `PUBLIC_ORIGIN:
       "https://auth.shatteredarchive.dev"` in both files — nothing serves a browser UI at that
       origin yet in Phase 1, but the mailer's recovery-link URLs need a real one.
     - `auth-server-data`, mounted at `/repo/apps/auth-server/data`, is unchanged: a Docker named
       volume, NOT a host bind mount (unlike mud-builder's shared area mount, nothing else on the
       host needs to read this data). Declare BOTH `auth-server-data` and the new
       `auth-server-secrets` in each file's top-level `volumes:` key (the prod `docker-compose.yml`
       has no top-level `volumes:` block yet — add one).
     - A TCP healthcheck identical in shape to the other services' (`node -e
       "...net.connect(62000,'127.0.0.1',...)"`).
     - Network alias `auth-server.shatteredarchive.dev`.
     - Do **NOT** add `auth-server` to the `nginx` service's `depends_on:` — mirror the
       `mud-builder-server`/`mud-builder-client` precedent (additive service; nothing in Phase 1
       requires it to be up; must never block the rest of the stack from starting).
  3. `deploy/nginx/edge-subdomains.conf` — add an `auth.shatteredarchive.dev` server block using the
     SAME resolver+variable pattern as the existing `build.shatteredarchive.dev` block, so the edge
     still starts cleanly if `auth-server` isn't running: `resolver 127.0.0.11 valid=30s; set
     $auth_server auth-server:62000; proxy_pass http://$auth_server;` with the usual
     `proxy_set_header Host/X-Forwarded-Proto/X-Forwarded-For/X-Real-IP` set. Unlike
     `build.shatteredarchive.dev`, route ALL of `location /` there (not just `/api/`) — there is no
     client container yet to split traffic with; Phase 2 adds a `location /` → `auth-client` split
     the same way mud-builder does. **Corrected during implementation** (see Progress log): add
     `auth.shatteredarchive.dev` — matching this block's OWN `server_name`, not the backend service
     name — to the edge `nginx` service's alias list in BOTH compose files, mirroring exactly how
     `build.shatteredarchive.dev` (not `mud-builder-server.shatteredarchive.dev`) is what's in that
     list for the mud-builder precedent. The backend `set $auth_server auth-server:62000;` resolves
     via plain Compose service-name DNS regardless of nginx's alias list — that part of this
     bullet's original phrasing overstated why the alias is needed; it's for external-facing
     virtual-host consistency, not for the internal `proxy_pass` to work.
  4. No client Dockerfile or nginx conf (`mud-builder-client.conf`-style) yet — Phase 2, once
     `apps/auth-client` exists.
- Files: `deploy/auth-server.Dockerfile` (new), `deploy/docker-compose.yml`,
  `deploy/docker-compose.shattered-archive-experimental.yml`, `deploy/nginx/edge-subdomains.conf`.
- Verify (HOST): `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml config`
  parses cleanly (catches YAML/interpolation mistakes with no real secrets needed); `docker build -f
  deploy/auth-server.Dockerfile -t auth-server-test .` succeeds from the repo root. A full `docker
  compose up` of just `auth-server` against the two new volumes to confirm first-boot key
  self-generation and second-boot key reuse IS in scope here (unlike the old `apps/auth-server/.env`
  approach, nothing sensitive needs pre-seeding — the volumes start empty and the container
  self-provisions). Box + Progress log.

### [x] 10. (CLAUDE) Tests, host build/test pass, indexes, close out Phase 1
- Do:
  1. Write `crypto-primitives.test.ts`, `account-store.test.ts`, `key-store.test.ts`,
     `questions-store.test.ts`, `service-key-store.test.ts`, and route-level tests (`auth.test.ts`,
     `account.test.ts`, `keys.test.ts`, `introspect.test.ts`) under `apps/auth-server/src/`,
     structurally mirroring `apps/mud-builder-server/src/routes/auth.test.ts`. Minimum coverage
     beyond what earlier steps already listed: encrypt/decrypt round-trip + tampered-ciphertext
     rejection; challenge → signup issues a one-time password and sets `mustChangePassword`; login
     with that password succeeds but every route outside the allowlist 403s until
     `change-password` succeeds; `change-password` invalidates prior API keys/sessions exactly like
     `rotate-master` does, and returns a working fresh session; the host `issue-temp-password`
     script's underlying function sets `mustChangePassword` identically to signup; API key
     `expiresAt` — a `null` key still works far in the future, a dated key stops working after
     expiry; `forgot-password` returns the SAME response whether or not the account/email exists;
     `reset-password` never auto-logs-in; introspect accepts a validly-signed assertion from a
     registered key, accepts EITHER key during a two-key rotation window, rejects a revoked key,
     rejects a stale/future `iat`/`exp`, rejects a replayed `nonce`; no response body anywhere ever
     contains a password hash/salt, a key's `sha256`, a question's `acceptedAnswers`, or a service's
     private key.
  2. HOST: `pnpm --filter @shatteredarchive/auth-server build` and `test` — both green. Bound large
     test output per the qdigest convention (`… 2>&1 | grep -E "Tests:|Test Suites:|FAIL"`), read
     raw only on red.
  3. Create `apps/auth-server/.ai-context` + `.annotated`, add to `apps/.annotated` if one exists.
  4. Append a final Progress-log line, set `Status: COMPLETE`, and note Phase 2 (only
     `apps/auth-client` UI, its Dockerfile/nginx conf, and ONE example consumer actually reading a
     `shattered-service.key` and calling `/api/introspect` — `auth-server`'s own deploy wiring is
     already done as of step 9) should be created as a NEW `.ai-plans/*.md` doc at that point.
- Files: the eight new test files, `apps/auth-server/.ai-context`, `.annotated`, `apps/.annotated`
  (if applicable), this plan doc.
- Verify (HOST): `build` + `test` both exit 0; every scenario in 9.1 has a passing assertion. Box +
  final Progress-log entry + `Status: COMPLETE`.

## Progress log
- 2026-07-19T12:40 plan created (Claude), Status ACTIVE, unstarted. Phase 1 of 2: this doc covers
  ONLY `apps/auth-server` — no client UI, no Docker/nginx, no other-service integration, no C# work.
  Design decisions locked in via user AskUserQuestion answers: open self-serve signup,
  central-account-site + scoped-API-key model (not OAuth2/OIDC redirect flow), JSON file storage (no
  DB), C# integration explicitly deferred. Port 71000 assigned. Sessions implemented as short-TTL
  key records rather than a separate session mechanism.
- 2026-07-19T12:5x plan amended (Claude, before any step started): added anti-bot signup gating — a
  questions-store (now step 5) holding an operator-populated, hand-edited/hot-reloaded DSL-knowledge
  Q&A pool; signup gated by a 3-question challenge, single-use + 10min-expiring, per-IP throttled.
- 2026-07-19T13:2x plan amended again (Claude, before any step started), a large batch reviewed for
  accuracy/security before applying (4 items needed the user's decision, asked via AskUserQuestion;
  the rest were judgment calls stated below):
  - **Signup redesigned to username + system-issued one-time password** (no email at signup). Email
    becomes optional, added post-login, verified, usable ONLY for password recovery (2FA explicitly
    deferred to a later plan per the user's answer).
  - **Password change == master-key rotation.** Both self-service change-password and the forced
    first-login change bump the account epoch (same mechanism as the standalone rotate-master
    action) and invalidate every prior key/session. Claude's judgment call: BOTH the initial signup
    password AND any operator-issued temp password force this change before anything else is usable
    (user's wording said "may" for signup vs "must" for operator-issued; unified to "must" for
    consistency — flag if you want signup's initial change to be optional instead).
  - **New host-run script** (`issue-temp-password.ts`) mints a cryptographically random (never
    arbitrary/typed) one-time password for a targeted username, direct file/store access, no HTTP
    route — mirrors the existing `generate-master-key.sh` precedent in `mud-builder`.
  - **At-rest encryption:** user's answer was AES-256-GCM with an externally-supplied key (Node
    built-in crypto, no new dependency) — NOT "perfect forward secrecy," which doesn't apply to a
    single host encrypting its own data (flagged to the user as technically inapplicable before they
    chose; documented precisely in Constraints so the actual threat model covered — stolen disk/
    backup without the key, NOT a full host compromise — isn't overclaimed anywhere in the code).
  - **isHumanScore:** user's answer was fully client-side, never transmitted or logged by any
    server. This actually resolves the telemetry-policy conflict found in
    `.github/copilot-instructions.md` cleanly — no exception needed, the server never sees the data.
    Removed entirely from this server's scope; the future Phase 2 client may implement it locally.
  - **API keys now support `expiresAt`** (ISO date or `null` for forever), GitHub-preset-like at the
    route layer. Does not replace/change session tokens.
  - **Service-to-service introspect auth redesigned** from a shared secret to a per-service Ed25519
    keypair mechanism (user's answer) — new `service-key-store.ts`, host-run
    `register-service.ts`/`revoke-service-key.ts` scripts, `shattered-service.key` as the documented
    private-key filename convention for future Phase 2 consumers, multi-key registry supports
    rotation without an outage window.
- 2026-07-19T13:4x plan amended: corrected the port bug (see previous entry above this one in file
  order — 62000/62080 replace the invalid 71000/70080).
- 2026-07-19T14:0x plan amended (Claude, before any step started): user asked to fold deploy wiring
  into Phase 1 rather than leaving it entirely to Phase 2. Verified the exact patterns to mirror by
  reading `deploy/docker-compose.yml`, `deploy/docker-compose.shattered-archive-experimental.yml`,
  `deploy/nginx/edge-subdomains.conf`, `deploy/mud-builder-server.Dockerfile`, and
  `deploy/mud-builder-client.Dockerfile` in full. Added **step 9**: `deploy/auth-server.Dockerfile`
  (mirrors `mud-builder-server.Dockerfile`'s two-stage pinned-digest pattern) plus an `auth-server`
  service in BOTH compose files (`expose`-only on 62000, secret `DATA_ENCRYPTION_KEY` via untracked
  `env_file` never inline `environment:`, new named volume `auth-server-data`, TCP healthcheck,
  network alias) plus an `auth.shatteredarchive.dev` nginx block using the SAME resolver+variable
  pattern as `build.shatteredarchive.dev` (so the edge stays up even if `auth-server` isn't running).
  Old step 9 (tests/close-out) renumbered to step 10; its close-out note updated to reflect that
  Phase 2 is now UI-only (client + its Dockerfile/nginx conf + one example `/api/introspect`
  consumer), not deploy wiring generally. Judgment calls made without asking (flag if you want these
  different): (1) `auth-server` is NOT added to the edge `nginx` service's `depends_on:` — treated as
  additive like `mud-builder-server`, since nothing in Phase 1 consumes `/api/introspect` yet and it
  must never block the rest of the stack from starting; (2) `auth-server-data` is a Docker named
  volume rather than a host bind mount, since (unlike mud-builder's shared area directory) nothing
  else on the host needs to read this store; (3) the nginx block routes ALL of `location /` to
  `auth-server` for now (no client to split traffic with) — Phase 2 will introduce the `/api/` vs `/`
  split mud-builder uses once `apps/auth-client` exists.
- 2026-07-19T14:1x plan amended (Claude, before any step started): user asked for the server secret
  to be mounted into the container so it persists through container recreation, rather than requiring
  an operator-managed `apps/auth-server/.env` re-supplied on every deploy. Redesigned
  `DATA_ENCRYPTION_KEY` delivery: added a NEW `DATA_ENCRYPTION_KEY_FILE` config path (step 1/2),
  `loadDataKey()` now has an explicit precedence order (env var for local dev/test → configured file,
  read if present → configured file, self-generated on first boot if its directory exists but the
  file doesn't → fail fast only if nothing works), and step 9's compose wiring now mounts a SECOND,
  SEPARATE named volume `auth-server-secrets` (distinct from `auth-server-data`) holding just
  `encryption.key`, with `DATA_ENCRYPTION_KEY_FILE` pointed at it. Kept the volume separate from
  `auth-server-data` deliberately — collapsing them into one would put the decryption key in the same
  place as the data it decrypts, silently undoing the "key held externally" property the user chose
  earlier in this plan (Constraints). Removed the `env_file: ../apps/auth-server/.env` line from
  step 9's compose bullets since it's no longer how this secret is delivered in Docker deploys; the
  env var path still exists for bare (non-Docker) local dev and tests. Also updated step 9's Verify
  line: a full `docker compose up` of just `auth-server` is now in scope (nothing sensitive needs
  pre-seeding, so there's no reason to skip it), replacing the earlier "do not attempt a live compose
  up" caveat that existed only because of the old pre-seeded-`.env` design.
  - **Permissions/user-groups:** confirmed out of scope per the user; reserved an unused
    `permissions?: string[]` field on API key records so Phase 2+ doesn't need a breaking migration.
  - **Port range:** no documented numeric range found anywhere in this repo (verified via search);
    auth-server follows the existing internal-only pattern (never host-published) at 71000, same as
    every other app server. Flagged to the user as a finding rather than assumed silently correct.
  - Step count grew from 7 to 9 (crypto-primitives and service-key-store split out as their own
    steps) — justified in the header note since 8 of 9 steps are Claude-owned, so the qwen-context
    step-sizing rationale behind the usual 2-7 guidance doesn't apply here.
- 2026-07-19T13:4x plan corrected (Claude), before any step started — **port assignment was wrong**.
  71000/70080 (the naive next slot in the `<digit>0080`/`<digit>1000` sequence after mud-builder's
  6) are not valid TCP ports at all — the valid range tops out at 65535, so digit 7 never fits;
  flagged directly by the user ("ports are 65535, its networking"). Re-verified every app's actual
  `.env` (game 30080/31000, web 40080/41000, kingdom-tactics 50080/51000 reserved, mud-builder
  61000) and reassigned auth-server to **62000** / auth-client dev to **62080** — the next free pair
  inside mud-builder's already-used 60000s block, still leaving room for 2-3 more service pairs
  (63/64/65) before this scheme needs to change again. Fixed everywhere the old numbers appeared:
  Constraints' port bullet, the Context port-numbering bullet, and step 1's `.env`/verify text.
- 2026-07-19T21:0x implementation started (Claude, agent mode, per the qplan skill's "Execute /
  continue a plan yourself" workflow). Housekeeping fix first: steps 2-6's "Verify (HOST): covered by
  step 9" lines were stale from the deploy-wiring insertion two sessions ago (tests moved from step 9
  to step 10 but the cross-references inside the earlier steps weren't updated then) — corrected all
  6 occurrences to "step 10" before starting real work.
  - **Step 1 DONE and boxed.** Scaffolded `apps/auth-server` mirroring `apps/mud-builder-server`'s
    bare-`express()`/`registerRoutes(app)` pattern (not `apps/web-server`'s `services-server`
    `createExpressService` wrapper — auth-server intentionally has no `services-server` dependency
    per the plan's dependency list, so there is nothing to mirror there beyond package.json's script
    names). Files: `package.json` (deps: express, dotenv, winston, nodemailer, workspace dep
    `@shatteredarchive/types-server` only — `utils-server`/`utils-global` turned out to export only
    an unused `greetServer` placeholder each, so left out as genuinely unused, matching the plan's
    "only if actually used" qualifier), `tsconfig.json` (copied verbatim), `.env` (renamed from the
    plan's stated `.env`+`.env.example` pair — this repo's actual convention, confirmed via
    `git check-ignore`, is a single tracked `.env` with dev-safe defaults; `.env.example` would itself
    be gitignored by the existing `.env.*` rule and no other app in the repo has one, so creating it
    would have been dead weight), `src/config.ts`, `src/logger.ts` (minimal winston console+JSON
    logger — deliberately NOT a mirror of `services-server`'s `Logger` class, which pulls in
    `winston-daily-rotate-file` for file rotation auth-server doesn't need per the plan), `src/app.ts`
    (`registerRoutes`, health-check only for now — routes fill in at step 7), `src/index.ts` (env
    loading, fail-fast `loadDataKey()` call before `app.listen`), `apps/auth-server/jest.config.cjs`
    (local config mirroring mud-builder-server's — root config's generic `-server` glob can't reach
    co-located tests when `--rootDir .` IS the `-server` dir), root `jest.config.cjs`
    (`LOCAL_CONFIG_PACKAGES`/`LOCAL_CONFIG_IGNORES` +auth-server), root `.gitignore`
    (`apps/auth-server/data/`, `shattered-service.key`). Verified on HOST: `pnpm install` resolved
    with no native build-script prompt from `nodemailer`; `pnpm --filter
    @shatteredarchive/auth-server build` passed; `dev`/`node dist/index.js` WITHOUT
    `DATA_ENCRYPTION_KEY` exits 1 with a clear log line; WITH a valid key, `GET /health` on 62000
    returns `{"status":"ok",...}`. (Noted for anyone re-running that check by hand: this repo's
    `dotenv.config({override:true})` pattern, copied from web-server/mud-builder-server, means a
    blank `DATA_ENCRYPTION_KEY=` line committed in `.env` clobbers a same-named shell-exported var —
    not a bug, just means local ad-hoc testing needs the key set IN the file, not just exported.)
  - **Step 2 (`crypto-primitives.ts`) code written**, box left UNCHECKED per its own Verify line
    (deferred to step 10's test suite — round-trip, tamper-rejection, sign/verify coverage don't
    exist as automated tests yet, only manually smoke-tested above via the boot fail-fast path).
    `encryptJson`/`decryptJson` (AES-256-GCM, fresh random 12-byte IV per write, GCM tag persisted,
    decrypt throws — never silently empties — on a bad tag/corrupt envelope); `loadDataKey()` with
    the 4-step precedence from the Constraints/step-2 text (env var -> mounted file -> self-generate
    on first boot against a fresh mount -> throw), atomic tmp+rename write + `chmod 0o600` for the
    self-generated case, logs one boot line without the key value; `generateServiceKeypair`
    (Ed25519, SPKI/PKCS8 PEM); `signAssertion`/`verifyAssertion` (hand-rolled compact
    base64url(payload).base64url(signature), no digest algorithm arg needed for Ed25519, `verify`
    returns `null` on ANY failure — malformed input, wrong key, bad signature — never throws to a
    caller and never distinguishes which check failed).
- 2026-07-19T21:2x-22:1x implementation continued (Claude, same session): steps 3-9 all code-complete;
  step 9 fully verified and boxed; steps 2-7 remain boxed pending step 10's automated test suite
  (their own Verify lines defer to it) even though extensive manual smoke-testing already passed.
  - **Housekeeping bug fixes found and fixed along the way, in the plan doc itself:**
    - Steps 3-6's own file-list/Verify text still said "questions" is encrypted in one place
      (Constraints) while step 5's own body said "hand-edited, operator edits directly" — a real
      contradiction (an operator cannot hand-edit ciphertext). **Resolved: the questions pool is
      PLAIN JSON, not encrypted** — Constraints and step 5 both corrected to say so explicitly, with
      the rationale recorded in both places rather than silently picking one reading.
    - Step 9.3's nginx-alias sentence claimed the alias list is what makes `set $auth_server
      auth-server:62000;` resolve — checked against the actual `build.shatteredarchive.dev` precedent
      and that's not how it works (plain Compose service-name DNS resolves it regardless; the alias
      list is for EXTERNAL virtual-host names, like `build.shatteredarchive.dev` itself, not the
      backend service name). Corrected step 9.3's text and used `auth.shatteredarchive.dev` (matching
      this block's own `server_name`) as the alias, not `auth-server.shatteredarchive.dev`.
  - **Real code bug found via manual smoke-testing, fixed:** `mustChangePasswordGuard`
    (`routes/session-guard.ts`) computed its allowlist key from `req.path`, which Express reports
    RELATIVE TO THE MOUNT PREFIX inside an `app.use('/api/account', ...)`-mounted middleware (e.g.
    `/change-password`, not `/api/account/change-password`) — so the allowlist NEVER matched and
    `change-password` was incorrectly blocked by its own forced-change flag, a real "you can never
    escape mustChangePassword" bug caught only by an end-to-end curl smoke test, not by `tsc`. Fixed
    by building the allowlist key from `req.originalUrl` (mount-independent) instead.
  - **Steps 3-8 code**: `account-store.ts`/`key-store.ts`/`questions-store.ts`/`service-key-store.ts`
    all built per their spec sections; a new shared `encrypted-file-store.ts` (atomic tmp+rename +
    mtime-cache + corrupt-file-locks, generic over the payload type) factors out logic that would
    otherwise duplicate 3x across account/key/service-key stores — not itemized as its own file in
    the plan, added as a within-auth-server-only shared base (satisfies "duplicated locally rather
    than cross-imported from mud-builder-server," just centralized once instead of copy-pasted per
    store). A single `errors.ts` (`AuthError`) is shared the same way. `account-store.ts` gained
    `verifyPasswordFor` (needed by change-password to check the CURRENT password) and hashes-before
    -duplicate-recheck ordering in `createAccount` (scrypt is slow enough to leave a real concurrent-
    signup TOCTOU window if checked before hashing). `key-store.ts` gained `revokeById` (logout needs
    to revoke ANY kind by id, unlike the ownership-checked `revokeKey` used by the key-management
    routes). `mailer.ts` (step 8) built and smoke-tested standalone before routes needed it.
  - **Step 7 (routes) gap-filled**: the plan's route list never named a consumer for
    `account-store.verifyEmail(accountId, token)` — added `POST /api/account/email/verify {token}`
    as the obvious missing piece (mirrors how `reset-password` consumes `requestPasswordReset`'s
    token), flagged rather than silently added. `AuthServerDeps` (stores + mailer + throttle +
    publicOrigin) lives in a new `src/deps.ts`, threaded through `registerRoutes`/each route module —
    not itemized in the plan's file list either, but required once routes stopped being health-check
    stubs; kept deliberately separate from `app.ts` to avoid a type-only import cycle.
  - **End-to-end manual verification (HOST, real server + curl, real Docker)**, beyond each step's own
    scoped check: signup (anti-bot challenge → one-time password) → login (`mustChangePassword:
    true`) → `/api/keys` correctly 403s until → change-password (verifies current password, bumps
    epoch, mints a FRESH session, `mustChangePassword` clears) → key creation/list → `register-service`
    script → introspect with a real Ed25519-signed assertion (`{valid:true,...}` for a real token,
    correctly rejects a REPLAYED assertion via the nonce set) → logout → `/api/auth/me` 401s after.
  - **Step 9 deploy wiring, fully verified, not deferred**: `deploy/auth-server.Dockerfile` (mirrors
    `mud-builder-server.Dockerfile`'s two-stage pinned-digest pattern exactly); `auth-server` service
    added to BOTH compose files (`expose`-only, TCP healthcheck, `auth-server-data` +
    `auth-server-secrets` named volumes, NOT in nginx's `depends_on:`); prod `docker-compose.yml`
    gained its first top-level `volumes:` block. `docker compose config` parses cleanly on both files;
    `docker build -f deploy/auth-server.Dockerfile` succeeds; a REAL `docker compose up` of just
    `auth-server` against fresh volumes confirmed first-boot key self-generation (log line present)
    AND, after `--force-recreate`, key REUSE (no regeneration line on the second boot) — the mounted-
    secret-persistence design from the earlier amendment is proven, not just argued. Test containers,
    volumes, and the standalone `docker build` tag were torn down afterward; the compose-built image
    tag is left cached locally (harmless, matches normal dev workflow).
- 2026-07-19T22:2x Phase 1 CLOSED OUT (Claude). Step 10: wrote the full test suite — 5 store-level
  suites (`crypto-primitives`, `account-store`, `key-store`, `questions-store`, `service-key-store`)
  plus 4 route-level suites (`auth`, `account`, `keys`, `introspect`) built on a shared, non-test
  `routes/test-helpers.ts` (real `app.listen(0)`/native `fetch`, no `supertest` — mirrors
  `mud-builder-server/src/routes/auth.test.ts`'s existing pattern, confirmed via search before
  writing rather than assumed). Every scenario step 10's Do section named is covered: encrypt/decrypt
  round-trip + tamper rejection; challenge→signup→mustChangePassword→change-password (blocked-then-
  allowed, old session/keys dead, fresh session minted, epoch bumped) exactly parallel to
  rotate-master; the host `issue-temp-password` script's underlying store method sets
  `mustChangePassword` the same way signup does (asserted directly at the store level, matching
  `account-store.test.ts`'s `adminSetTemporaryPassword` case); API key `expiresAt` — `null` works,
  a dated-past key (minted directly through the store to bypass the route's future-date validation,
  same technique `key-store.test.ts` uses) fails both `key-store.verify()` and, end-to-end, an
  `/api/introspect` call; `forgot-password` returns an IDENTICAL response for an unknown account, a
  known account with no email, and never actually mails anything for either; `reset-password` never
  sets a session cookie even on success; introspect accepts a validly-signed assertion, accepts
  EITHER key during a two-key rotation window, rejects a revoked key, rejects stale/future
  `iat`/`exp` and an over-wide window, rejects a replayed `nonce`; targeted assertions throughout
  confirm no response body ever contains a password hash/salt, a key's `sha256`, a question's
  `acceptedAnswers`, or a service's private key. **94/94 tests pass, `pnpm --filter
  @shatteredarchive/auth-server build` and `test` both exit 0**, and the root `jest.config.cjs`
  aggregator (`--selectProjects auth-server`) correctly picks the suite up via the
  `LOCAL_CONFIG_PACKAGES` wiring added in step 1.
  - **One real code bug caught only by the route-level tests** (not by `tsc`, not by the store-level
    unit tests, and not by the earlier manual curl smoke-testing before this particular assertion was
    added): none beyond the `req.path`-vs-`req.originalUrl` mount-prefix bug already logged above,
    which the manual smoke test caught FIRST — the automated `account.test.ts` case
    ("every /api/account route except change-password is blocked...") now pins that fix so it can't
    silently regress.
  - Wrote `.ai-context` + `.annotated` at the app root, `src/`, `src/routes/`, and `scripts/` (no
    `apps/.annotated` exists in this repo yet, so per the plan's "if applicable" that step is a no-op,
    not a skip).
  - **Phase 2 (a SEPARATE, not-yet-created `.ai-plans/*.md` doc, to be started only now that this
    doc is COMPLETE) covers exactly**: `apps/auth-client` (the browser UI — signup/login/account/keys
    screens, the client-side `isHumanScore` behavioral signal that never reaches this server), its
    Dockerfile + `mud-builder-client.conf`-style nginx conf + a `location /` split on
    `auth.shatteredarchive.dev` alongside the existing `/` catch-all this phase added, and ONE example
    consumer (recommended: `mud-builder-server`) actually holding a `shattered-service.key` and
    calling `/api/introspect` for real. `auth-server`'s own deploy wiring, at port 62000/62080,
    needs no further work from Phase 2.
- 2026-07-19T~22:4x post-completion follow-up (Claude, same session, user request after `Status:
  COMPLETE`): a documentation + sign-off pass, not a new plan step.
  - **Sign-off re-verification**: fresh `pnpm --filter @shatteredarchive/auth-server build`
    (exit 0) and `test` (94/94 passing, 9/9 suites) re-run from a clean state; both compose files
    re-validated with `docker compose config --quiet` (exit 0 each) after the doc/script edits below.
  - **New docs**: `apps/auth-server/README.md` (prerequisites, first-boot key generation, the
    plain-JSON question-pool workflow, host scripts, Docker quick-start, env var table, a one-
    paragraph security-model summary) and `docs/auth-server.md` (full API reference, mirroring
    `docs/web-server.md`'s endpoint-doc format). Root `README.md`'s Repository Structure and
    Documentation sections, and `docs/ports.md`, updated to list `auth-server` (62000) and the
    reserved `auth-client` (62080, Phase 2, explicitly marked not-yet-built).
  - **Root `package.json` scripts**, per the user's explicit choice (asked via AskUserQuestion,
    since no `auth-client` exists yet to genuinely pair with): added `dev:auth-server` /
    `start:auth-server` (matching every other per-app convention), plus `dev:auth-client` /
    `start:auth-client` stubs and a combined `start:oauth` (`concurrently "pnpm start:auth-client"
    "pnpm start:auth-server"`) mirroring the shape of the top-level `start` script (which already
    combines 4 apps the same way) rather than `dev:psd-viewer`'s narrower 2-app pattern, since no
    existing app pair actually has a combined `start:` script to copy literally. Verified by hand:
    `pnpm --filter <nonexistent-package> dev` exits **0** with "No projects matched" (not an error),
    so `start:oauth` today prints that harmless line for the client leg and actually starts
    `auth-server` for the server leg — confirmed with a live 6-second run, not just reasoned about.
- 2026-07-19T~23:0x second, independent review pass (Claude, same session, user-requested — "review
  a second time, ensure with evidences everything is in order"). Deliberately re-derived evidence
  rather than re-citing the prior pass's claims:
  - `git status`/`git diff --stat` showed only the expected file set — nothing drifted since the
    last report.
  - `pnpm install --frozen-lockfile` from a clean state passed (lockfile is genuinely committed-
    consistent, not just locally patched); `dist/`+`tsconfig.tsbuildinfo` deleted and rebuilt from
    scratch (exit 0); full test run stayed 94/94 green.
  - **New check not run in the first pass:** `eslint apps/auth-server` — 0 errors, but 3 warnings
    ("unused eslint-disable directive") on the `// eslint-disable-next-line no-console` comments in
    `crypto-primitives.ts` and both host scripts, meaning this repo's eslint config doesn't actually
    flag `no-console` — those directives were defensive but wrong. Removed all three (kept the
    prose comment explaining WHY each log line exists), re-ran lint clean at `--max-warnings=0`,
    rebuilt, retested — still 94/94.
  - Spot-checked the `req.originalUrl` fix is still literally present in `session-guard.ts` (grep),
    `package.json` still parses as valid JSON, both new doc files exist with real content.
  - Ran a **fresh** live end-to-end smoke test (new temp data dir, freshly generated key, real
    `node dist/index.js`, real `curl`): `/health` → signup → login (`mustChangePassword: true`) →
    `change-password` succeeded — the last step is a live re-confirmation that the
    `mustChangePasswordGuard` fix from the first pass has not regressed.
  - Re-ran `docker compose config --quiet` on both compose files — exit 0 each.
  - **Conclusion: sign-off holds.** Proceeding to the next step per this doc's own Progress log
    (2026-07-19T22:1x entry): creating the Phase 2 plan doc now that this one is verified COMPLETE.
