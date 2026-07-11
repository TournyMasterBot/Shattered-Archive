# Plan: Kingdom Tactics — Phase 4 (server app + /ws/kt authoritative match gateway + AI seat)

Created: 2026-07-08T20:00:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Scaffold `apps/kingdom-tactics-server` (Express 5 + ws, mirroring game-server), define the shared `/ws/kt` transport contract in the engine, build a server-authoritative `MatchSession` that owns a `GameEngine` per match and validates every client action, mount the `/ws/kt` WebSocket gateway that drives sessions and can seat an `IAiPolicy` opponent, and verify on the host.

> DELEGATION / OWNERSHIP — READ FIRST
> Steps are tagged **(CLAUDE)** or **(QWEN-SAFE)**. This phase is mostly judgment (protocol
> design, authoritative match lifecycle, AI scheduling) so most steps are CLAUDE; one pure
> scaffold step is QWEN-SAFE.
> - **How to hand off:** this doc is `Status: ACTIVE`; tell the user to run `/plan resume` in
>   Continue and qwen auto-attaches it. qwen does ONLY (QWEN-SAFE) steps; if `/plan resume`
>   lands qwen on a (CLAUDE) step it must STOP and report "next step is CLAUDE-ONLY".
> - **qwen CANNOT build or test (critical — see incident 2026-07-08).** qwen runs INSIDE the
>   `shattered_mcp` container, which bind-mounts this repo (incl. `node_modules`) read-write. A
>   container-side `pnpm install|build|test` rewrites the shared host `node_modules` with Linux
>   bin shims + a container store path and BREAKS the host Windows toolchain (`'tsc' is not
>   recognized`), forcing a full host reinstall. So a QWEN-SAFE step = TRANSCRIBE the embedded
>   files verbatim, log "transcribed, ready for host verify", and LEAVE THE BOX UNCHECKED. qwen
>   may READ files to confirm faithful transcription; it must never run pnpm/tsc/jest.
> - **Verification is a HOST (Claude/human) task.** Claude runs `pnpm --filter <pkg> build &&
>   … test` on the host, then checks the box + logs the result. Order: Step 1 (CLAUDE, engine
>   protocol) → Step 2 (QWEN-SAFE scaffold — what qwen picks up via `/plan resume`) → Steps 3, 4, 5
>   (CLAUDE). Step 3 (MatchSession) lives in the app Step 2 scaffolds, so Step 2 must land first;
>   Step 4 wires the gateway over Step 3.
> - Exactly ONE ACTIVE plan doc per repo — this is it (p3 is COMPLETE).

## Goal
`apps/kingdom-tactics-server` exists and mirrors `game-server` (Express 5 + `ws`, `services-server`
bootstrap, Winston logging, `/health`). It mounts a `/ws/kt` gateway that hosts **authoritative**
matches: the server owns the `GameEngine`/`MatchState` per match, validates each client action
against the caller's seat + the engine rules, broadcasts the new snapshot to seated clients, and
can seat a `GreedyPolicy`/`RandomPolicy` as an AI opponent that auto-plays its turns. The transport
message contract is a typed discriminated union exported from the engine so client and server
cannot drift. Done when `pnpm --filter @shatteredarchive/kingdom-tactics-server build` and `… test`
are green on the host, the engine still builds/tests green with the new `net/` module, and the
`.annotated`/`.ai-context` indexes for the new/changed dirs are refreshed.

## Constraints
- **Reuse, don't re-derive.** The gateway is glue over the Phase-3 engine: import `applyAction`,
  `legalActions`, `GameEngine`, `RandomPolicy`, `GreedyPolicy`, `createRng`, `createGameDataProvider`,
  `createGameModeProvider` from `@shatteredarchive/kingdom-tactics-engine`. Do NOT re-implement rules.
- **Server-authoritative.** The client never mutates state; it sends intents. The server validates
  (seat ownership + engine legality) and is the sole source of truth. Reject illegal actions with an
  error message; never trust a client-supplied MatchState.
