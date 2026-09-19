# Plan: Port auto-leveling to the mobile client (dsl-client)

Created: 2026-09-12T20:10:00Z · Workspace: /workspace/shatteredarchive-mobile · Status: ACTIVE
Task: Port the game-client auto-leveling wizard + engine (area/class selection, buff/fight
config, vitals-aware movement+combat automation) to the React Native/Expo mobile app, reusing
the same C# `/maps/autoleveling/*` endpoints and porting the engine's event-driven logic onto
this app's own connection-manager/event-bus/AsyncStorage primitives.

**⚠ BLOCKED on the web-side plans, per explicit user priority (2026-09-12T20:20Z): "Web comes
first."** Do not pick up Step 1 of this plan until `20260909-0739-autoleveling-redesign.md`
(step 13), `20260912-1629-autoleveling-combat-rest-tuning.md` (steps 8-9), and
`20260813-1325-movement-tracking-fix.md` (all 6 steps, including the new Step 5 this session
added) are as finished as they can be without further blocking on this port. Porting the
CURRENT, still-being-fixed engine now would mean porting known bugs and redoing the port work
once those land — the user has explicitly ruled that out as the ordering.

**Companion plans (web side) — read before porting engine logic, not just for reference.**
`.ai-plans/20260909-0739-autoleveling-redesign.md` (12/13 steps done) and
`.ai-plans/20260912-1629-autoleveling-combat-rest-tuning.md` (7/9 steps done) are the SOURCE OF
TRUTH for what the engine currently does. This plan ports the CORE engine as it exists today —
it does **not** fold in `20260912-1629`'s vitals-gates/once-per-X/Rest-step/queue-hygiene work,
which is its own deliberate Phase 2 (a new plan, created once this one lands and is live-tested),
matching the exact reason those two web plans were split into separate documents (size). Also
note: `20260813-1325-movement-tracking-fix.md` (movement outcome tracking) and the just-added
`engageTarget` queue-depth-timeout step are STILL UNIMPLEMENTED on web as of this plan's creation
— this plan ports the CURRENT (imperfect) movement/engagement logic as-is. If those web fixes
land before this plan finishes, re-sync rather than porting twice; log either way.

## Goal
A player can open the mobile app, pick an area + class, configure buffs/fight commands, and run
a working auto-leveling loop (move → identify → engage → fight → loot/rest → repeat) against a
real DSL connection — functionally equivalent to the web wizard's core loop, adapted to this
app's own UI idiom (not a pixel-clone of the desktop 6-step wizard). **Android first**: buildable
and verifiable now (`expo run:android`, no Mac needed). Nothing in this feature should need a
native module, so the same code should run on iOS unchanged — iOS gets a build+verify pass
whenever a Mac is available, not a separate implementation. Done when: a real Android
device/emulator run completes at least one full move→engage→fight→loot cycle against DSL, config
persists across app restarts, and `tsc`/`jest` are green.

## Constraints
- pnpm via Corepack. This repo is its OWN pnpm workspace — `pnpm-workspace.yaml` is the only
  place pnpm reads settings from (project `.npmrc`/`package.json`'s `pnpm` key are silently
  ignored here); RN needs `nodeLinker` hoisted or Metro can't resolve `@babel/runtime`; jest-expo
  needs a pnpm-aware `transformIgnorePatterns`; `tsc` currently has a pre-existing baseline of 7
  errors unrelated to this work — don't chase those down, only new errors from this plan's own
  files block a step.
- **No native modules for this feature.** Pure JS/TS engine + RN views + AsyncStorage + the
  existing `eventBus`/`connectionManager` — the SAME code targets Android and iOS. Do not gate
  behind `Platform.OS`; ship it unconditionally cross-platform. Only the BUILD/RUN verification
  (Step 6/7) is Android-only right now for lack of a Mac.
- **Reuse the send/queue pipeline, don't build a second one.** `outbound-queue.ts` explicitly
  mirrors the web client's implementation "so mobile and web stack and pace commands identically"
  — the engine's sends must go through `connectionManager`/`OutboundQueue`, not a parallel path.
- **Reuse the CONFIRMED-identical GMCP event names** `script-engine.ts` already emits
  (`game:char-data`, `game:room-data`, `game:tick`, `game:affects-trueup`, `game:affect-added`,
  `game:affect-removed`, `game:character-login`) — this 1:1 parity with the web client's event
  names is what makes porting the engine's event-driven logic tractable without renaming
  anything on either side.
- **Storage is AsyncStorage only** (no IndexedDB/MMKV/SQLite in this app) — follow the existing
  plain `JSON.stringify`-per-key idiom (`walkable-area-storage.ts`), not a new KV abstraction.
