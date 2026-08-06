- [Overview](#overview)
- [Folder Path](#folder-path)
- [Concepts](#concepts)
- [Pages](#pages)
- [Configuration](#configuration)
- [Deployment](#deployment)

---

# Overview

`auth-client` is the Phase 2 browser UI for [`auth-server`](./auth-server.md) (dev port
**62080**) — signup, login, forced password change, account management, and API-key
management. React 19 + Vite 8 + `@vitejs/plugin-react-swc`, structurally mirroring
`apps/mud-builder-client`. It holds no auth state of its own beyond what `auth-server`
returns from `GET /api/auth/me`.

For local setup, see [`../apps/auth-client`](../apps/auth-client) (run alongside
`auth-server` via `pnpm start:oauth` from the repo root, or `pnpm dev:auth-client` +
`pnpm dev:auth-server` in dev).

# Folder Path

- `apps/auth-client`

# Concepts

- **Sessions are the browser's problem, not this app's.** Every request uses
  `fetch(..., {credentials:'include'})`; the httpOnly `__Host-sa_session` cookie `auth-server`
  sets is never read or stored by this app. The one exception: API-key tokens from
  `POST /api/keys` ARE shown to the user (show-once, per `auth-server`'s design) — those
  are for the user to copy elsewhere, not for this app's own auth.
- **One state machine drives the whole app.** `useAuthSession()` resolves to
  `loading | loggedOut | mustChangePassword | ready` from `GET /api/auth/me`, and
  `App.tsx` switches its entire view off that value — no router.
- **The forced-change gate is UX only.** `auth-server` itself blocks every route except
  `GET /api/auth/me`, `POST /api/account/change-password`, and `POST /api/auth/logout`
  while `mustChangePassword` is set; `ForcedChangePage` just keeps the user from clicking
  around a UI whose requests would 403 anyway.
- **Two emailed-link landings, handled without a router.** `App.tsx` reads
  `window.location.pathname`/`search` once on mount: `/reset-password?token=...` routes to
  `ForgotPasswordPage`'s reset sub-flow (public, pre-login); `/verify-email?token=...`
  hands the token to `AccountPage`, which auto-verifies it on mount once the user is
  logged in (verification is session-guarded server-side, so a logged-out visitor sees
  the login screen first, then lands on the account page with the token still queued).

# Pages

| Page | Route/trigger | Purpose |
|---|---|---|
| `SignupPage` | logged-out, default | 3-question anti-bot challenge -> `POST /api/auth/signup` -> show the one-time password exactly once |
| `LoginPage` | logged-out, default | Username/password -> `POST /api/auth/login` |
| `ForgotPasswordPage` | logged-out, "Forgot password?" or `/reset-password?token=...` | Request a reset link, or (with a token) set a new password |
| `ForcedChangePage` | `mustChangePassword: true` | Blocking password-change screen; logout is the only other option |
| `AccountPage` | logged-in, "Account" tab | Change password, add/verify email, rotate-master (behind a confirm) |
| `KeysPage` | logged-in, "API keys" tab | List/create/rotate/revoke API keys, show-once token box |
| `SsoApprovePage` | `/sso/authorize?service=…&redirect_uri=…&state=…` | Phase A SSO consent: login (and forced change) run first, then approve mints a one-time code via `POST /api/sso/approve` and redirects back with `code`+`state`; deny returns `error=access_denied`; malformed params render an error card and never redirect |
| `AdminPage` | logged-in, "Admin" tab (visible only when `me().globalRole` ≠ `user`; the API enforces regardless) | A2 hub admin: searchable/paged user table with live credential counts, strictly-below role select + one-time recovery passwords (shown once), and the delegation panel linking out to each service's own role admin |

A2 also restyled the whole client around design tokens extracted from the C# site's
`site.css` (dark panels, pill nav, striped rounded tables, blue/orange accents) — the
tokens live in `src/index.css` as CSS custom properties and are the constellation's
reference identity style going forward.

# Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_PORT` | `62080` | Dev server port |
| `VITE_AUTH_API` | `http://localhost:62000` | Dev-only proxy target for `/api` and `/health` (production routes through nginx instead — see Deployment) |
| `VITE_AUTH_SECURE` | `false` | Whether the dev proxy target uses `https` |

# Deployment

Deployed at `https://auth.shatteredarchive.dev` alongside `auth-server`, split the same
way `build.shatteredarchive.dev` splits `mud-builder-client`/`mud-builder-server`: nginx
routes `/api/` and `= /health` to `auth-server`, everything else to this app's
nginx-served static build (`deploy/auth-client.Dockerfile`, `deploy/nginx/auth-client.conf`).
No `VITE_*` build args are needed — the client calls `/api`/`/health` with relative URLs
at runtime, so the same build works in dev (via the Vite proxy) and behind nginx.