- **Transport contract lives in the engine** (`src/net/protocol.ts`) since the engine is the
  isomorphic package both client and server already depend on — one source of truth, no drift.
  `MatchState` is already a serializable readonly value, so a snapshot IS the state (no custom codec
  in v1).
- **Server code is Node** (Express/ws/dotenv/winston) and lives ONLY in `apps/kingdom-tactics-server`
  — keep it OUT of the engine, which stays isomorphic (`types: []`, no Node built-ins in shipped code).
- Mirror game-server's scripts/config exactly (build=tsc, test=jest with the ROOT config
  `--config ../../jest.config.cjs --rootDir .`, dev=tsx, start=node dist). Use **pnpm** + `workspace:*`.
- Update the barrel (`engine/src/index.ts`) and each new dir's `.annotated`/`.ai-context`.

## Context — verified surfaces (read 2026-07-08; exact)
- **Engine public API** (barrel `services/kingdom-tactics-engine/src/index.ts`, all re-exported):
  `MatchState`, `Action` (`move|attack|ability|end-turn`), `Side`, `applyAction(state, action, rng, providers)`,
  `legalActions(state, side, providers)`, `GameEngine`/`IGameEngine`, `EngineProviders` (`{data, modes,
  abilityResolver?, triggers?}`), `RandomPolicy`, `GreedyPolicy`, `IAiPolicy` (`{name, chooseAction(state,
  side, p, rng)}`), `createRng`, `ISeededRng`, `createGameDataProvider`, `createGameModeProvider`,
  `runMatch`/`MatchConfig`/`MatchResult`, `ScenarioSimulator`. A living token = unit `hp>0` / squadron `hpPool>0`.
- **game-server reference** `apps/game-server/src/index.ts`: bootstraps via
  `getConfigFromEnv('game-server')` + `createExpressService(config, (app)=>{…/ , /health})` from
  `@shatteredarchive/services-server`; `Logger` from same; loads `.env` then `.env.<ENVIRONMENT>`.
  After `service.start()` resolves an `http.Server`, mounts `new WebSocketServer({ server, path:
  '/ws/game' })` and handles `wss.on('connection', ws => …)` with JSON discriminated-union messages
  and a `sendToClient(origin,msg)` helper. Copy this shape; drop the MUD-proxy/telnet specifics.
- **game-server manifest** `apps/game-server/package.json`: `"type":"module"`, scripts
  build/`test`(`jest --config ../../jest.config.cjs --runInBand --rootDir .`)/dev(`tsx src/index.ts`)/
  start(`node dist/index.js`); deps `@shatteredarchive/services-server|types-server|utils-global|
  utils-server` (all `workspace:*`), `@types/ws`, `dotenv`, `express`, `winston`, `ws`.
- **services-server exports** (`services/services-server/src/express-service.ts`):
  `getConfigFromEnv(serviceName): ExpressServiceConfig`, `createExpressService(config, registerRoutes):
  IExpressService` (`.start(): Promise<http.Server>`); `Logger` (`logger-service.ts`).
- **ARCHITECTURE §7** (`apps/kingdom-tactics-client/docs/ARCHITECTURE.md`): "/ws/kt gateway hosting
  authoritative matches: owns the GameEngine instance per match, validates each client action,
  broadcasts state deltas, and can seat an IAiPolicy as an opponent. Transport messages are a typed
  discriminated union shared via the engine." §8 proposes server port **51000** (confirm before the
  Phase-8 Docker wiring; not needed to run `dev`).

### v1 decisions (defaults; flag in Progress log if changed)
1. **Snapshot, not delta, in v1.** Each `KtServerMessage` after an applied action carries the full
   `MatchState` (it is small + already serializable). A true delta channel is a later optimization;
   the message type is named to leave room (`snapshot`), so upgrading is additive.
2. **One match per gateway process in v1**, addressed by a `matchId` string with a tiny in-memory
   registry (`Map<matchId, MatchSession>`). A client `join` with an unknown `matchId` lazily creates
   a session from a default mode/setup (Duel) with the AI seated on the other side; a known id joins
   the existing one. Multi-match scaling + persistence are later phases.