- **No new C# work.** `/maps/autoleveling/areas`, `/areas/{slug}`, `/classes` already exist and
  are live (built during the web redesign plan's steps 3/10). Step 1 must explicitly decide
  whether to call them via web-server's proxy (cache + offline fallback, matches web) or direct
  to the C# service (matches THIS app's own existing `walkable-areas/api.ts` precedent, which
  bypasses web-server) — record the decision and why, don't default silently.
- Refresh `.ai-context`/`.annotated` in touched dirs — this app already maintains these
  meticulously (see `features/combat/.ai-context`'s own note that its layout deliberately
  "mirrors the web game client... so further ports drop in without rearrangement").
- Screenshot/interactive review at UI-facing steps, same spirit as the web wizard plan, but here
  it means a real device/emulator capture — there is no Playwright/browser-test tool for RN.

## Context
- **Source of truth to port FROM (game-client) — read the actual code before porting semantics,
  don't guess from memory of this plan's own summaries:**
  - `/workspace/shattered-archive/apps/game-client/src/features/autoleveling/autoleveling-engine.ts`
    — round loop, fight loop (`engageTarget`/`waitForEngageOutcome` :1827-1890), flee-pause
    (`boundOnFlee` :477-483), movement wait (`waitForMovement`), rest cycle
    (`checkDuringRoundRest`/`waitForRecovery` :590-624), vitals gates (`vitalsGateSatisfied`).
  - `autoleveling-types.ts`, `autoleveling-defaults.ts`, `autoleveling-user-data.ts` (IndexedDB
    store — the AsyncStorage swap point), `autoleveling-wizard-config.ts` (`draftToConfig`),
    `autoleveling-maps-client.ts` / the area+class content-cache client (the API-client pattern
    to port), `components/AutoLevelingWizard.tsx` + `components/wizard/*.tsx` (UI reference, not
    a literal template — see Step 4), `hooks/useAutoLeveling.ts` (engine lifecycle + config
    persistence — the shape a mobile hook should mirror).
