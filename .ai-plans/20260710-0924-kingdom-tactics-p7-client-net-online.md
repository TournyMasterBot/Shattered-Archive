# Plan: Kingdom Tactics Phase 7 — client `net` slice (online multiplayer over /ws/kt)

Created: 2026-07-10T09:24:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Build the client-side online-multiplayer slice that connects to the existing authoritative `/ws/kt` gateway, plays a match from server snapshots, and wires it into nav.

## Goal
A player can pick "Online Match" from the menu, connect to a running kingdom-tactics-server,
join a match by id, and play their seat against the server-authoritative match — the board
renders from server `snapshot` frames, the human submits actions over the socket, and the
server's `over` frame ends the match. Done when: the new `features/net/` slice (transport +
hook + `OnlineMatchScreen`) exists with host-green tests, the client build is clean, the
engine gains a symmetric `parseKtServerMessage`, and nav routes to the screen. No new runtime
deps (browser-native `WebSocket`; protocol types come from the engine).

## Constraints
- **Server-authoritative, no client prediction (v1).** The client submits an `action` and waits
  for the broadcast `snapshot`; it never applies actions to its own state optimistically. The
  server's `MatchSession` is the single source of truth (`apps/kingdom-tactics-server/src/match/match-session.ts`).
- **No new dependencies.** Use the browser-native `WebSocket`; the wire protocol + validators
  live in `@shatteredarchive/kingdom-tactics-engine` (`net/protocol.ts`). Server already uses `ws`.
- **Transport must be injectable for tests.** jsdom has no `WebSocket`; the transport takes a
  socket-factory (default `(url) => new WebSocket(url)`) so tests drive a fake socket.
- **Plain Jest matchers only — NO jest-dom** (`toBeInTheDocument` is unavailable; use `.toBeTruthy()`),
  matching the existing client suites.
- **This is a CLAUDE (host) plan, not a qwen handoff.** Every `Verify` runs pnpm on the host;
  qwen must NOT run `pnpm install|build|test` in-container (corrupts the host toolchain).
- Reuse the existing controlled `Arena` — do NOT fork the renderer. Keep the client thin: it
  configures, transports, and renders; all rules/aggregation stay in the engine/server.