3. **AI seat = `GreedyPolicy` by default** (configurable). After every human action that leaves an
   AI seat as the active side, the session auto-plays that seat's turn(s) via the policy until a
   human seat is active again or the match is decided, emitting a snapshot per applied action.
4. **Action authorization**: a client seated on side S may submit only actions whose acting side is
   S (`move|attack|ability` → token’s `side===S`; `end-turn` → `action.side===S`). The engine then
   enforces turn/legality; if `applyAction` returns the same state ref, it was illegal → reply `error`.
5. **No auth/accounts in v1.** A seat is claimed by the first ws connection that requests it; identity
   is the connection. Reconnect/reconciliation is Phase 7.

## Qwen operating rules (small context — follow exactly on QWEN-SAFE steps)
- **You are a transcriber + reporter, not a builder.** On a QWEN-SAFE step, create the files with
  the EXACT embedded content (adjust only import paths if a barrel differs). Then STOP.
- **NEVER run `pnpm install|build|test`, `tsc`, or `jest` — or any command that writes
  `node_modules` — in the container.** It corrupts the host toolchain (incident 2026-07-08). Do not
  hunt for a test runner; there isn't one you can safely use.
- **Do not verify build/test.** Append a Progress-log line "Step N transcribed, ready for host
  verify" and LEAVE THE BOX UNCHECKED. The host (Claude) runs the suite and checks it off.
- You MAY read files (`.ai-context`, `.annotated`, source) to confirm you transcribed faithfully or
  to copy a template. If reality doesn't match the embedded code, STOP and leave a Progress-log note.
- Container↔host path map: `/workspace/shattered-archive` = `C:/Projects/ShatteredArchive`.

## Steps

### [x] 1. (CLAUDE) /ws/kt transport contract in the engine
- Do: Create `services/kingdom-tactics-engine/src/net/protocol.ts`. Design (judgment — decision 1):
  - `export const KT_PROTOCOL_VERSION = 1 as const;`
  - `KtClientMessage` union: `{type:'join', matchId:string, side?:Side}` | `{type:'action', matchId:string,
    action:Action}` | `{type:'requestSnapshot', matchId:string}` | `{type:'leave', matchId:string}`.
  - `KtServerMessage` union: `{type:'joined', matchId, side:Side, snapshot:MatchState, protocol:number}` |
    `{type:'snapshot', matchId, state:MatchState, lastAction?:Action}` | `{type:'error', matchId?:string,
    message:string}` | `{type:'over', matchId, state:MatchState, winner:Side|'draw'}`.
  - Small type guards `isKtClientMessage(x): x is KtClientMessage` (validate `type` + required fields
    defensively — this parses untrusted socket input) and a `parseKtClientMessage(raw:string):
    KtClientMessage | null` (JSON.parse in try/catch, then guard).
  - Import `Action`, `MatchState`, `Side` as types from `../model/index.js`. Pure, isomorphic, no Node.
- Then: add `export * from './net/protocol.js';` to `src/index.ts` (after the sim exports); create
  `src/net/.annotated` (File Index style, one line for protocol.ts).
- Files: `src/net/protocol.ts`, `src/net/protocol.test.ts`, `src/index.ts`, `src/net/.annotated`.
- Tests: a valid `join`/`action` JSON round-trips through `parseKtClientMessage`; malformed JSON →
  null; an object with a bad/missing `type` → `isKtClientMessage` false; `KT_PROTOCOL_VERSION === 1`.
- Verify (HOST): `pnpm --filter @shatteredarchive/kingdom-tactics-engine build && … test` green
  (engine suite grows by the protocol tests). Box + Progress log.

