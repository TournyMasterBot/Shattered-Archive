# Account Modal (Developer Notes)

This document explains what the **Account** feature does and how it's wired,
for whoever next touches `AccountModal.tsx` / `useAccountModal.ts` /
`features/auth/*`.

---

## What is it?

An **optional** login against the central Shattered Archive hub, plus manual
cloud save/load of the current connection's user scripts and plugin configs.
Logged out is the default and fully-supported state — nothing else in
game-client requires an account.

Opened from **File → Account…** in the main menu bar.

---

## The login flow

game-client is a **public client** — it ships to browsers, so it can't hold a
service key (key custody: private keys never leave a backend). Login instead
delegates to the C# site (`Server.Web.Public`), which already holds the
`shattered-web` service key from Phase B:

1. `gameSso.startLogin()` navigates the **whole page** to
   `{SITE_ORIGIN}/user/game-sso/start?returnUrl=<this page>`.
2. The C# site validates `returnUrl`'s origin against an allowlist, sets its
   own `game-sso-state` cookie, and redirects the browser to the hub's
   `/sso/authorize` consent page.
3. After the user approves, the hub redirects back to the C# site's
   `/user/game-sso/callback`, which redeems the code (server-to-server, using
   the `shattered-web` key) and redirects the browser back to game-client with
   `#auth_token=...&expires_at=...` in the URL **fragment** — never a query
   string (fragments never reach any server or log) and never the site's own
   `jwt-token` cookie (a different origin can't read that anyway).
4. `useAuthCallback` (mounted once in `MainContainer`) reads the fragment on
   load, stores the token via `authTokenStore`, and strips the fragment from
   the URL immediately.

The token is a plain bearer credential from then on — there's no server-side
session to log out of; "Log out" just clears the local copy
(`authTokenStore.clearToken()`).

---

## Save / Load

`cloudSync.ts` wraps the C# site's per-account content API
(`/api/user-content/scripts`, `/api/user-content/plugin-configs` —
whole-collection GET/PUT, matching how these are already stored client-side as
a single JSON array). Every call carries `Authorization: Bearer <token>`; a
401 clears the stored token and returns `{ kind: 'unauthenticated' }` rather
than throwing, so the modal can show a clean "log in again" message instead of
crashing.

**Save** reads the CURRENT connection's local state and PUTs it up:
- Scripts: `RuntimeSingleton.Runtime.loadScriptsFromStorage(connectionId)` —
  the public read method `UserScriptRuntime` already exposes for exactly this.
- Plugins: a plain `localStorage.getItem(PLUGINS_STORAGE_KEY)` read (plugins
  are global, not connection-scoped — see below).

**Load** GETs both collections and writes them into local storage, then does
a **full `window.location.reload()`** rather than trying to live-patch every
piece of derived state (trigger listeners, omit rules, the plugin host,
etc.). This is deliberate: Load is a destructive, user-confirmed action
("this replaces this connection's local scripts and plugin configs"), and a
reload guarantees everything re-derives cleanly from the new localStorage
state instead of risking a half-updated runtime.

---

## Two non-obvious things worth knowing before you touch this

1. **`UserScriptRuntime.saveScriptsToStorage` is private.** It's the method
   that writes localStorage *and* dispatches `shatteredarchive:userScripts-
   updated` (which `RuntimeSingleton` listens for to re-hydrate the live
   runtime). There's no public bulk "replace and save" method — only public
   per-item mutators (`upsertScriptAndSave`, `removeScriptAndSave`) and a
   public bulk *read* (`loadScriptsFromStorage`) plus a public storage-key
   helper (`getStorageKey`). `useAccountModal.ts` uses exactly those two
   public methods for Save, and writes localStorage directly (no event
   dispatch needed) for Load, since the immediately-following page reload
   makes the live-sync event moot.

2. **Plugin storage has no cross-component live-sync at all**, unlike
   scripts. `usePlugins.ts` is a plain `useState` hook seeded once from
   localStorage — there's no equivalent of `userScripts-updated` for it. This
   is the other reason Load reloads the page rather than trying to patch
   state directly: there's no existing mechanism to notify an already-mounted
   `usePlugins()` instance of an external write, and building one just for
   this would be new machinery for a rare, already-confirmed action.

---

## Relevant files

### Auth / sync
- `apps/game-client/src/features/auth/authTokenStore.ts` — localStorage
  wrapper for the bearer token (`getToken`/`setToken`/`clearToken`/`isExpired`).
- `apps/game-client/src/features/auth/siteApi.ts` — `SITE_ORIGIN` (absolute,
  for the login-navigation) vs. `siteApiBase()` (dev-proxy-relative in dev,
  absolute in prod).
- `apps/game-client/src/features/auth/gameSso.ts` — `startLogin()`.
- `apps/game-client/src/features/auth/authFragment.ts` — pure parser for the
  callback's URL fragment (kept import-free of `import.meta` so it's
  Jest-testable; see the note below).
- `apps/game-client/src/features/auth/cloudSync.ts` — the four fetch
  wrappers (`loadScripts`/`saveScripts`/`loadPluginConfigs`/`savePluginConfigs`).
- `apps/game-client/src/hooks/useAuthCallback.ts` — reads the fragment once
  on mount.

### UI
- `apps/game-client/src/hooks/useAccountModal.ts` — modal state/actions.
- `apps/game-client/src/components/AccountModal.tsx` — the modal itself.
- `apps/game-client/src/styles/AccountModal.module.scss`.
- Opened via `MainMenuBar.tsx`'s File submenu; open/close state lives in
  `useMainContainer.ts` (`isAccountModalOpen`/`openAccountModal`/
  `closeAccountModal`) alongside Connect/Library/Equipment's modals — **not**
  `useMainMenuBar.ts`, which only owns dropdown/submenu UI state.

---

## Testing note

`siteApi.ts` uses `import.meta.env` (Vite-only syntax), which this repo's
Jest "client" project cannot compile anywhere in a module's import graph —
a pre-existing, repo-wide gap, not specific to this feature. `authFragment.ts`
and `authTokenStore.ts` are deliberately free of that import and have unit
tests; `gameSso.ts` and `cloudSync.ts` don't, and are verified live instead
(see `.ai-plans/20260727-1420-auth-rollout-phaseD-game-client-wiring.md` for
the live E2E evidence — a real hub signup, the full redirect chain, and
PUT/GET round trips against the real local dev C# backend).
