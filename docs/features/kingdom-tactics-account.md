# Kingdom Tactics — Account (Developer Notes)

This document explains what the **Account** screen in `kingdom-tactics-client`
does and how it's wired, for players wanting to know what logging in gets them
and for whoever next touches `AccountScreen.tsx` / `useAccountScreen.ts` /
`features/auth/*` in that app.

---

## What is it, and what do I get from logging in?

An **optional** login against the central Shattered Archive hub, reached from
the main menu's **Account** button. Kingdom Tactics is fully playable —
online and offline — without ever logging in. Logging in adds three things:

- **Match history**: every online match you finish while logged in is
  recorded and listed on the Account screen.
- **Replay**: pick any past match from your history and step through it move
  by move, on the same board view used for live play.
- **Cloud army layouts**: save your locally-saved army rosters to the cloud,
  or load whatever was last saved there onto this device.

Nothing about local/offline/hot-seat play, or army building itself, changes
whether you're logged in or not.

---

## The login flow

Unlike Shattered Archive's browser game client (which has no backend of its
own), `kingdom-tactics-server` **is** a real backend and performs its own
login hand-off with the hub, using its own registered key — there's no
intermediary site involved:

1. Clicking **Account → Log in** navigates the whole page to
   `kingdom-tactics-server`'s own `/api/kt/auth/start?returnUrl=...`.
2. The server validates the return URL's origin, sets a short-lived signed
   state cookie, and redirects to the hub's consent page.
3. After you approve, the hub redirects back to
   `/api/kt/auth/callback`, which redeems the code (server-to-server) and
   redirects your browser back to the game with
   `#auth_token=...&expires_at=...` in the URL **fragment** — never a query
   string (fragments never reach any server or log).
4. The client reads that fragment once on load, stores the token, and strips
   it from the URL immediately.

The token is a plain bearer credential after that — there's no server-side
session to log out of; **Log out** just clears the local copy.

---

## Match history & replay

Every time an **online** match you're logged in for ends, the server records
it under your account: who played, who won, and the exact sequence of moves.
The list on the Account screen shows these; picking **Replay** fetches the
recorded moves replayed server-side and steps you through the resulting board
states with Prev/Next controls, reusing the exact same board view live play
uses (so replays always look right, by construction — there's no separate
replay renderer to drift out of sync).

**What's never sent to your browser**: the hidden combat-roll seed for that
match. Replays are deterministic because the server re-runs the recorded
moves with the original seed on its own side and only ever sends you the
resulting board states — the seed itself would let you predict hit/miss
outcomes in a live match if it ever leaked, so it stays server-side always.

Local/offline/hot-seat matches are never recorded — only online matches
played while logged in.

---

## Army layouts

Your saved army rosters (Army Builder's "Saved armies" list) already live on
this device via `localStorage`. Logging in adds two buttons:

- **Save to cloud** — pushes everything currently saved on this device up.
- **Load from cloud** — asks you to confirm, then **replaces** this device's
  saved armies with whatever was last saved to the cloud (not a merge).

---

## Relevant files

### kingdom-tactics-server
- `src/http/kt-sso-routes.ts` — the login hand-off routes.
- `src/http/kt-api-routes.ts` — match-history/replay/army-layout routes
  (all require a valid bearer token — there's no anonymous equivalent for
  "my" data).
- `src/http/auth-guard.ts` — the bearer-token guard those routes share.
- `src/persistence/` — the per-account JSON stores.
- `src/ws/kt-gateway.ts` — the `/ws/kt` gateway's optional token handling
  (this is what attaches your accountId to a match in the first place).

### kingdom-tactics-client
- `src/features/auth/` — everything described above: token storage, the
  login trigger, the callback handler, the fetch wrappers, and
  `AccountScreen.tsx`/`useAccountScreen.ts`.
- `src/state/saved-armies.ts` — local army-layout storage (`replaceAllArmies`
  is what "Load from cloud" calls).

---

## Testing note

Both apps' test suites cover this feature's logic directly (route tests for
the server, `renderHook`-based tests for the client hook). The actual login
redirect chain, a real match played to completion, and the replay/army-layout
round trips were verified live against the real deployed
`kingdom-tactics.shatteredarchive.dev` — over the real public hostname, real
HTTPS, and a real WebSocket upgrade, not a local shortcut. See
`.ai-plans/20260727-1930-auth-rollout-phaseF-kingdom-tactics.md` for the full
evidence trail.