### [x] 2. (QWEN-SAFE) kingdom-tactics-server app scaffold (Express + /health)
> Transcribe the embedded files verbatim (a trimmed copy of game-server: NO MUD/telnet proxy).
> Do NOT run pnpm/tsc/jest (see Qwen operating rules). Leave the box for the host to verify.
- Do: Create the app package files. Embedded content:
  - `apps/kingdom-tactics-server/package.json`:
    ```json
    {
      "name": "@shatteredarchive/kingdom-tactics-server",
      "version": "0.1.0",
      "private": true,
      "main": "dist/index.js",
      "type": "module",
      "scripts": {
        "build": "tsc -p tsconfig.json",
        "test": "jest --config ../../jest.config.cjs --runInBand --rootDir .",
        "format": "prettier --write \"src/**/*.{ts,tsx,js,jsx,json}\"",
        "dev": "tsx src/index.ts",
        "start": "node dist/index.js"
      },
      "dependencies": {
        "@shatteredarchive/kingdom-tactics-engine": "workspace:*",
        "@shatteredarchive/services-server": "workspace:*",
        "@shatteredarchive/types-server": "workspace:*",
        "@shatteredarchive/utils-global": "workspace:*",
        "@shatteredarchive/utils-server": "workspace:*",
        "@types/ws": "^8.18.1",
        "dotenv": "^17.4.2",
        "express": "^5.2.1",
        "winston": "^3.19.0",
        "ws": "^8.21.0"
      }
    }
    ```
  - `apps/kingdom-tactics-server/tsconfig.json`: COPY `apps/game-server/tsconfig.json` verbatim
    (read it first with the read tool and reproduce it exactly — same compilerOptions/rootDir/outDir).
  - `apps/kingdom-tactics-server/.env` (NOTE: `getConfigFromEnv` reads the GENERIC `process.env.PORT`,
    not a service-specific name — verified in `services/services-server/src/express-service.ts:111`):
    ```
    ENVIRONMENT=dev
    PORT=51000
    LOG_FILE_PATH=./log/server.log
    JSON_LOG_FILE_PATH=./log/server.log.jsonl
    ```
  - `apps/kingdom-tactics-server/src/index.ts` (transcribe VERBATIM — a trimmed game-server bootstrap,
    only `/` + `/health`, no ws yet; Step 4 adds `/ws/kt`):
    ```ts
    import fs from 'fs';
    import path from 'path';
    import dotenv from 'dotenv';
    dotenv.config();

    import { LogLevel, type ServerHealth } from '@shatteredarchive/types-server';
    import { getConfigFromEnv, createExpressService, Logger } from '@shatteredarchive/services-server';

    const log = new Logger({
      consoleLevel: LogLevel.Debug,
      diskJsonLevel: LogLevel.Debug,
      diskJsonEnabled: true,
      diskJsonPath: process.env.JSON_LOG_FILE_PATH ?? './log/server.log.jsonl',
      level: LogLevel.Debug,
      fileLevel: LogLevel.Debug,
      filePath: process.env.LOG_FILE_PATH ?? './log/server.log',
      maxSize: process.env.LOG_MAX_FILE_SIZE ?? undefined,
      maxFiles: process.env.LOG_MAX_FILES ?? undefined,
      datePartitioned: Boolean(process.env.LOG_DATE_PARTITIONED ?? 'false'),
      diskToggleOnSoh: Boolean(process.env.LOG_RESPECT_SOH ?? 'true'),
      sohToggleEventTypes: [],
    });

    const baseEnvFile = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(baseEnvFile)) {
      throw new Error(`Fatal exception : Could not find base environment file at ${baseEnvFile}`);
    }
    dotenv.config({ path: baseEnvFile, override: true });

    const env = process.env.ENVIRONMENT ?? 'dev';
    const envFile = path.resolve(process.cwd(), `.env.${env}`);
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile, override: true });
      log.debug('[kingdom-tactics-server] Loaded environment overrides', { envFile });
    } else {
      log.warn('[kingdom-tactics-server] No environment override file found', { envFile });
    }

    const config = getConfigFromEnv('kingdom-tactics-server');

    const service = createExpressService(config, (app) => {
      app.get('/', (_req, res) => {
        res.json({ message: 'Hello from kingdom-tactics-server' });
      });
      app.get('/health', (_req, res) => {
        const health: ServerHealth = { status: 'ok', uptimeSeconds: process.uptime() };
        res.json(health);
      });
    });

    service
      .start()
      .then((httpServer) => {
        log.info('[kingdom-tactics-server] Listening on port', { port: config.port });
        // Step 4 mounts setupKtWebSocketGateway(httpServer) here.
        void httpServer;
      })
      .catch((err) => {
        log.error('[kingdom-tactics-server] Failed to start', { err });
        process.exit(1);
      });
    ```
  - `apps/kingdom-tactics-server/src/.annotated` + `.ai-context`: one File Index line for index.ts and
    a 2–3 sentence folder narrative (Express + ws gateway for authoritative Kingdom Tactics matches).