- **Mobile primitives confirmed this session (file:line, trust these, don't re-derive):**
  - `/workspace/shatteredarchive-mobile/dsl-client/features/connection/connection-manager.ts` —
    singleton `connectionManager`, survives screen unmount/remount. `sendUserInput(raw)`
    (:296-305) is the ONLY send entry point today: splits `;`-stacked input via
    `preprocessCommand`, enqueues onto `OutboundQueue`, offers each line to the script engine
    (aliases/triggers) before a raw socket send. **No separate programmatic/non-preprocessed
    send path exists yet** — Step 3 must add one or deliberately reuse this one.
    `subscribeOutput`/`subscribeState` (:180-192) expose terminal text + connection status.
  - `/workspace/shatteredarchive-mobile/dsl-client/features/scripts/script-engine.ts:192-208`
    `processGmcpEvent(module, data)` — the GMCP→eventBus demux. Confirmed emits, verbatim:
    `game:char-data`, `game:room-data`, `game:tick`, `game:affects-trueup`, `game:affect-added`,
    `game:affect-removed`, `game:character-login` — identical names to the web client's own GMCP
    event bridge.
  - `/workspace/shatteredarchive-mobile/dsl-client/features/scripts/event-bus.ts` — trivial
    `on(name,handler)`/`emit(name,payload)`/`clearAll()` pub-sub; the mobile equivalent of
    game-client's `window` CustomEvent bus (`DispatchEvent`/`addEventListener`).
  - `/workspace/shatteredarchive-mobile/dsl-client/features/hud/vitals-store.ts` — existing
    `useVitalsState()`/`pct()` already parse `game:char-data` into hp/mp/stamina (+ max values).
    `isFighting` is NOT parsed here yet — it rides in the same `char_data` GMCP payload per the
    web engine's own `onCharDataFighting` handler; the mobile port needs to read it too.
  - `/workspace/shatteredarchive-mobile/dsl-client/features/walkable-areas/{api.ts,
    walkable-area-storage.ts,walkable-area-types.ts}` — the CLOSEST existing precedent (area
    speedwalk-to-start-room ONLY, no targets/mobs/class data), but `api.ts` calls the OLD
    `directions/fetch-area-as-json/{areaId}` endpoint DIRECTLY against the C# service
    (`API_BASE` = `http://10.0.2.2:5000` dev / `https://shatteredarchive.com` prod), bypassing
    web-server entirely. Copy the STORAGE idiom (plain AsyncStorage + JSON, one key); do NOT
    copy the API pattern — it's superseded by the newer `/maps/autoleveling/*` endpoints.
  - `/workspace/shatteredarchive-mobile/dsl-client/features/combat/.ai-context` — explicit
    standing convention: "Mirrors the web game client's features/combat layout so further ports
    drop in without rearrangement." `features/autoleveling/` should follow the same layout.
  - `/workspace/shatteredarchive-mobile/dsl-client/components/PlayContainer.tsx` — the main play
    screen. Has a `Compass` side-panel plus HUD-settings toggles (landscape/portrait position) —
    the natural place for an auto-level control surface, mirroring the web client's
    `CommandInput.tsx` auto-level toggle button.
  - `/workspace/shatteredarchive-mobile/dsl-client/package.json` —
    `@react-native-async-storage/async-storage` (no MMKV/SQLite); Expo 52 / RN 0.76;
    `android/` + `ios/` native projects both checked in (`ios/Podfile` present); no `eas.json` —
    local `expo run:android`/`expo run:ios` builds, not EAS Build.
- A `qwen pack` orientation call over these mobile files failed this session (`TypeError: fetch
  failed` from the shattered_mcp container) — degraded to direct reads per the fallback rule.
  Worth a quick retry at the start of Step 1 in case it was transient; not a blocker either way.

## Steps

### [ ] 1. Mobile API client + cache for autopilot area/class data
- Do: New `features/autoleveling/autoleveling-content-api.ts` — port `AutoPilotArea`/
  `AutoPilotTarget`/class DTOs verbatim as TS types (mirror game-client's types file, don't
  redesign the shape), fetch `/maps/autoleveling/areas` (index), `/areas/{slug}` (detail),
  `/classes`. **Decide and record**: call through web-server's proxy (gets caching + offline
  fallback, matches web) or direct to C# (matches this app's OWN `walkable-areas/api.ts`
  precedent) — pick one, state why, note the dev `API_BASE` implication either way (web-server's
  dev port vs. C#'s `10.0.2.2:5000`). New `autoleveling-content-storage.ts` — AsyncStorage cache
  with a soft TTL (mirror the web IndexedDB cache's freshness window), plain-JSON-per-key idiom
  like `walkable-area-storage.ts`.
- Files: /workspace/shatteredarchive-mobile/dsl-client/features/autoleveling/autoleveling-content-api.ts (new)
  /workspace/shatteredarchive-mobile/dsl-client/features/autoleveling/autoleveling-content-storage.ts (new)
  /workspace/shatteredarchive-mobile/dsl-client/features/autoleveling/autoleveling-content-types.ts (new)
- Verify: a jest test hitting a mocked fetch confirms index/detail/classes parse into the typed
  DTOs and the AsyncStorage cache round-trips (write → read without a network call); `tsc` clean
  for the new files.

### [ ] 2. Port config/user-data storage onto AsyncStorage
- Do: Port `autoleveling-types.ts` (AutoLevelConfig + action types), `autoleveling-defaults.ts`,
  and `autoleveling-user-data.ts` (buff/fight overlays, custom targets, custom paths, prefs) —
  same shapes, AsyncStorage instead of IndexedDB, one key per record kind (or one JSON blob per
  area+kind, matching the web store's keying) rather than inventing a new schema. **Decide**:
  start fresh at v1 (mobile has no legacy users/data to migrate) rather than importing web's
  v2→v3 migration baggage — record that choice.
- Files: /workspace/shatteredarchive-mobile/dsl-client/features/autoleveling/autoleveling-types.ts (new)
  /workspace/shatteredarchive-mobile/dsl-client/features/autoleveling/autoleveling-defaults.ts (new)
  /workspace/shatteredarchive-mobile/dsl-client/features/autoleveling/autoleveling-user-data.ts (new)
- Verify: jest tests mirroring the web suite's coverage for default-config shape + user-data
  CRUD round-trips via a mocked AsyncStorage; `tsc` clean.

### [ ] 3. Port the engine core
- Do: Port `autoleveling-engine.ts`'s round loop, fight loop, movement wait, flee-pause, vitals
  gates onto this app's primitives: replace `window` CustomEvent dispatch/listen with
  `eventBus.on`/`eventBus.emit` using the event names confirmed in Context (no renaming); replace
  `shatteredarchive:send-command` dispatch with a call into `connectionManager` — either add a
  new pass-through send method (bypassing `preprocessCommand`'s stacking-split, since the engine
  already sends one command at a time) or deliberately reuse `sendUserInput` and record why. Add
  `isFighting` parsing to whatever reads `game:char-data` (vitals-store's parser only reads
  hp/mp/stamina today). Port the CURRENT web behavior faithfully, bugs included (per the plan
  header) — do not fix the movement-tracking or `engageTarget` timeout issues here; that's the
  other plans' job, on web, first.
- Files: /workspace/shatteredarchive-mobile/dsl-client/features/autoleveling/autoleveling-engine.ts (new)
- Verify: port the web engine's jest suite (`autoleveling-engine.test.ts`) onto jest-expo,
  adapting only the event-dispatch/send mocks to `eventBus`/`connectionManager`; suite green,
  `tsc` clean.

### [ ] 4. Minimal mobile UI for area/class/buff/fight configuration
- Do: A pragmatic first pass, NOT a literal port of the desktop's 6-step wizard — decide the
  actual screen shape as part of this step. Consider a single scrollable config screen (see
  `app/(tabs)/settings.tsx`'s per-section layout for a precedent of a long RN-native config form)
  rather than a multi-step stepper, given mobile screen real estate; area/class pickers, a buff
  list, a fight-command list, using `autoleveling-content-api.ts`'s served data. Screenshot the
  result on a real device/emulator for review before wiring it live.
- Files: /workspace/shatteredarchive-mobile/dsl-client/features/autoleveling/ (new UI files, TBD by this step)
  /workspace/shatteredarchive-mobile/dsl-client/components/ (new screen component(s), TBD)
  /workspace/shatteredarchive-mobile/dsl-client/app/ (new route, if a dedicated screen)
- Verify: screenshot review (device/emulator) of the config UI; `tsc` clean.

### [ ] 5. Wire engine + UI into PlayContainer
- Do: New `features/autoleveling/useAutoLeveling.ts` (or equivalent) mirroring the web hook's
  shape — engine lifecycle (start/pause/resume/stop) + config persistence via Step 2's store. Add
  a control surface into `components/PlayContainer.tsx` (button/panel near the existing Compass
  panel) to open the config screen and start/stop a run; surface run status (round/step) the way
  the web `CommandInput.tsx` toggle does.
- Files: /workspace/shatteredarchive-mobile/dsl-client/features/autoleveling/useAutoLeveling.ts (new)
  /workspace/shatteredarchive-mobile/dsl-client/components/PlayContainer.tsx
- Verify: screenshot review of the control surface in both landscape/portrait (matching
  PlayContainer's existing Compass landscape/portrait handling); `tsc` clean.

### [ ] 6. Tests + Android build/run verification
- Do: Full `jest` pass for all new files. Build and run on a real Android device or emulator
  (`expo run:android`) against a live DSL connection; exercise at least one full
  move→identify→engage→fight→loot cycle; confirm config persists across an app restart (kill +
  relaunch, not just a screen remount).
- Files: none (verification only — record actual steps + results in the Progress log).
- Verify: `jest` all-green; a real Android run completes the cycle above with no crash; config
  survives a full app restart.

### [ ] 7. iOS — code parity confirmation, build deferred
- Do: Confirm (grep/review) that nothing from Steps 1-5 imports a native module or uses
  `Platform.OS` to fork behavior — this feature should need neither. Do NOT attempt
  `expo run:ios` without a Mac. Record explicitly that iOS build/run verification is deferred
  until one is available, so this plan isn't mistaken for iOS-complete.
- Files: none (review only).
- Verify: a manual read confirms no native-module imports in the new files; Progress log states
  iOS is code-parity-confirmed but NOT build-verified, and why.

## Progress log

- 2026-09-12T20:10:00Z plan created (user ask — port both auto-leveling plans to mobile, Android
  first, iOS deferred to whenever a Mac is available but code should stay cross-platform).
  Oriented via `.ai-context`/`.annotated` across `features/connection`, `features/hud`,
  `features/scripts`, `features/walkable-areas`, `features/combat`, `app/`, `app/(tabs)/` before
  reading any code (per this repo's own convention) — a `qwen pack` call for deeper multi-file
  orientation failed (`fetch failed`) and was NOT retried; degraded to direct reads instead, which
  turned up the concrete integration points cited in Context: GMCP event names are a CONFIRMED
  1:1 match with the web client's, `connection-manager.ts`/`outbound-queue.ts` already explicitly
  mirror the web client's send/queue pipeline, storage is AsyncStorage-only, and the closest
  existing precedent (`walkable-areas`) calls a DIFFERENT, older, non-proxied endpoint than the
  one this port actually needs. Scoped this plan to the CORE engine port only (mirroring
  `20260909-0739-autoleveling-redesign.md`'s scope), deliberately excluding
  `20260912-1629-autoleveling-combat-rest-tuning.md`'s vitals-gates/Rest-step/queue-hygiene work
  as an explicit Phase 2 follow-on plan, for the same sizing reason those two web plans were
  split. Nothing implemented yet.