- Refresh `.ai-context`/`.annotated` for any directory whose file set changes, and `@ai-` headers
  on substantively edited files (host edits don't auto-refresh).

## Context
- **Wire protocol (shared, in the engine):** `/workspace/shattered-archive/services/kingdom-tactics-engine/src/net/protocol.ts`
  - Client→server `KtClientMessage`: `join{matchId,side?}` · `action{matchId,action}` · `requestSnapshot{matchId}` · `leave{matchId}`.
  - Server→client `KtServerMessage`: `joined{matchId,side,state,protocol}` · `snapshot{matchId,state,lastAction?}` · `error{matchId?,message}` · `over{matchId,state,winner}`.
  - `KT_PROTOCOL_VERSION = 1`. Engine already exports `parseKtClientMessage`/`isKtClientMessage` but **no** server-side parser yet.
- **Server gateway (already built + tested, Phase 4):** `/workspace/shattered-archive/apps/kingdom-tactics-server/src/ws/kt-gateway.ts`
  mounts `WebSocketServer` at path `/ws/kt`; on `join` the human takes side 0 (AI holds side 1 by default),
  server replies `joined` then auto-plays AI to the human turn; on `action` it validates seat + legality and
  broadcasts `snapshot`; emits `over` when decided. Default match = a 1v1 Duel.
- **Arena is a controlled component (reuse verbatim):** `/workspace/shattered-archive/apps/kingdom-tactics-client/src/features/arena/Arena.tsx`
  `ArenaProps = { state: MatchState; controllableSide: Side; legalActionsFor: (tokenId) => Action[]; onAct: (action) => void; interactive? }`.
  `legalActionsFor` is a pure engine call the client computes from any snapshot:
  `legalActions(state, state.activeSide, providers).filter(a => 'tokenId' in a && a.tokenId === id)`
  (see `apps/kingdom-tactics-client/src/features/arena/hooks/useMatch.ts:68` and `Arena.test.tsx:22`).
- **Env already scaffolded:** `/workspace/shattered-archive/apps/kingdom-tactics-client/src/env.d.ts`
  declares `VITE_KT_WS`, `VITE_KT_API`, `VITE_KT_SECURE` — use `import.meta.env.VITE_KT_WS` (default `ws://localhost:PORT/ws/kt`).
- **Shared client singletons:** `providers` at `apps/kingdom-tactics-client/src/state/providers.ts`;
  nav store (`Screen` union + `useNav`) at `apps/kingdom-tactics-client/src/state/nav.tsx`; screen router `App.tsx`;
  menu buttons `apps/kingdom-tactics-client/src/pages/MainMenu.tsx`. Client has a local `jest.config.cjs`
  (jsdom + ts-jest ESM, engine mapped to TS source) and uses `@testing-library/react`.
- **Reference for hook lifecycle patterns:** the Phase-6 `useSimBatch` generation-ref cancel/guard
  (`apps/kingdom-tactics-client/src/features/simulator/hooks/useSimBatch.ts`).

## Steps
### [x] 1. Engine: symmetric server-message validator
- Do: In `net/protocol.ts` add `isKtServerMessage(x): x is KtServerMessage` and
  `parseKtServerMessage(raw: string): KtServerMessage | null` mirroring the existing client-side
  guards (validate `type` ∈ {joined,snapshot,error,over} and each variant's required fields;
  `state` present where required; `winner` is `number | 'draw'`; never throw). Export both from the
  engine barrel (`src/index.ts` / `src/net/index.ts` as the client parser is exported today). Add
  cases to `net/protocol.test.ts`: each valid server frame round-trips, and malformed/`null`/unknown-type
  inputs return `null`/false.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/net/protocol.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/net/protocol.test.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/index.ts
- Verify (HOST): `pnpm --filter @shatteredarchive/kingdom-tactics-engine test` green (was 142);
  new assertions pass. Confirm the barrel exports resolve.

### [x] 2. Client transport — `KtSocket`
- Do: Create `features/net/kt-socket.ts`: a thin transport that opens a `WebSocket` (via an
  injectable factory `open: (url) => WebSocketLike` defaulting to `(url) => new WebSocket(url)`),
  `send(msg: KtClientMessage)` → `JSON.stringify`, parses each incoming frame with the engine's
  `parseKtServerMessage` and dispatches to registered handlers (`onMessage(KtServerMessage)`,
  `onOpen`, `onClose`, `onError`), exposes `status: 'connecting'|'open'|'closed'` and `close()`.
  A malformed/unparseable frame is dropped (optionally surfaced via `onError`), never thrown. No
  auto-reconnect in v1 (document the choice). Define a minimal `WebSocketLike` interface so the
  fake in tests needs no DOM.
- Files: /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/kt-socket.ts,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/kt-socket.test.ts
- Verify (HOST): client test with a fake socket: constructing opens via the factory; `send` serializes
  a `join`; a pushed `joined`/`snapshot` frame reaches `onMessage` typed; a garbage frame is dropped
  without throwing; `close()` flips status. `pnpm --filter @shatteredarchive/kingdom-tactics-client test`.

### [x] 3. Client hook — `useKtMatch`
- Do: Create `features/net/hooks/useKtMatch.ts`: `useKtMatch()` → `{ connect(cfg: {url; matchId; side?}),
  submit(action: Action), leave(), status, side, snapshot, error, winner, over }`. On `connect` it opens
  a `KtSocket`, and on open sends `join{matchId, side}`. It maps frames: `joined` sets `side` + `snapshot`,
  `snapshot` replaces `snapshot` (server-authoritative — no local reducer), `over` sets `winner`+`over`+final
  snapshot, `error` sets `error`. `submit` sends `action{matchId, action}` (guard: only when connected &
  not over). `leave`/unmount sends `leave` and closes the socket; use a generation ref so a stale socket's
  late frames can't commit over a newer connection (mirror `useSimBatch`). Feed the shared `providers`
  singleton where needed.
- Files: /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/hooks/useKtMatch.ts,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/hooks/useKtMatch.test.ts
- Verify (HOST): hook test with an injected fake socket driving open→`joined`(side 0, snapshot)→`snapshot`→`over`:
  assert `side`, that `snapshot` tracks the latest frame, `submit` sends a well-formed `action`, `winner`/`over`
  set on the over frame, and unmount sends `leave`+closes. `pnpm --filter @shatteredarchive/kingdom-tactics-client test`.

### [x] 4. `OnlineMatchScreen` + styles
- Do: Create `features/net/OnlineMatchScreen.tsx` (+ `OnlineMatchScreen.css`, + `index.ts` barrel exporting
  `OnlineMatchScreen`, `useKtMatch`, `KtSocket`, and the config types). Pre-connect: a small form — Match id
  (default `duel-1`), Server URL (default `import.meta.env.VITE_KT_WS ?? 'ws://localhost:8090/ws/kt'`), a
  Connect button, plus a `role="status"` connection banner. Connected: render the reused `Arena` with
  `state={snapshot}`, `controllableSide={side}`, `legalActionsFor` = local `legalActions(snapshot,
  snapshot.activeSide, providers)` filtered by tokenId, `onAct={submit}`, and `interactive={snapshot.activeSide
  === side && !over}` so it's live only on your turn (show "Waiting for opponent…" otherwise). On `over` show a
  winner banner (win/lose/draw from `side`) with Leave→menu. Surface `error` inline. "Back to menu" leaves+closes.
- Files: /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/OnlineMatchScreen.tsx,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/OnlineMatchScreen.css,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/index.ts,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/OnlineMatchScreen.test.tsx
- Verify (HOST): screen test with an injected fake socket — Connect sends `join`; a `joined`+`snapshot` renders
  the arena (find the board region / a token); clicking a legal move calls `submit` with an `action` frame; an
  `over` frame shows the winner banner. Plain matchers. `pnpm --filter @shatteredarchive/kingdom-tactics-client test`.

### [x] 5. Wire nav + menu + indexes, full-suite sign-off
- Do: Add `'online'` to the `Screen` union (`state/nav.tsx`), route it in `App.tsx`
  (`case 'online': return <OnlineMatchScreen />;`), add an "Online Match" button to `MainMenu.tsx`
  (after Simulator) and update its docstring. Add an `App.test.tsx` nav test (open Online Match →
  heading + Connect present → Back to menu returns to Quick Match). Author `features/net/.ai-context`
  + `.annotated` (+ `hooks/.annotated`) for the new files, and update `features/.ai-context` to describe
  the sixth slice ("net — online multiplayer over /ws/kt"). Add `@ai-` headers only where the slice's
  convention warrants.
- Files: /workspace/shattered-archive/apps/kingdom-tactics-client/src/state/nav.tsx,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/App.tsx,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/pages/MainMenu.tsx,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/App.test.tsx,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/.ai-context,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/.annotated,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/net/hooks/.annotated,
  /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/.ai-context
- Verify (HOST): full client suite green (39 + the new net tests), `pnpm --filter
  @shatteredarchive/kingdom-tactics-client build` clean with the net slice in the graph
  (module count rises), engine suite green, server suite green (unchanged, 10). Set `Status: COMPLETE`.

## Progress log

- 2026-07-10T09:24:00 plan created (Phase 7 — client net slice; server gateway + protocol already exist from Phase 4)
- 2026-07-10T10:20:00 step 1 done: engine server-message validator — added isKtServerMessage/parseKtServerMessage to net/protocol.ts (symmetric to client guards; winner=number|'draw', shallow state guard) + 7 tests; engine suite 149 passed (was 142); auto-exported via existing `export * from './net/protocol.js'` barrel.
- 2026-07-10T10:35:00 step 2 done: client transport features/net/kt-socket.ts (KtSocket + WebSocketLike + injectable SocketFactory; parses frames via parseKtServerMessage, drops garbage→onError, no reconnect) + 7 tests with a DOM-free fake socket, green. NOTE: had to rebuild the engine (pnpm --filter engine build) so the client's ts-jest saw the new exports in dist/index.d.ts.
- 2026-07-10T10:50:00 step 3 done: features/net/hooks/useKtMatch.ts — server-authoritative hook (no local reducer), connect→join on open, joined/snapshot/over/error frame mapping, generation-ref guards stale-socket late frames, submit gated on open+!over (overRef), leave/unmount send leave+close. 6 tests (incl. superseded-connection late-frame drop) green.
- 2026-07-10T11:10:00 step 4 done: features/net/OnlineMatchScreen.tsx (+css +index.ts barrel) — connect form, role="status" banner, reuses controlled Arena from server snapshots, interactive only on my turn, over banner. 3 tests green (form→join, joined→arena renders + click→action, over→banner). GOTCHA: jest runs modules as CJS (no --experimental-vm-modules), so `import.meta.env` is a hard load-time syntax error — isolated the Vite env read into kt-config.ts + a static kt-config.stub.ts mapped via moduleNameMapper `^\\./kt-config$`. Full client suite 55 passed / 14 suites (was 39 / 11).
- 2026-07-10T12:30:00 step 5 done + PHASE 7 COMPLETE: nav `'online'` in state/nav.tsx, App.tsx route (`case 'online'`), MainMenu "Online Match" button (after Simulator) + docstring, App.test.tsx online-nav case, and features/net/.ai-context + .annotated (+ hooks/.annotated) + features/.ai-context sixth-slice entry — all authored (code landed in the prior session; sign-off was blocked by a transient classifier outage). HOST verify (this session, all green): engine test 149/149 (19 suites); server test 10/10 (2 suites); client test 56/56 (14 suites) — the +1 over step-4's 55 is the App online-nav case; client `vite build` clean, 90 modules (was 84 at Phase 6, so the net slice is in the graph). Status → COMPLETE. Phase 7 delivers the client `net` slice: KtSocket transport + useKtMatch hook + OnlineMatchScreen playing a server-authoritative match over /ws/kt from snapshots, plus the engine's symmetric parseKtServerMessage. Deferred to a later phase: auto-reconnect / reconciliation / identity (v1 has none).