- Files: the five paths above (+ the two index files).
- Verify: HOST job — do NOT build. Append "Step 2 transcribed, ready for host verify" and leave the
  box unchecked. (Claude will `pnpm install` on the host to link the new workspace package, then build.)

### [x] 3. (CLAUDE) MatchSession — server-authoritative match owner
- Do: In the server app (scaffolded in Step 2, so the package + dir already exist) add
  `apps/kingdom-tactics-server/src/match/match-session.ts`. A ws-agnostic class, unit-testable without a socket:
  - `constructor(opts:{ matchId:string; initial:MatchState; providers:EngineProviders; seed:number;
    aiPolicies?:Readonly<Record<number, IAiPolicy>>; maxTurns?:number })`. Holds `state`, a
    `createRng(seed)`, the seat map, and the AI policies.
  - `snapshot(): MatchState` (current state). `isOver(): boolean`.
  - `claimSeat(side:Side, clientId:string): {ok:true}|{ok:false, reason:string}` — first-come; a side
    with an AI policy or already-claimed human is rejected.
  - `applyClientAction(clientId:string, action:Action): { state:MatchState; lastAction:Action } |
    { error:string }` — authorize (decision 4: caller must own the acting side AND it must be the
    active side) then `applyAction`; if the reducer returns the SAME ref → `{error:'illegal action'}`;
    else update `state` and return the new snapshot.
  - `runAiUntilHuman(): MatchState[]` — while `!isOver()` and the active side has an AI policy and no
    human seat, `chooseAction`+`applyAction`, collecting each intermediate snapshot (decision 3). Guard
    with a max-iteration cap (reuse the sim loop's `MAX_ACTIONS_PER_TURN` idea) to avoid infinite loops.
  - Emit is caller-driven: the gateway calls these and broadcasts; the session itself does no I/O.
- Files: `apps/kingdom-tactics-server/src/match/match-session.ts`, `…/match/match-session.test.ts`.
- Tests (real providers + engine): claiming a free seat succeeds, claiming an AI/occupied seat fails;
  a human action on the wrong side → `{error}`; a legal action advances state; `runAiUntilHuman`
  drives a Greedy AI seat and stops at the human's turn or at victory; a full human(seat0)+AI(seat1)
  Duel reaches `over`.
- Verify (HOST): server `build` + `test` green. Box + Progress log.

### [x] 4. (CLAUDE) Mount the /ws/kt WebSocket gateway over MatchSession
- Do: Add `apps/kingdom-tactics-server/src/ws/kt-gateway.ts` exporting
  `setupKtWebSocketGateway(server: http.Server, opts?: {...})`, and call it from `src/index.ts` after
  `service.start()` (mirroring game-server's `setupGameWebSocketGateway`). Judgment:
  - `new WebSocketServer({ server, path: '/ws/kt' })`; a module-level `Map<string, MatchSession>`
    registry + a `MatchRegistry` helper: `getOrCreate(matchId)` builds a Duel `MatchState` (via a small
    `createDuelMatch()` using `createGameDataProvider`/`createGameModeProvider`) with `GreedyPolicy`
    seated on side 1 (decision 2/3).
  - Per connection: track `{ clientId, matchId?, side? }`. Parse frames with `parseKtClientMessage`;
    on `join` → registry.getOrCreate + `claimSeat(0,…)` (human), reply `joined` with the snapshot;
    on `action` → `applyClientAction`, broadcast `snapshot` to that match's clients, then
    `runAiUntilHuman()` broadcasting each snapshot, and `over` if decided; on `requestSnapshot` →
    reply current; on `leave`/ws-close → release the seat. Invalid frame / illegal action → `error`.
  - Broadcasting: keep a `Set<WebSocket>` per matchId; a `broadcast(matchId, KtServerMessage)` helper
    JSON-stringifies to each OPEN socket (guard readyState like game-server).
- Files: `apps/kingdom-tactics-server/src/ws/kt-gateway.ts`, `…/src/index.ts` (wire it),
  `apps/kingdom-tactics-server/src/ws/.annotated`.
- Tests: `…/src/ws/kt-gateway.test.ts` — exercise the message-routing logic WITHOUT a real socket by
  factoring the per-message handler into a testable `handleClientMessage(conn, msg, registry, send)`
  pure-ish function: a `join` yields a `joined` reply + seat; an `action` yields a broadcast snapshot
  and triggers the AI seat; an out-of-turn action yields `error`; a full game reaches `over`. (Use a
  fake `send` collector; no `ws` needed in the test.)
- Verify (HOST): server `build` + `test` green. Box + Progress log.

### [x] 5. (CLAUDE) Wire scripts, refresh indexes, host sign-off, complete
- Do:
  1. Root `package.json`: add `"dev:kingdom-tactics-server": "pnpm --filter @shatteredarchive/kingdom-tactics-server dev"`
     and `"start:kingdom-tactics-server": "pnpm --filter @shatteredarchive/kingdom-tactics-server start"`
     (mirror the existing `dev:kingdom-tactics-client` entry the user referenced).
  2. Refresh `.annotated`/`.ai-context` for `apps/kingdom-tactics-server/` and its `src/` subdirs, and
     the engine `src/net/` index; confirm the engine barrel exports `net/protocol.js`.
  3. HOST: `pnpm install` (link the new workspace package — run UNWRAPPED, warm store ≈ seconds), then
     `pnpm --filter @shatteredarchive/kingdom-tactics-server build && … test` and
     `pnpm --filter @shatteredarchive/kingdom-tactics-engine build && … test`; REPORT pass/fail + counts.
  4. Optional smoke: `pnpm dev:kingdom-tactics-server` starts, `GET /health` → `{status:'ok'}`.
- Files: `package.json` (root), the `.annotated`/`.ai-context` files above.
- Verify (HOST): both packages build 0 + suites green; `/health` responds. Set this doc
  `Status: COMPLETE`, check the box, append a final Progress-log summary.

## Open decisions (resolve during implementation; note the choice in Progress log)
- **Match setup source**: v1 hard-codes a Duel via `createDuelMatch()`. A `join` payload carrying a
  mode id + army lists (army-builder output) is a natural Phase-5 extension once the client builds armies.
- **Server port 51000** (ARCHITECTURE §8 proposal) — used by `.env`; confirm before Phase-8 Docker/nginx.
- **Delta vs snapshot** (decision 1): snapshots in v1; add a delta message type when payload size matters.
- **Turn timers / AFK**: none in v1; a per-seat clock (`IClock`) is a Phase-7 hardening item.
- **Auth/accounts + reconnect** (decision 5): none in v1; Phase 7 (transport hardening) owns
  reconnect/reconciliation and identity.

## Progress log
- 2026-07-09T15:45 STEP 5 DONE — **PHASE 4 COMPLETE** (CLAUDE, host sign-off). Root `package.json`:
  added `dev:kingdom-tactics-server` (`--filter … dev`) + `start:kingdom-tactics-server`
  (`--filter … start`; node app uses `start`, not the client `preview`). Refreshed indexes:
  `apps/kingdom-tactics-server/.annotated` (was an empty stub) + `.ai-context`, plus `src/`,
  `src/match/`, `src/ws/` `.annotated` and `src/.ai-context`; engine `src/net/.annotated` present and
  barrel exports `net/protocol.js` (confirmed). Host sign-off: engine `build` 0 + `test` 127/127
  (18 suites) — unaffected by Phase 4; server `build` 0 + `test` 10/10 (MatchSession 5 + gateway 5);
  live smoke of the built server (`node dist/index.js`) → `GET /health` = `{"status":"ok",
  uptimeSeconds:…}` and `GET /` = hello message on PORT 51000, then stopped. Phase 4 delivers the
  server-authoritative `/ws/kt` gateway (registry + MatchSession + Greedy AI seat) over the shared
  engine protocol. Doc Status → COMPLETE. Phase-5 hooks noted in Open decisions (join-payload
  mode/army setup, delta channel, turn timers, auth/reconnect).
- 2026-07-09T15:30 STEP 4 DONE (CLAUDE, host-verified). Added `apps/kingdom-tactics-server/
  src/ws/kt-gateway.ts`: `MatchRegistry` (matchId → MatchSession + a subscriber `Set<KtClientConn>`;
  lazy `getOrCreate`, `subscribe`/`unsubscribe`, `broadcast`; injectable opts `seed`/`aiPolicies`/
  `createInitial` with v1 defaults GreedyPolicy@side1 + a 1v1 `createDuelMatch()`); socket-free
  `handleClientMessage(conn, msg, registry)` routing join (claimSeat side 0 default, subscribe,
  reply `joined`, then driveAi) / action (applyClientAction → broadcast `snapshot`, `over` if
  decided, else driveAi) / requestSnapshot / leave (releaseSeat + unsubscribe); `driveAi` broadcasts
  a `snapshot` per AI action then `over`; `setupKtWebSocketGateway(server, opts)` mounts
  `WebSocketServer({path:'/ws/kt'})`, assigns `c<n>` clientIds, parses UNTRUSTED frames via
  `parseKtClientMessage`, guards `ws.readyState===OPEN`, releases seats on close. Message field
  names match the actual protocol.ts (`state`, not `snapshot`, on joined/over). Wired into
  `src/index.ts` after `service.start()`. + `kt-gateway.test.ts` (5 socket-free tests w/ fake send:
  join reply; legal action → snapshot broadcast + AI drive; wrong-seat error + no snapshot;
  unknown-match error; full human(0)+Greedy(1) duel on an injected dominant setup → `over` winner 0)
  + `ws/.annotated`. Host verify: server `build` = tsc 0, `test` = 10/10 (2 suites: match + ws).
  NEXT: Step 5 (CLAUDE) root scripts + index refresh + engine sanity + sign-off.
- 2026-07-09T15:05 STEP 3 DONE (CLAUDE, host-verified). Added `apps/kingdom-tactics-server/
  src/match/match-session.ts` — `MatchSession` class: transport-agnostic (no I/O), holds `state`
  + one `createRng(seed)` stream (backs BOTH human actions and AI auto-play for deterministic
  replay), a `Map<Side,string>` seat map, and `aiPolicies`. Methods: `snapshot`/`isOver`/`winner`;
  `claimSeat` (first-come, rejects AI-controlled + taken, idempotent same-client); `releaseSeat`
  (for Step-4 leave/close); `applyClientAction` (authorizes seat ownership of the action's acting
  side per decision 4 — `actingSideOf`: end-turn→`action.side`, token actions→token's `.side` via
  `instanceId` lookup — then defers turn/legality to the reducer, same-ref ⇒ `{error:'illegal
  action'}`); `runAiUntilHuman` (mirrors `runMatch`'s per-turn cap + no-op→end-turn anti-stall
  guards, stops when the active side has no AI policy, returns a snapshot per applied action).
  + `match-session.test.ts` (5 tests, real providers/engine: seat claim/reject; wrong-seat reject;
  legal move advances; runAiUntilHuman drives Greedy & hands back; full human(0)+Greedy(1) duel →
  side-0 victory) + `match/.annotated`. **DEVIATION (jest wiring):** the Step-2 embedded
  package.json copied game-server's `test` script (`jest --config ../../jest.config.cjs --rootDir
  .`), but the ROOT config only collects tests by a `-server`/`-client` path SEGMENT, so with
  `--rootDir .` a `-server` package's own co-located tests match NOTHING (game-server has zero test
  files, so this was never hit). Fixed by giving the app a LOCAL `jest.config.cjs` (mirrors the
  engine's isolated config: `testMatch <rootDir>/src/**/*.test.ts`, node env, workspace deps mapped
  to TS sources so no prebuilt engine needed) + `test` script → `jest --config ./jest.config.cjs`;
  silenced ts-jest TS151002 via `diagnostics.ignoreCodes`. Host verify: server `build` = tsc 0,
  `test` = 5/5 passed, clean output. NEXT: Step 4 (CLAUDE) /ws/kt gateway over MatchSession.
- 2026-07-09T14:40 STEP 2 DONE (CLAUDE, host-transcribed + verified). qwen's `/plan resume`
  earlier today MIS-RESUMED the wrong doc: the container's stale active-plan cache still pointed
  at the Phase-3 doc (already `Status: COMPLETE`, all boxes checked), so `plan_step` reported
  "plan complete" and appended a `plan complete` line to the P3 log WITHOUT ever attaching this
  P4 doc — no scaffold was produced (correctly, qwen ran no pnpm/build/test). Claude transcribed
  the embedded Step-2 files on host: `apps/kingdom-tactics-server/{package.json, tsconfig.json
  (verbatim copy of game-server), .env (PORT=51000), src/index.ts (trimmed game-server bootstrap,
  / + /health, no ws yet), src/.annotated, src/.ai-context}`. Host verify: `pnpm install
  --no-frozen-lockfile` linked the new workspace pkg (6.5s, warm store; lockfile updated to add
  it — the legit exception to --frozen-lockfile), then `pnpm --filter …kingdom-tactics-server
  build` = tsc 0 errors. NEXT: Step 3 (CLAUDE) MatchSession. NOTE: pre-flight gap — a stale
  container plan cache can make `/plan resume` resume an already-COMPLETE plan; see the qplan
  skill hand-off pre-flight (add: verify the resumed doc is the intended one, not just that MCP is up).
- 2026-07-08T20:30 Steps REORDERED so the QWEN-SAFE scaffold is Step 2 (right after the engine
  protocol) — `MatchSession` (now Step 3) lives in the app the scaffold creates, and this makes the
  scaffold the next unchecked step for qwen's `/plan resume`. New order: 1 protocol (CLAUDE), 2
  scaffold (QWEN-SAFE), 3 MatchSession (CLAUDE), 4 gateway (CLAUDE), 5 wire+signoff (CLAUDE).
- 2026-07-08T20:35 STEP 1 DONE (CLAUDE). Created `engine/src/net/protocol.ts`
  (`KT_PROTOCOL_VERSION=1`, `KtClientMessage` join/action/requestSnapshot/leave, `KtServerMessage`
  joined/snapshot/error/over, defensive `isKtClientMessage`/`parseKtClientMessage`) + `protocol.test.ts`
  (8 tests) + `net/.annotated` + barrel export. Used `state` (not `snapshot`) as the MatchState field
  name consistently across joined/snapshot/over. Host verify: build 0, jest 127 passed / 0 failed (was
  119). NEXT: Step 2 (QWEN-SAFE scaffold) — hand to qwen via `/plan resume`.
- 2026-07-08T20:00 plan created (Claude). Phase 4 = engine transport contract (CLAUDE 1) +
  authoritative MatchSession (CLAUDE 2) + server scaffold (QWEN-SAFE 3) + /ws/kt gateway (CLAUDE 4) +
  scripts/indexes/sign-off (CLAUDE 5). Delegation model updated post-incident: qwen TRANSCRIBES
  QWEN-SAFE steps only and never runs pnpm/tsc/jest in-container; all build/test verification is a
  HOST (Claude) task. v1 defaults fixed: snapshot-not-delta, one-match registry keyed by matchId,
  GreedyPolicy AI seat auto-playing after each human action, seat-ownership + engine-legality action
  authorization, no auth/reconnect (Phase 7).
