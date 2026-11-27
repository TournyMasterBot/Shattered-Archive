# Tech plan: Port auto-leveling (autopilot) to the mobile client, and move the script editor's Save button

Item: item.md · Scope: scope.md · Planned against: performance/Allocation-hunt @ 9191edc (ShatteredArchive) and optimization/Performance-and-Diagnostics @ 09b5d85 (shatteredarchive-mobile) · Date: 2026-11-20
Standards: docs/standards/typescript.md (section "shatteredarchive-mobile"), docs/standards/data-classification.md · Data classification: Personal (per-account preferences synced to the cloud; no personal values appear in this plan)
Edge-case catalog: cloud-synced-user-content.md, served-fallback-data.md, shared-event-bus.md, persisted-settings-and-defaults.md, automation-run-loops.md, command-templates.md, game-data-privacy.md · Classifiers added (user-approved 2026-11-20): INSET-01 (new file mobile-screen-insets.md), PORT-01 (new file web-to-app-port.md); both are rows below. None declined
Original plan: `legacy-plan.md` (the 2026-09-12 text, kept unchanged). Phases 7-11 of `.ai-plans/active/2026-11-13_editable-autopilot-targets-synced/tech-plan.md` were this port's earlier phases; the owner moved them here on 2026-11-20 (scope.md, decision 1) and they are rewritten below against the code as it is today.

## Goal

(1) In the mobile editor for aliases, triggers and timers, Save can be tapped on every Android device. (2) A player can open the phone app, pick an area and a class from the same served catalog as the web wizard, edit targets, buffs and fight rows, start, pause and stop an autopilot run on a live connection, and the saved configuration moves between web and phone with the existing Save to cloud and Load from cloud buttons. The run behaves like the web engine as of the last phase of `.ai-plans/active/2026-11-18_autopilot-live-test-findings` (gates, serial re-arm queue with capped retry, pause on timeout, lap wait, remembered values, class timing defaults). Android first; no native module, so the same code serves iOS, whose build verification is deferred.

Done when: the Save button is reachable on a recorded Android capture; a recorded Android run completes a move, engage, fight and loot cycle; the configuration survives an app restart; an edit made on web reaches the phone and a phone edit reaches the web; mobile `jest` is green and `tsc` shows no error beyond the recorded baseline.

## Decisions taken by this plan (veto any in chat before Phase 1)

| # | Decision | Why |
|---|---|---|
| D1 | The content API goes through the web-server proxy (`/maps/autoleveling/*`), not straight to C#. | Same snapshot fallback and `X-Maps-Source` header as web (FALLBACK-01); the carried-over choice from Phase 7 of the active plan. `walkable-areas/api.ts:3-4,41` calls C# directly and is the pattern NOT to copy. |
| D2 | Record kinds, ids and normalisation are the web's, taken as they are at Phase 3 (all kinds the web `SYNCED_RECORD_KINDS` lists, the `pref` records included). Mobile starts at version 1 and carries no migration. | One account, two clients: `cloud-sync.ts:28-37` says the wire shapes are the web client's. CLOUDSYNC-01. |
| D3 | The engine sends through `connectionManager` with a new pass-through method that skips `preprocessCommand`'s `;` split and the script-engine intercept, and goes through the existing `OutboundQueue`. | `sendUserInput` (`connection-manager.ts:295`) splits on `;` and offers each line to aliases and triggers; the engine sends one command at a time and must not be rewritten by a user alias. CMDTPL-01: a stored command holding `;` is refused, as on web. |
| D4 | The configuration is a full-screen page `app/autopilot.tsx` (single scrollable form), opened from a control in `PlayContainer`; not a copy of the six-step desktop wizard. | The old plan, Step 4; mobile CLAUDE.md puts full-screen pages in `app/`. |
| D5 | The engine's other inputs are produced inside the app: special-line events (death, flee), a movement tracker, a raw-line subscription. | They are web-only today (scope.md, affected areas); the old plans did not list them. |
| D6 | The Save button leaves the header and becomes a bar fixed at the bottom of the editor, above the navigation bar and the keyboard (owner's answer, 2026-11-20). | The item says only "moved elsewhere"; INSET-01. |
| D7 | End-user documentation is the in-app help text on the configuration page plus `docs/features/autopilot.md` in the mobile repo; developer documentation is the same file's engine and storage sections plus `docs/reference/mobile.md`. | The location the owner approved in the active plan (its Phase 10 and 8); mobile has no separate user guide. |

## Out of scope

- iOS build and run verification (no Mac in this environment); the plan states code parity only.
- Any C# or web-server change; any change to the web engine or wizard (the web plans own them).
- Copilot's need-help signal for a timeout pause (the app has no Copilot; the signal stays unhandled).
- Background-service behaviour beyond what `features/connection` already provides.
- A pixel copy of the desktop wizard.
- Moving other screens' headers: only the script editor's Save is in this item (Phase 1 records which sibling screens were checked).

## Workflows (before and after)

Before diagrams are drawn from the mobile code read for this plan (anchors given). The mobile phases are not built yet; every After step is NEW or CHANGED. None of the diagrams has been rendered: box 8.7.

### W1 — Save to cloud and Load from cloud        changed by: Phase 3
Before (`features/auth/cloud-sync.ts:198-266` save, `:268` fetch, `:289` summarise, `:312` apply)
```mermaid
flowchart TD
  S1["Account section: Save to cloud"] --> S2["saveAllToCloud checks the script and plugin caps"]
  S2 --> S3["PUT scripts, then plugin-configs, then global scripts"]
  S3 --> S4["push library parchment, notes and books"]
  L1["Account section: Load from cloud"] --> L2["fetchCloudSnapshot reads scripts, plugins, buckets"]
  L2 --> L3["summarizeForLoad warns what will be replaced"]
  L3 --> L4["applyCloudSnapshot writes to this device"]
  L5["Autopilot records never leave the phone because the phone has none"]
```

After
```mermaid
flowchart TD
  S1["Account section: Save to cloud"] --> S2["CHANGED: first load the cloud copy of the autoleveling collection and merge, newest updatedAt wins"]
  S2 --> S3["NEW: count records against the 1000 cap, refuse with the server message if over"]
  S3 --> S4["NEW: PUT the autoleveling collection after the existing collections"]
  L1["Account section: Load from cloud"] --> L2["CHANGED: snapshot also carries the autoleveling collection"]
  L2 --> L3["NEW: each record goes through normalizeRecord, malformed ones are dropped, the rest import"]
  L3 --> L4["CHANGED: load summary counts the autopilot records"]
```

### W2 — Running autopilot on the phone        changed by: Phases 4, 5, 6, 7
Before (`PlayContainer.tsx` has the Compass and HUD only, no autopilot control; the game text reaches triggers through `script-engine.ts:138-145`)
```mermaid
flowchart TD
  P1["Player is connected on the play screen"] --> P2["Types commands or uses the Compass"]
  P2 --> P3["connectionManager.sendUserInput splits on semicolons and queues"]
  P4["Game text arrives"] --> P5["script-engine runs triggers and plugins, no event carries raw lines"]
  P6["No movement tracking, no death or flee events, no autopilot"]
```

After
```mermaid
sequenceDiagram
  participant U as Player
  participant C as NEW Autopilot page
  participant H as NEW useAutoLeveling hook
  participant G as NEW Engine
  participant M as connectionManager
  participant S as script-engine
  U->>C: pick area and class, edit rows, press Start
  C->>H: start with the saved configuration
  H->>G: create engine and run
  G->>M: NEW pass-through send, one command at a time
  M-->>S: game text and GMCP
  S-->>G: NEW raw-line, char-data, room-data, tick, affect events
  S-->>G: NEW death, flee and movement events
  G->>H: status round and step
  H->>C: shown on the page and on the play screen control
  U->>H: Pause or Stop from the play screen
```

### W3 — Saving an alias, trigger or timer        changed by: Phase 1
Before (`components/scripts/ScriptEditorModal.tsx:175-189` the modal and header, `:128` `handleSave`, `:320-333` header styles)
```mermaid
flowchart TD
  E1["Player opens New or Edit alias, trigger or timer"] --> E2["Full-screen Modal with a header row at the top"]
  E2 --> E3["Header holds Close, the title and Save at the top right, no inset handling"]
  E3 --> E4["On Android the system UI covers that corner and Save cannot be tapped"]
```

After
```mermaid
flowchart TD
  E1["Player opens New or Edit alias, trigger or timer"] --> E2["Full-screen Modal"]
  E2 --> E3["CHANGED: header keeps Close and the title only, clear of the system bars"]
  E3 --> E4["NEW: Save sits where the owner chose in box 1.1, above the system navigation bar and the keyboard"]
  E4 --> E5["handleSave unchanged"]
```

### W4 — Where the engine's inputs come from        changed by: Phase 4
Before (web: `userScriptRuntime.ts:689` `processForSpecialLines`, `features/movement/movementTracker.ts`; mobile: `script-engine.ts:138-145`)
```mermaid
flowchart TD
  W1a["Web: raw line"] --> W2a["UserScriptRuntime.processForSpecialLines emits flee, death, damage and level-up events"]
  W1a --> W3a["movementTracker listens to raw-data and room events and emits movement succeeded or failed"]
  M1a["Mobile: raw line"] --> M2a["script-engine triggers and plugins only"]
  M2a --> M3a["No special-line events, no movement tracker, no raw-line event on the bus"]
```

After
```mermaid
flowchart TD
  M1a["Mobile: raw line"] --> M2a["script-engine triggers and plugins (unchanged)"]
  M1a --> M3a["NEW: raw-line event on the bus, cheap when nothing listens"]
  M3a --> M4a["NEW: special-line detector emits flee success or failed and creature death"]
  M3a --> M5a["NEW: movement tracker emits movement succeeded or failed from raw lines and room events"]
  M4a --> E1a["Engine"]
  M5a --> E1a
```

### W5 — Which world the autopilot catalog comes from        changed by: Phases 7a, 7b (added by A1)
Before (`DSL/Server/Server.Web.Public/Controllers/MapsController.cs:183-216`, `Server.Dsl/Cache/AutoPilotCache.cs:25-52`)
```mermaid
flowchart TD
  A1["Client asks /maps/autoleveling/areas"] --> A2["MapsController reads AutoPilotCache"]
  A2 --> A3["AutoPilotCache builds from AreaCache and BeastiaryCache, the DSL world only"]
  A3 --> A4["Areas, targets and classes of the DSL game"]
  A5["The simulacrum has no autopilot catalog, so no run can be made there"]
```

After
```mermaid
flowchart TD
  A1["Client asks /maps/autoleveling/areas"] --> A2["MapsController and AutoPilotCache (unchanged, DSL world)"]
  B1["NEW: client asks /maps/autoleveling/sandbox/areas (local stack only)"] --> B2["NEW: sandbox controller, compiled only with CopilotLocal"]
  B2 --> B3["NEW: reads the folder named by the sandbox environment variable"]
  B4["NEW: generator reads the merc-mud area files"] --> B3
  B3 --> B5["NEW: simulacrum areas, targets and the four merc-mud classes"]
```

## Standards applied

- **TypeScript** (`docs/standards/typescript.md`, section "shatteredarchive-mobile"): kebab-case modules in `dsl-client/features/<area>/`, tests in `__tests__/*-test.ts(x)`; no new `any` in production code; storage reads and writes fail safe with `try`/`catch` and a fixed `console.warn` that carries no values; every subscription returns its unsubscribe and an effect removes it; no work after unmount (async and state, decided 2026-11-06).
- **Data classification** (`docs/standards/data-classification.md`, DRAFT): fixtures use placeholder room lines, keywords and a placeholder cloud blob; no character, account or game-text values in the plan, tests or docs.
- **Mobile repo rules** (`shatteredarchive-mobile/CLAUDE.md`): full-screen pages in `app/`; `expo install` for React Native packages (none expected); Android edits only through config plugins (none expected); `docs/implementation-plan/implementation-plan.md` is the resume list and is updated by Phase 8.
- No SCSS: the mobile app styles with `StyleSheet`; the theme is always dark (`CLAUDE.md`, "Theming").

## Edit map

Lines are as of 09b5d85 (mobile) and 9191edc (web, read only). New files have no line. Mobile paths are under `C:/Projects/shatteredarchive-mobile/dsl-client/`.

| File | Line(s) | Anchor | Change | Phase |
|---|---|---|---|---|
| `components/scripts/ScriptEditorModal.tsx` | 175-189, 320-333 | `<Modal visible ... pageSheet`, the `header` row, `saveBtn` styles | move Save out of the header (box 1.1 decides where) and keep the header clear of the system bars; `handleSave` (`:128`) unchanged | 1 |
| `components/scripts/__tests__/ScriptEditorModal-test.tsx` | new | - | the first tests of the modal (there are none: `UserScriptsSection-test.tsx:67` stubs it) | 1 |
| `features/autoleveling/autoleveling-content-types.ts`, `-content-api.ts`, `-content-storage.ts` | new | - | DTOs, fetch through the proxy, AsyncStorage cache with a soft TTL; cache key versioned from the start | 2 |
| `features/autoleveling/autoleveling-user-data.ts` | new | - | same record shapes and ids as web, one AsyncStorage key per record, `normalizeRecord`, override helpers | 3 |
| `features/auth/cloud-sync.ts` | 58-59, 198, 268, 289, 312 | `MAX_SCRIPTS`, `saveAllToCloud`, `fetchCloudSnapshot`, `summarizeForLoad`, `applyCloudSnapshot` | add the autoleveling collection to save (merge first), snapshot, summary and apply; the 1000-record check | 3 |
| `components/AccountSection.tsx` | existing | - | summary text includes the autopilot record count | 3 |
| `features/connection/connection-manager.ts`, `features/connection/outbound-queue.ts` | 295, 17; class at the top of the queue | `sendUserInput`, `preprocessCommand` import, `OutboundQueue` | a pass-through send for programmatic callers through the same queue and pacing (D3) | 4 |
| `features/scripts/script-engine.ts` | 138-145, 209 | `processTriggers(rawLine, EVENT_RAW_DATA)`, `pluginHost.routeEvent`, `processGmcpEvent` | emit a raw-line event on the bus; the special-line detector runs from the same place | 4 |
| `features/autoleveling/special-lines.ts`, `features/movement/*` | new | - | flee and death detector; ported `classifyMovement` and `movementTracker` (web `features/movement/`, 83 and 228 lines) | 4 |
| `features/autoleveling/autoleveling-types.ts`, `-defaults.ts`, `-actions.ts`, `-alignment.ts`, `-command-text.ts`, `-enemy-condition.ts`, `-buff-catalog.ts`, `-cast-outcome.ts`, `-lag.ts`, `-step-prefs.ts`, `-class-defaults.ts`, `-classes.ts`, `-wizard-config.ts` | new | - | pure modules ported from web `features/autoleveling/` with their tests | 5 |
| `features/autoleveling/autoleveling-engine.ts` | new | - | the engine, from web `autoleveling-engine.ts` (2987 lines) as of the port; the `DispatchEvent`/`ListenEvent` sites (web `:1094-1204`, `:1306`, `:1310`, `:1909`, `:1931`, writes to the terminal at `:988`, `:1332`, `:2769`) become `eventBus` and `connectionManager` calls | 6 |
| `features/autoleveling/useAutoLeveling.ts`, `components/autoleveling/*`, `app/autopilot.tsx` | new | - | hook, configuration page, route (D4) | 7 |
| `components/PlayContainer.tsx` | 6, 261, 268-280 | `import Compass`, `showCompass`, `hudPanel`, `gamePanel` | control for open, start, pause, stop and status, in portrait and landscape | 7 |
| `features/hud/vitals-store.ts` | 11-27 | `applyPatch` | read only: the engine reads `isFighting` from `game:char-data` itself (web `autoleveling-engine.ts:1104-1133`), so the store is not changed | - |
| `features/*/.ai-context` and `.annotated` | - | `autoleveling`, `movement`, `connection`, `scripts`, `auth`, `components/autoleveling` | updated in the phase that changes the folder | per phase |
| `docs/features/autopilot.md`, `docs/reference/mobile.md`, `docs/reference/game-client.md`, `docs/implementation-plan/implementation-plan.md` | `game-client.md:128,164` | the `Autoleveling` row and the `useAutoLeveling` row | new feature doc; module and storage-key rows; porting-status row; the resume list | 2-8 |
| `C:/Projects/ShatteredArchive/docs/game/autopilot.md` | - | the web doc | pointer to the mobile doc only if the doc-impact check names it | 8 |
| `C:/Projects/ShatteredArchive/.ai-plans/active/2026-11-13_editable-autopilot-targets-synced/tech-plan.md` | Phases 7-11, W8, Edit-map rows 287-290, edge-case rows E12 and E18, sign-off boxes | - | amendment A13 there removes the mobile phases (done with this plan, see Progress log) | - |

## Edge cases

| Id | Classifier | Condition | Required behaviour | Covered by |
|---|---|---|---|---|
| E1 | INSET-01 | Save button on a phone with a status-bar overlay, a display cutout, gesture or three-button navigation, the keyboard open, landscape, a small screen | the control is fully on screen and tappable in each case; the editor still scrolls | P1 component test (insets mocked) and the Android capture |
| E2 | - | A sibling screen has the same top-right control | checked and listed in Phase 1; changed only if it fails the same way and the owner agrees | P1 |
| E3 | FALLBACK-01 | The proxy serves its offline snapshot | not applicable under A2: the app reads the C# site, which has no snapshot; an unreachable server gives the saved copy or `empty`, never a substitute | P2 test (`empty` and `cache` sources) |
| E4 | - | No network and no cache | the configuration page opens with an empty state and a retry; no throw | P2 test, P7 test |
| E5 | - | AsyncStorage read or write fails | defaults are used; never throws into the UI; one fixed warning | P2, P3 tests |
| E6 | CLOUDSYNC-01 | Kinds the app exports versus what the server accepts | the exported kind list equals the web `SYNCED_RECORD_KINDS`; a test compares them by name | P3 test, P8 live round trip |
| E7 | CLOUDSYNC-02 | The phone saves without having loaded | Save loads the cloud copy, merges (newest `updatedAt` wins), then uploads | P3 test |
| E8 | CLOUDSYNC-03 | The server renames or drops an area target the user edited | the override is kept, not applied, listed as unmatched, reapplies when the key returns | P3 test, P7 test |
| E9 | SETTINGS-01 | Saved configuration was built from defaults | only differences from the default are stored | P3 test |
| E10 | SETTINGS-02 | "Same as default" | strict compare after the same key normalisation as web, no coercion | P3 test |
| E11 | SETTINGS-04 | Records arrive by editor, cloud load, or a script import | every route goes through `normalizeRecord` | P3 test |
| E12 | SETTINGS-06 | A list the user emptied | stays empty; pre-fill only seeds a never-set list; seeded rows are not stored until edited | P7 test |
| E13 | SETTINGS-07 | Code that rebuilds a row from named fields (a mode switch, reset) | copies the row; a test adds a field to the type and the rebuild keeps it | P5, P7 tests |
| E14 | SETTINGS-03 | A running copy merged with stored settings | not applicable: the page re-reads the saved set when it opens (see "not applicable") | - |
| E15 | CLOUDSYNC-02, - | Account near the 1000-record cap | counted before upload; the server's own message is shown; nothing partial is saved | P3 test |
| E16 | - | A cloud record of a known kind with missing or mistyped fields | dropped by `normalizeRecord`; other records still import | P3 test |
| E17 | EVENTBUS-01 | The engine subscribes to `game:char-data` and `game:tick` that `vitals-store` and the HUD also use | verified: mobile `eventBus` keeps a Set per name (`event-bus.ts:5-12`) and `clearAll` is only called by tests; a test proves the engine's subscription does not displace `vitals-store`'s, and that stop and unmount remove only the engine's | P6 test |
| E18 | CMDTPL-01 | A stored command holds `{name}`, `<potion>` or `;` | one expander for every send; an unresolved placeholder is refused; a `;` is refused before it reaches the pass-through send | P5, P6 tests |
| E19 | RUNLOOP-01 | The outer backstop against the movement timeout | derived from the tracker's timeout plus queued lag; never shorter | P4, P6 tests |
| E20 | RUNLOOP-02 | The lap wait and other long waits | Stop and Pause interrupt them | P6 test |
| E21 | RUNLOOP-03 | A failed buff or a dropped affect | capped retry, spaced by lag, one in flight | P6 test |
| E22 | PRIVNAME-01 | Fixtures and docs | placeholder room lines, keywords and ids; no character or account name, no game text; `pnpm check:private-names` in the ShatteredArchive repo covers its side | P2, P3 fixtures, P8 |
| E23 | - | Double tap on Start, or Start while a run exists | one engine instance; the second call is ignored and the status stays right | P7 test |
| E24 | - | The page is closed or the screen unmounts during a run | the run continues (the connection manager outlives screens); reopening shows the live status; the hook's own subscriptions are removed on unmount | P7 test |
| E25 | - | The connection drops or the app is backgrounded and killed | the run stops cleanly on a disconnect event; a restart never resumes by itself | P6, P8 |
| E26 | - | Portrait and landscape control layout | control reachable and not overlapping the Compass in either | P7 capture |
| E27 | - | The raw-line event on the hot path | with no engine listening, the emit does no work beyond a map lookup; the timing diagnostics (`features/diagnostics/timing-diagnostics`) show no new allocation per line in the existing allocation sweep | P4 test and measurement |
| E28 | - | A phase adds a native module or a `Platform.OS` fork | none; checked by a search over the new files | P8 |
| E30 | PORT-01 | Every event the ported engine listens to and every module it imports from outside its own folder | a table of each with its web and app producer is in `docs/features/autopilot.md`; each app-side producer has a test from a sample line; the device run shows a real event reach the engine | P4 tests, P6, P8 |
| E31 | - | The app is pointed at another server or world (the DSL game, the simulacrum, a LAN address) | the saved catalog is keyed by world and origin, so one never shows the other's data; the address is a bundle-time setting and never in a committed file (LOCAL-05 reasoning: a LAN address is Personal) | P2 test (two servers, two worlds) |
| E29 | - | The web engine changes while the port is under way (its Phase 16 is open) | the port records the web commit it was taken from; a later web change is a new item, not a silent drift | P5, P6 |

Classifiers applied: INSET-01 (E1), PORT-01 (E30).

Classifiers not applicable: SETTINGS-03 (E14), SETTINGS-05 (nothing stored is rewritten, mobile starts at version 1), CLOUDSYNC-01 to 03 are applied above; the rest of the catalog (ansi, logtail, autoapproval, local-only, expo-native-upgrade, pointer, mapid, theming for web CSS) does not match this work; `expo-native-upgrade` is not applicable because the Expo upgrade is finished (`.ai-plans-completed/2026-11-01_mobile-expo-sdk-upgrade`) and no native module is added.

Classifiers added on 2026-11-20 after the owner approved both drafts: **INSET-01** (a header or footer action at a screen edge is covered by the system bars) in `docs/standards/edge-cases/mobile-screen-insets.md`, and **PORT-01** (a port misses events the web produces in other modules) in `docs/standards/edge-cases/web-to-app-port.md`; both are in the catalog index.

## Verification toolbox

Mobile repo `C:/Projects/shatteredarchive-mobile`, its own pnpm workspace (pnpm 12.9.1 through Corepack).

| Purpose | Command |
|---|---|
| Mobile tests | `pnpm --dir dsl-client test -- <pattern>` (the `test` script is `jest`; a hook denies a bare jest without `--runInBand` or `--maxWorkers` 1-4, so the pattern runs add `--runInBand`); whole package: the same without a pattern. Filter output with `2>&1 | grep -E "Tests:|Test Suites:|FAIL|✕"` |
| Coverage of new code | `pnpm --dir dsl-client test -- --runInBand --coverage --collectCoverageFrom="features/autoleveling/**" --collectCoverageFrom="features/movement/**"` |
| Typecheck | `pnpm --dir dsl-client exec tsc --noEmit`; the old plan records a baseline of 7 errors, not re-run: box 2.1 records the real count and every later phase compares against it |
| Lint | `pnpm --dir dsl-client lint` (`expo lint`) |
| Bundle check | `pnpm --dir dsl-client exec expo export --platform android --output-dir <a folder outside the repo>` (one-shot, no server; proven in Phase 2, exit 0) |
| Android run | `pnpm start` from the repo root (checks the emulator, then `expo run:android`); the owner approves starting the emulator, target `emulator-5554` only; Metro and any physical phone stay the owner's |
| Captures | emulator screenshots with `adb` (recipe in the owner's notes: never PowerShell `>` for PNGs); progress shots `phase-NN_<name>.png` (git-ignored), final `showcase_NN_<name>.png` in this folder's `screenshots/showcase/` |
| Content API | `curl` against the running web-server: `/api/web/maps/autoleveling/areas`, `/areas/<slug>`, `/classes`; the header `X-Maps-Source` reads `upstream` on the local stack |
| Cloud round trip | a signed-in local test account only (the owner provides it, as for the web plan's Phase 6b); no real account or character names in captures |
| Web side | `pnpm --filter game-client test`, `pnpm typecheck` in `C:/Projects/ShatteredArchive` only if a web file changes (none planned) |
| Doc impact | `node scripts/check-doc-impact.mjs --files <the phase's changed files>` and, at the end, `node scripts/check-doc-impact.mjs <item folder>` in the ShatteredArchive repo; the mobile repo has no such script, so its docs are checked by the Edit-map rows above |

## Phases

### [x] Phase 1 — The script editor's Save button is reachable
Goal:        Save in the alias, trigger and timer editor can be tapped on Android in every layout the plan lists, and the modal has its first tests.
Depends on:  nothing
Workflow:    W3

Work
- [x] 1.1 Where Save goes: the owner chose a bar fixed at the bottom of the editor, above the navigation bar and the keyboard (2026-11-20, D6).
- [x] 1.2 `components/scripts/ScriptEditorModal.tsx:181-189,320-333` (the `header` row and `saveBtn` styles): the header keeps Close and the title and is clear of the status bar and display cutout; Save is the fixed bottom bar of 1.1, inside the safe area; `handleSave` (`:128`) and its error line (`:166`) are unchanged.
- [x] 1.3 (2026-11-21: findings in test-results.md Phase 1: `ConnectModal` fine, `GlobalScriptsModal` follow-up for the emulator run, unchanged without the owner's word) Other screens: check the headers of `GlobalScriptsModal.tsx` (its `Done` button, `:71-80`), `ConnectModal.tsx:91` and the other modals with a top-right action for the same fault, and record each as fine or as a follow-up in `test-results.md`; change one only with the owner's word.
- [x] 1.4 Tests: new `components/scripts/__tests__/ScriptEditorModal-test.tsx` with insets mocked to a tall status bar and a cutout: Save is rendered inside the safe area and not in the header row; pressing it calls the save path once and a disabled state while saving; a save failure shows the error line; Close still works; the title is shown (E1).
- [x] 1.5 (2026-11-25, on the emulator, three-button navigation: new alias in portrait, with the keyboard open, in landscape, and an edit of the saved alias; Save tapped and the alias saved (the list showed it, then it was deleted). Gesture navigation was not tried: the image offers three-button only here. Captures phase-01_editor-portrait/keyboard/landscape/edit-portrait/saved-list) deferred: waits for the emulator build that Phase 8 also needs (A1, the owner approved running the emulator on 2026-11-20). UI check: emulator, a new alias and an edit of a trigger, portrait and landscape, keyboard open and closed, three-button and gesture navigation if the emulator image allows; Save tapped and the script saved. Captures `phase-01_editor-portrait.png`, `phase-01_editor-keyboard.png`, `phase-01_editor-landscape.png`. The owner approves starting the emulator.
- [x] 1.6 Docs and indexes: `components/scripts/.annotated` updated (the Save bar and why it must not return to the header); `docs/reference/mobile.md` does not name the editor header (checked: a search for ScriptEditorModal in `docs/` finds no header text); end-user doc: no new behaviour to explain (the button moved), recorded as "no user-visible effect beyond the fix".

Sign-off
- [x] 1.S (2026-11-25, jest 141 suites and 2209 tests green, tsc 0 errors, lint 0 errors, bundle export OK, UI check done, W3 matches) Exit gate verified and recorded in test-results.md: mobile jest all pass · `tsc` equals the baseline · lint · bundle check · UI check done · the After diagram of W3 matches the built behaviour

State on exit: the editor is usable on Android; nothing of the port exists yet.

### [x] Phase 2 — Baseline, content API, cache and types
Goal:        The app can fetch and cache areas, area detail and the class catalog from the same served data as web, and the baseline numbers every later phase compares with are recorded.
Depends on:  nothing
Workflow:    none

Work
- [x] 2.1 Recorded in `test-results.md` (Baseline, 2026-11-20):  the `tsc` error count now, the full jest result (suites and tests), the lint result, and the working bundle-check command (toolbox).
- [x] 2.2 (amended: see A2) New `features/autoleveling/autoleveling-content-types.ts` (the web DTOs from `autoleveling-content-types.ts`, copied as types and not redesigned), `autoleveling-content-api.ts` (`/maps/autoleveling/areas`, `/areas/<slug>`, `/classes` through the proxy, D1; base URL from the app's existing server configuration, the dev and production values noted), `autoleveling-content-storage.ts` (AsyncStorage JSON, soft TTL, network then cache, versioned key from the start). The decision is written to the Progress log with the dev base-URL implication.
- [x] 2.3 (amended: see A2) Tests: `__tests__/autoleveling-content-test.ts` and `autoleveling-content-types-test.ts`: index, detail and classes parse into the DTOs; cache round trip without a network call; stale cache refreshed; network failure with a cache falls back; no network and no cache gives the empty state with a retry (E4); an offline-source response is not stored as fresh (E3); storage throwing falls back with one fixed warning (E5); fixtures hold placeholders only (E22).
- [x] 2.4 (amended: see A2) API check: the three real endpoints on the local C# service (`curl` then the real client over real HTTP, see test-results.md); the jest fixtures are placeholder bodies.
- [x] 2.5 Docs and indexes: `features/autoleveling/.ai-context` and `.annotated` (new), `docs/reference/mobile.md` (feature module section and storage-key row), `docs/features/autopilot.md` (new, "Content" section).

Sign-off
- [x] 2.S Exit gate verified and recorded in test-results.md (2026-11-20): mobile jest all pass · `tsc` no new errors against 2.1 · lint · bundle check · coverage of the new modules · API check done · doc-impact 0 unresolved

State on exit: data layer only; no screen.

### [x] Phase 3 — Record store and cloud sync
Goal:        The app stores the same autopilot records as web and Saves and Loads them to the account, so a web edit reaches the phone and back, before any engine exists.
Depends on:  Phase 2; the owner's sign-off of the web half of the active plan (its Plan sign-off)
Workflow:    W1

Work
- [x] 3.1 (2026-11-21, amended: see A4; web commit 4ea2699) New `features/autoleveling/autoleveling-user-data.ts`: the web record shapes and ids (copied from `apps/game-client/src/features/autoleveling/autoleveling-user-data.ts`, `autoleveling-target-overrides.ts`, `autoleveling-types.ts` as they are now), AsyncStorage one key per record, the same `normalizeRecord`, override and `applyTargetOverrides` functions, `SYNCED_RECORD_KINDS` equal to web's including the `pref` records. Fresh version 1, no migration (D2). Record the web commit it was copied from.
- [x] 3.2 (2026-11-21; the cap is checked before the first PUT of ANY collection, not only before the autopilot PUT, so a refusal changes nothing: E15) `features/auth/cloud-sync.ts:198-266,268,289,312`: `saveAllToCloud` first loads and merges the cloud copy of the collection (newest `updatedAt` wins), counts against the 1000-record cap with the server's message, then PUTs it after the existing collections; `fetchCloudSnapshot`, `summarizeForLoad` and `applyCloudSnapshot` carry it; malformed records are dropped on import. A constant beside `MAX_SCRIPTS` (`:58`) names the cap.
- [x] 3.3 (2026-11-21, amended: see A4: the text is built in `features/auth/use-account.ts`, which `AccountSection.tsx` only renders) `components/AccountSection.tsx`: the Save and Load summary text includes the autopilot record count.
- [x] 3.4 (2026-11-21) Tests: store round trips; the override, normalisation, "same as default", reset and unmatched-edit cases of the web suite (E8-E11, E16); cloud-sync tests with a mocked `fetch`: Save merges the cloud copy first (E7), the cap refuses with the message (E15), Load imports and ignores malformed records, a 401 is handled like the existing collections; a test compares the exported kind names with the web list (E6); storage failure falls back (E5).
- [x] 3.5 (2026-11-21, amended: see A4: the blob is built from the wire contract, one placeholder record per kind, not recorded from a live account; the real round trip is box 8.3) API check: jest against a recorded cloud blob (placeholders only in the committed fixture, taken from a local test-account round trip); the live check is box 8.3.
- [x] 3.6 (2026-11-25, the Save and Load messages on the emulator: "Saved ... and 4 autopilot record(s) to the cloud" and "... 1 autopilot record(s) merged (1 target edit(s))"; captures phase-08_account-save.png and phase-08_account-load.png) deferred: waits for the emulator run of Phase 8 (box 8.4), the owner approved running the emulator (A1). The message wording itself is asserted in `use-account-autolevel-test.tsx`. UI check: the account section's Save and Load messages; captured with the device run in box 8.4.
- [x] 3.7 (2026-11-21) Docs and indexes: `features/autoleveling/.ai-context`, `features/auth/.ai-context` or `.annotated`, `docs/reference/mobile.md` (storage keys), `docs/features/autopilot.md` ("Storage and sync" section).

Sign-off
- [x] 3.S (2026-11-21) Exit gate verified and recorded in test-results.md: mobile jest all pass · `tsc` no new errors · lint · bundle check · coverage · API fixture check · the After diagram of W1 matches · doc-impact 0 unresolved

State on exit: sync-compatible data layer, no engine, no screen.

### [x] Phase 4 — The engine's inputs on the phone
Goal:        The app produces what the engine listens to: a raw-line event, flee and death events, movement success and failure, and a pass-through send, with nothing listening yet.
Depends on:  Phase 2
Workflow:    W4

Work
- [x] 4.1 (2026-11-21; guarded by a new `eventBus.hasListeners`, see A5) `features/scripts/script-engine.ts:138-145`: emit the raw line on the event bus under the same name the web uses, `shatteredarchive:raw-data`, from the place triggers and plugins already run; with no listener the emit adds no per-line allocation (E27).
- [x] 4.2 (2026-11-21; web commit 4ea2699) New `features/autoleveling/special-lines.ts`: the flee success, flee failed and creature-death detection that the web does in `UserScriptRuntime.processForSpecialLines` (`userScriptRuntime.ts:689`), emitting `event:flee:success`, `event:flee:failed` and `event:creature-death` with the same payload shape (`{ text }`); the line patterns are read from the web method and copied as data, with the web commit recorded.
- [x] 4.3 (2026-11-21, amended: see A5: bound per run, no room cache, `command-sent` producer added) New `features/movement/classify-movement.ts` and `movement-tracker.ts`, ported from `apps/game-client/src/features/movement/classifyMovement.ts` and `movementTracker.ts` (83 and 228 lines) onto the mobile event bus, emitting `shatteredarchive:movement-succeeded` and `shatteredarchive:movement-failed`; exports the timeout constant the engine's backstop uses (E19).
- [x] 4.4 (2026-11-21, amended: see A5: `sendProgrammatic`, also refuses line breaks) `features/connection/connection-manager.ts:295` (beside `sendUserInput`): a pass-through send for programmatic callers that enqueues one line on the same `OutboundQueue` without `preprocessCommand` and without the script intercept (D3); a line containing `;` is refused.
- [x] 4.5 (2026-11-21: the phone's own combat-compression plugin already exports `DAMAGE_LINE_PATTERN` (line 677) and its damage block is identical to the web's, checked by a diff of the two blocks; the engine will import it, nothing to port) The web engine also uses the damage-line pattern (`DAMAGE_LINE_PATTERN`, `combat-compression.plugin.ts:667`); port it as a constant with its source noted, or record in the Progress log that the mobile engine does not need it and why.
- [x] 4.6 (2026-11-21; the web's `movementTracker.roomCache.test.ts` is not ported because the room cache is not, A5) Tests: `__tests__/special-lines-test.ts` (each of the three events from sample lines in the web tests' placeholders, a non-matching line, no event for a partial preview); movement tracker and classifier tests ported from `movementTracker.test.ts`, `movementTracker.roomCache.test.ts`, `classifyMovement.test.ts`; `connection-manager` send tests (queued through the same queue, no split, no intercept, `;` refused, refused when not connected); a test that the raw-line emit with no listener does not allocate per line, and the existing allocation sweep still passes (E27).
- [x] 4.7 (2026-11-21) Docs and indexes: `features/autoleveling/.ai-context`, `features/movement/.ai-context` (new), `features/connection/.ai-context`, `features/scripts/.ai-context`, `docs/features/autopilot.md` ("Engine inputs" section, the producers listed per platform).

Sign-off
- [x] 4.S (2026-11-21) Exit gate verified and recorded in test-results.md: mobile jest all pass · `tsc` no new errors · lint · bundle check · coverage · doc-impact 0 unresolved · the After diagram of W4 matches

State on exit: the inputs exist and are tested; nothing consumes them, and no user-visible change.

### [x] Phase 5 — The engine's pure modules
Goal:        Every engine module that has no timers and no I/O runs on the phone with the web's tests.
Depends on:  Phase 3
Workflow:    W2

Work
- [x] 5.1 (2026-11-21: the web plan's Phase 16 is open only for box 16.2, one deferred live screenshot of a timeout pause; its exit gate ran except that. The engine's last web commit is 4ea2699 (2026-11-20), which is the commit this port takes; recorded here and in docs/features/autopilot.md) Check that the web engine is not mid-change: the active plan's Phase 16 (pause on timeout) state is read and written in the Progress log; if it is still open, the port takes the engine as it is and records the web commit (E29).
- [x] 5.2 (2026-11-21, amended: see A4 and A6: `-types.ts` and `-step-prefs.ts` were ported in Phase 3; verify they are still identical to the web file and port the rest) New in `features/autoleveling/`, each ported from the file of the same name in `apps/game-client/src/features/autoleveling/`: `autoleveling-types.ts`, `-defaults.ts`, `-actions.ts`, `-alignment.ts`, `-command-text.ts` (the one expander and the unresolved-placeholder check), `-enemy-condition.ts`, `-buff-catalog.ts`, `-cast-outcome.ts`, `-lag.ts`, `-step-prefs.ts`, `-class-defaults.ts`, `-classes.ts`, `-wizard-config.ts` (`draftToConfig`).
- [x] 5.3 (2026-11-21, amended: see A6) Tests: the matching web test files adapted to jest-expo (`autoleveling-command-text.test.ts`, `-enemy-condition.test.ts`, `-cast-outcome.test.ts`, `-lag.test.ts`, `-step-prefs.test.ts`, `-class-defaults.test.ts`, `-classes.test.ts`, `-actions.test.ts`, `-wizard-config.test.ts`); an unresolved placeholder and a `;` are refused (E18); the SETTINGS-07 test adds a field to a row type and the rebuild keeps it (E13).
- [x] 5.4 (2026-11-21) Docs and indexes: `features/autoleveling/.ai-context` and `.annotated`, `docs/features/autopilot.md` ("Rules" section).

Sign-off
- [x] 5.S (2026-11-21) Exit gate verified and recorded in test-results.md: mobile jest all pass · `tsc` no new errors · lint · bundle check · coverage of the new modules · doc-impact 0 unresolved

State on exit: modules and tests exist; no engine loop.

### [x] Phase 6 — The engine core
Goal:        The web autopilot engine, as of the recorded web commit, runs on the phone's event bus, input producers and send path.
Depends on:  Phases 4, 5
Workflow:    W2

Work
- [x] 6.1 (2026-11-21, amended: see A7) New `features/autoleveling/autoleveling-engine.ts` ported from the web engine (2987 lines): the `ListenEvent` subscriptions (web `:1094-1204`) become `eventBus.on` with unsubscribes collected in one place; the `DispatchEvent('shatteredarchive:send-command'` sites (web `:1306`, `:1310`, `:1909`, `:1931`) call the pass-through send of 4.4; the three terminal writes (web `:988`, `:1332`, `:2769`) go to the app's output stream (`connectionManager`'s output emit) as notices; the engine reads `isFighting` from `game:char-data` itself (`vitals-store` unchanged). Behaviour is the web's: round order, movement wait, engage outcome, flee pause, rest cycle, vitals and once gates, the serial re-arm queue with capped retry, pause on timeout, the lap wait, remembered values, the timing floor.
- [x] 6.2 (2026-11-21) The engine stops on a disconnect event and never resumes by itself (E25); Stop and Pause interrupt every long wait (E20); one re-arm in flight with spaced retries (E21); the backstop is never shorter than the movement timeout plus queued lag (E19).
- [x] 6.3 (2026-11-21, amended: see A7) Tests: the web engine suites adapted to jest-expo: `autoleveling-engine.test.ts` and the five files `.gates`, `.rearm`, `.pause`, `.lapwait`, `.lag`, changing only the event and send mocks; plus: binding the engine does not displace `vitals-store`'s subscription and stopping removes only the engine's (E17); stop and unmount leave no timer or listener; a disconnect stops the run (E25).
- [x] 6.4 (2026-11-21) Docs and indexes: `features/autoleveling/.ai-context` and `.annotated`, `docs/features/autopilot.md` ("Engine" section with the web commit it follows and what differs).

Sign-off
- [x] 6.S (2026-11-21) Exit gate verified and recorded in test-results.md: mobile jest all pass (the adapted web suites included) · `tsc` no new errors · lint · bundle check · coverage reviewed · doc-impact 0 unresolved · the After diagram of W2 matches the engine as built

State on exit: the engine is present and tested but reachable from no screen.

### [x] Phase 7 — Configuration page and play-screen control
Goal:        A player configures and runs autopilot on the phone, with editable targets, the full class list and pre-filled abilities.
Depends on:  Phase 6
Workflow:    W2

Work
- [x] 7.1 (2026-11-21, amended: see A9, a controller outside React owns the engine and the hook looks at it) New `features/autoleveling/useAutoLeveling.ts` mirroring the web hook's shape: start, pause, resume, stop, status, saved configuration through Phase 3's store; one engine instance (E23); the run survives the screen unmounting (E24).
- [x] 7.2 (2026-11-21, amended: see A9) New `components/autoleveling/` and `app/autopilot.tsx` (D4): one scrollable form: area picker, targets with edit, hide, reset and the unmatched list, class picker from the full catalog, buff and fight rows pre-filled from `autoleveling-class-defaults`, rest and weight, and short in-app help text for Targets and Combat (D7). Pre-fill seeds only a never-set list (E12). A root page in `app/` registered the way `app/area-import.tsx` is (mobile CLAUDE.md: new full-screen pages go in `app/`; the `NO_TAB_BAR_ITEM` rule is for tab screens and does not apply).
- [x] 7.3 (2026-11-21, amended: see A8 and A9, four display modes in the game panel) `components/PlayContainer.tsx:6,261,268-280`: a control to open the page and to start, pause and stop, with round and step status, in portrait and landscape without overlapping the Compass (E26).
- [x] 7.4 (2026-11-21) Tests: component tests for the editor states and validation, the pre-fill and the saved-set-wins rule, the unmatched list (E8, E12); hook lifecycle: start, pause, resume, stop, double start, unmount mid-run (E23, E24).
- [x] 7.5 (2026-11-21, against the DSL catalog on the local C# site; the simulacrum run is Phase 8) UI check: emulator captures in portrait and landscape: the page, an edited target, the pre-filled combat section, the play-screen control; `phase-07_*.png` (git-ignored). The owner approves starting the emulator.
- [x] 7.6 (2026-11-21) Docs and indexes: `.ai-context` and `.annotated` of every touched folder, `docs/features/autopilot.md` ("Screens"), `docs/reference/mobile.md` (screens and storage keys); the in-app help text is the end-user documentation (D7).

Sign-off
- [x] 7.S (2026-11-21) Exit gate verified and recorded in test-results.md: mobile jest all pass · `tsc` no new errors · lint · bundle check · captures taken · doc-impact 0 unresolved · the After diagram of W2 matches

State on exit: autopilot is usable end to end on the phone, not yet verified on a live game run.

### [x] Phase 7a — Simulacrum training content served by the C# app (local-only, beside the DSL world)
Goal:        The C# app serves the same autopilot catalog shapes (`areas`, `areas/{slug}`, `classes`) for the simulacrum world as for the DSL world, from a local-only controller, and the DSL world's answers are unchanged.
Depends on:  Phase 7b (it serves what 7b generates)
Workflow:    W5

Work
- [x] 7a.1 Owner decisions recorded 2026-11-20: D8 local-only sandbox routes (not a world parameter on the production routes); D9 the generator is a `Server.Jobs` job in the DSL repo (so 7b.1 is a C# job with xunit tests, not a Node script).
- [x] 7a.2 (2026-11-21, the controller is `Server.Web.Public/Controllers/Copilot/SandboxAutopilotController.cs`; the folder logic is `Server.Dsl/AgentApi/SimulacrumCatalogFolder.cs` so it can be tested, see A10) New local-only controller under `C:/Projects/DSL/Server/Server.Web.Public/Controllers/Copilot/` (the folder the csproj removes unless `CopilotLocal=true`, as `SandboxWorldMapController.cs` does), serving `GET /maps/autoleveling/sandbox/areas`, `/areas/{slug}` and `/classes` with the existing DTOs (`Server.Dsl/Models/Autopilot.cs`: `AutoPilotAreaSummary`, `AutoPilotArea`, `AutoPilotTarget`, the class DTO of `AutoPilotClassCache`), read from a folder named by a new environment variable beside `SANDBOX_WORLD_MAP_DIR` (compose: `DSL/Server/docker-compose.yml:35`, local compose only). With the variable unset or the folder missing the answers are empty lists, never an error. The production controller `MapsController.cs:183-216` and `AutoPilotCache` are not changed.
- [x] 7a.3 (dropped by A2: the app reads the C# site directly, so the web-server needs no sandbox routes) ~~The web-server proxy gets the same three routes for the local stack only (`apps/web-server/src/index.ts:461-524` is the pattern), with the offline snapshot behaviour of the DSL routes kept out: the sandbox world has no bundled snapshot (FALLBACK-01: an upstream failure is an error the app shows, not a silent substitute).~~
- [x] 7a.4 (2026-11-21, no web-server handler test: the web-server route was dropped by A2) Tests: xunit tests for the controller (a fixture folder gives the three shapes; missing folder gives empty lists; an unknown slug is 404; the DSL route is unaffected); a web-server handler test per route; `verify-prod-output.mjs` still passes (no sandbox autopilot name in a production build or compose).
- [x] 7a.5 (2026-11-21, the three sandbox routes answered; the three DSL bodies are byte-identical before and after the deploy) API check: after `Server/deploy-local.ps1`, `curl` the three sandbox routes and the three DSL routes through the web-server; the DSL bodies equal the ones recorded before the change.
- [x] 7a.6 (2026-11-21) Docs and indexes: `docs/game/autopilot.md` (a "Worlds" section), `docs/shattered-maps/worlds.md` pointer, the DSL `.ai-context` of the touched folders.

Sign-off
- [x] 7a.S (2026-11-25, the open point of A10e is closed by A11g: Server.Dsl.Tests 1001/1001, Server.Jobs.Tests 68/68, verify-prod-output OK, the API check of 7a.5, doc-impact 0) Exit gate verified and recorded in test-results.md: DSL `dotnet build -c Release` and `dotnet test` · web-server tests · `verify-prod-output.mjs` · API check · doc-impact 0 unresolved · the After diagram of W5 matches

State on exit: the simulacrum catalog route exists and serves whatever folder it is given; the DSL world is untouched.

### [x] Phase 7b — Training paths and monsters from the real merc-mud area files
Goal:        A script turns the real merc-mud area files into autopilot areas (route, start room, targets with their levels and keywords) and a class list, so a run on the simulacrum uses real rooms and real mobs.
Depends on:  nothing
Workflow:    W5

Work
- [x] 7b.1 (2026-11-21, a `Server.Jobs` job, `--simulacrum-autopilot`) New generator in the DSL repo, a `Server.Jobs` job as the other generators are (e.g. `--tales-guide`; decided in D9) that reads `C:/Projects/merc-mud/2.4/area/*.are` (the `#ROOMS`, `#MOBILES` and `#RESETS` sections and each area's level range) and writes the folder 7a serves: per area a slug, name, `levelRange`, `startRoom` (the room line a `look` shows), `dirs` (a walk that visits the rooms holding the area's mobs and returns), and `recommendedTargets` (each mob's room-scan line as `lookName`, a keyword that makes `kill` hit it as `engageName`, and its level).
- [x] 7b.2 (2026-11-21, the areas are all those that qualify, 27 covering levels 1 to 51; the test characters use haon-dor, smurfville, nirvana and mega-city-one) The generator chooses the training areas by their real level ranges so that every character level in 7c has at least one area (D10 lists the proposal); a mob whose keyword is ambiguous in its room is given the shortest unique keyword, and the generator refuses (names the room) a route it cannot make deterministic.
- [x] 7b.3 (2026-11-21) The class list: the four merc-mud classes (mage, cleric, thief, warrior; `merc-mud/2.4/src/const.c:290-332`) with the abilities each really has by level, in the shape `AutoPilotClassCache` produces, so the wizard's pre-fill uses real simulacrum spells and skills.
- [x] 7b.4 (2026-11-21, a test that the committed output equals a fresh run is the job's own `--check` mode (the real files are not in the DSL repo), run and recorded) Tests: generator tests against a small fixture area file (room, mob and reset parsing, the route is closed and deterministic, an ambiguous keyword is shortened, an unreadable file names itself) and a test that the committed output equals a fresh run (ADMIN-01 style drift check).
- [x] 7b.5 (2026-11-21, 23 of 27 routes walked cleanly; the rest are recorded in test-results.md with the cause) Real check: run the generator on the real area files and walk each generated route on the running simulacrum with a throwaway character, confirming every step moves and every target is found (recorded).
- [x] 7b.6 (2026-11-21) Docs and indexes: the DSL docs for the generator, `docs/game/autopilot.md` ("Worlds").

Sign-off
- [x] 7b.S (2026-11-25, generator tests, build, doc-impact 0; the real walk: 23 of 27 routes walked to the end, the other 4 (olympus, astral-plane, nirvana, hell) stop at a fight the level-35 test warrior cannot win (A10, A11d(6))) Exit gate verified and recorded in test-results.md: generator tests · `dotnet build` if C# · the real walk · doc-impact 0 unresolved

State on exit: a folder of simulacrum areas and classes exists and is reproducible from the area files.

### [x] Phase 7c — Test characters on the simulacrum at different level ranges
Goal:        Eight throwaway characters exist on the simulacrum, two per class (a low and a high level each), at levels that between them exercise auto attacks, spells and skills on the training paths, and can be recreated by a script.
Depends on:  Phase 7b
Workflow:    none

Work
- [x] 7c.1 Owner decision D10 recorded 2026-11-20: eight characters, two per class (mage, cleric, thief, warrior), a low level (about 8) and a high level (about 35) each; the exact levels are fixed in 7b.2 from the real area level ranges.
- [x] 7c.2 (2026-11-21, the characters are raised by editing their own player files while logged out, because the game offers no way to do it without an immortal's password, see A10) A script (in `C:/Projects/merc-mud/scripts/`, beside `gmcp-compose-check`) creates each character over the real connection on loopback (name, class, race, then the immortal `advance` and a skills and spells practice to the planned level) and writes nothing outside the player directory; running it twice does not duplicate. Character names are placeholders in the committed script and plan.
- [x] 7c.3 (2026-11-21) Each character's saved state is checked: level, class, the spells and skills the class has at that level (`practice` or `slist` output), enough hit points, mana and movement to run a path.
- [x] 7c.4 (2026-11-21, the cleanup path exists (`--remove --yes`); it is NOT run: the owner's word is needed) A cleanup path removes the characters (the owner's rule: throwaway characters are deleted afterwards); not run without the owner's word.
- [x] 7c.5 (2026-11-21) Docs and indexes: the merc-mud `scripts/.annotated`, `docs/game/autopilot.md` ("Test characters").

Sign-off
- [x] 7c.S (2026-11-25, the script's own checks and the per-character state check ran; doc-impact 0 unresolved) Exit gate verified and recorded in test-results.md: the script's own checks · the per-character state check · doc-impact 0 unresolved

State on exit: the characters exist and are usable for Phase 8.

### [x] Phase 8 — Verification on a device against the simulacrum, round trip with web, close-out
Goal:        A recorded Android run completes a cycle, the configuration survives a restart, a web edit reaches the phone and back, and every document is current.
Depends on:  Phases 1-7 and 7a-7c (A1)
Workflow:    W1, W2, W3, W4, W5

Work
- [x] 8.1 (2026-11-25, emulator-5554 started by me (twice: it exited with a graphics error once and was booted again with software rendering); Metro was the session tool's own; the physical phone was never touched. One defect found and fixed with a regression test (A11a)) The owner approved running the Android emulator for this item on 2026-11-20 (A1): start `emulator-5554` only; Metro and any physical phone stay the owner's. No code change unless the run shows a defect, which is fixed in this phase with a regression test.
- [x] 8.2 (2026-11-25, run on the simulacrum with Smurfville and the level-35 warrior, mage, cleric and thief and the level-8 warrior; see test-results.md Phase 8 and A11 for what each did, what did not work (a level-8 warrior died, the thief casts spells it has no mana for, no loot step by default) and what was not explained) (amended: see A1) The live run is on the simulacrum, not the DSL game: the emulator app connects to the local merc-mud (host address of the emulator's own loopback alias, port 4000), the autopilot content comes from the sandbox routes of Phase 7a, and each character of Phase 7c runs a training path of Phase 7b with the app: Start, a full move, identify, engage, fight and loot cycle with the class's own auto attacks, spells and skills visible in the terminal; Pause, Resume and Stop each once; kill and relaunch the app and confirm the configuration is still there (not a screen remount). Record each character, path, the terminal excerpts (placeholders for names) and the outcome in `test-results.md`. This run is what the owner signs off on.
- [x] 8.3 (2026-11-25, both directions with the registry account on the local stack: the web saved its edit and the phone loaded it; the phone hid another target and saved; the web loaded both) API check with a local test account: edit a target on web and Save; Load on the phone shows the edit; change another on the phone and Save; Load on web shows both.
- [x] 8.4 (2026-11-25, showcase_01 to showcase_04 copied to screenshots/showcase/; the account messages of 3.6 are phase-08_account-save.png and phase-08_account-load.png) UI check: showcase captures `showcase_01_mobile-save-button.png`, `showcase_02_mobile-config.png`, `showcase_03_mobile-targets-edit.png`, `showcase_04_mobile-roundtrip.png`, plus the account-section messages of 3.6, taken with the final-state flow and copied to `screenshots/showcase/`.
- [x] 8.5 (2026-11-25, jest 141 suites and 2209 tests, tsc 0, lint 0 errors and 149 warnings, bundle export OK, E28 search clean, check:private-names OK) Full checks: the whole mobile jest, `tsc` against the 2.1 baseline, lint, bundle check; a search over every new file for native-module imports and `Platform.OS` forks (E28); `pnpm check:private-names` in the ShatteredArchive repo.
- [x] 8.6 (2026-11-25, the file named for implementation-plan.md does not exist (A10d); the other documents and indexes were updated and doc-impact reports 0 unresolved) Docs and indexes: `docs/reference/game-client.md` (porting status row, `:128,164`), `docs/features/autopilot.md` final, `docs/reference/mobile.md`, `docs/implementation-plan/implementation-plan.md`, every `.ai-context` and `.annotated` refreshed; the web doc `docs/game/autopilot.md` gets a pointer if the doc-impact check names it.
- [x] 8.7 (2026-11-25, the owner opened the diagrams in the preview and answered "Checked: The diagrams look good"; the structural check of A11f agrees) Render check: open the five workflow diagrams of this plan in the editor preview (and, once copied, in the mobile doc) and confirm each renders.
- [x] 8.8 (2026-11-25, written in docs/features/autopilot.md (iOS section) and in test-results.md) State iOS plainly in `docs/features/autopilot.md` and `test-results.md`: code parity confirmed, build not verified, and why.

Sign-off
- [x] 8.S (2026-11-25, all checks green for shatteredarchive-mobile and ShatteredArchive, a recorded device run, doc-impact 0 unresolved, the After diagrams match) Exit gate verified and recorded in test-results.md: all checks green for shatteredarchive-mobile and, where touched, ShatteredArchive · a recorded device run · doc-impact 0 unresolved · the After diagrams match the built behaviour

State on exit: ready for the owner's sign-off and `/pr-review`.

## Risks and rollback

- **R1. The web engine moves while this is built.** Its Phase 16 is open and `.ai-plans/active/2026-11-18_autopilot-live-test-findings` may add more. Mitigation: box 5.1 and E29 record the commit the port follows; a later web change is a new item.
- **R2. Event producers missing on mobile** (scope, risk 8). Phase 4 builds them; if a producer cannot be matched to the web's patterns the engine's flee and death handling stays untested on a device until 8.2.
- **R3. Hot path.** The raw-line event runs per game line on the JS thread. E27 and the allocation sweep guard it; rollback is to remove the emit and the listeners.
- **R4. Shared record contract.** A web change to a record kind after Phase 3 breaks the phone's sync silently. E6 compares kind names; the web Phase 22 contract note in `docs/game/autopilot.md` is the reference.
- **R5. No device for the Save fix beyond the emulator.** The emulator may not show the exact overlay the owner sees; Phase 1's capture is on the emulator image available, and the owner confirms on their phone.
- **R6. Two plans touched the same port.** The active plan is amended (A13 there) so Phases 7-11 no longer exist in two places.
- **Rollback.** Every phase after 1 is additive: the autoleveling folders, the route and the PlayContainer control are removed by deleting them; the cloud-sync change is the one edit to existing logic (Phase 3) and is reverted as one commit. Phase 1 reverts alone.

## Plan amendments

**A1 (2026-11-20, owner request while Phase 1 was being built, significant, approved by the owner in the request):** the sign-off for this item is a real autopilot run against the simulacrum, so three phases are added and Phase 8 changes. The owner's words: run the actual emulator for the simulacrum; develop an actual script that can be served from the C# app the way the DSL expects, so the two worlds co-habitate; write the training path from the actual area files and mobs; create a few characters at different level ranges who exercise different skills, spells and auto attacks on those paths; and execute autopilot for real against the simulacrum to sign off.
Original plan: Phase 8's live run was against "the game" with the content API pointed at the DSL catalog; no phase created content or characters; the repos touched were the mobile app (and the web side read only).
What changed: (a) **Phase 7a** (DSL C# repo, new): a local-only controller that serves the simulacrum catalog under `/maps/autoleveling/sandbox/*` from a folder, modelled on the existing local-only `SandboxWorldMapController`, so the production endpoints and the DSL world are untouched; the web-server proxy gets the same routes on the local stack. (b) **Phase 7b** (DSL repo and merc-mud area files, new): a generator that reads `merc-mud/2.4/area/*.are` and writes the areas, routes, targets (real mobs with levels and keywords) and the four merc-mud classes. (c) **Phase 7c** (merc-mud repo, new): a script that creates the throwaway characters. (d) **Phase 8** depends on them and its live run is on the simulacrum (box 8.2 amended); the owner's permission to run the emulator is recorded (box 8.1). (e) New workflow W5. Repos now touched: shatteredarchive-mobile, DSL, merc-mud, ShatteredArchive (web-server route and docs). Out of scope was "any C# change"; that line is superseded for Phases 7a and 7b only.
Wider impact: the DSL local compose gains one environment variable; the sandbox routes must not exist in a production build (`verify-prod-output.mjs`, LOCAL-02); the classes differ per world (4 here, 48 on the DSL), so the app's class picker must follow the catalog it was given and not assume the DSL list; merc-mud has no beastiary, so target keywords come from the area files' own mobile keyword lists. Decisions still needed from the owner are D8 (how the simulacrum catalog is served), D9 (generator form) and D10 (the characters and areas); they are asked before Phase 7a starts.

**A2 (2026-11-20, owner answer while Phase 2 was built, significant, approved by the owner):** the content API reads the C# site directly, not through the web-server proxy (supersedes decision D1). Original plan: D1 and box 2.2 call `/maps/autoleveling/*` through the web-server proxy for its snapshot fallback; box 7a.3 gives the proxy sandbox routes. Found: the app has no address for the proxy and reads the C# site for the world map and the walkable areas (`features/world-map/api.ts:14`, `features/walkable-areas/api.ts:3-5`); the C# site serves the same routes (`MapsController.cs:183-216`). The owner's requirement, given when asked: the content "needs to work for the full local LAN": the local stack is reachable over the computer's LAN address from a real phone and from the emulator. Change: (a) the base is a bundle-time setting `EXPO_PUBLIC_AUTOPILOT_API` (the computer's LAN address for a phone, the same value for the emulator, default the emulator's host alias in a dev build and the real site in a release); the world is `EXPO_PUBLIC_AUTOPILOT_WORLD` (`sandbox` for the simulacrum); neither is in a committed file. (b) The local C# container publishes port 5000 on the computer's interfaces (`DSL/Server/docker-compose.yml:12`), so the LAN address works if the computer's firewall allows it (a check for Phase 8). (c) The proxy's offline snapshot is not used (E3 not applicable); the app's own saved copy covers a failed call. (d) Phase 7a.3 (web-server sandbox routes) is dropped; the sandbox controller stays in the C# app (7a.2) and is read directly. Wider impact: the sandbox routes must answer on the LAN-reachable port 5000 of the local stack only; E31 added.

**A3 (2026-11-20, owner remark, minor):** the owner pointed out that the autopilot address, the web reference screen and the maps are all the same destination today, and may be split later, so they should be separate settings with one shared default. Original (A2): the catalog address was `EXPO_PUBLIC_AUTOPILOT_API` alone, with the emulator alias or the real site as default. Change: the catalog follows the app's shared site address (`extra.siteApi` of `app.json`, read by `features/auth/site-api.ts`, now exporting `configuredSiteApi`) unless `EXPO_PUBLIC_AUTOPILOT_API` splits it off; order: the catalog's own setting, the shared address, the dev or release default. The maps (`EXPO_PUBLIC_WORLD_MAP_API`), the walkable areas and the web reference screen are not changed here: their defaults are hard-coded separately (`world-map/api.ts:13-14`, `walkable-areas/api.ts:3-5`, `app/(tabs)/reference.tsx:7-9`), so setting the shared address once covers the catalog, cloud sync, sign-in and push but NOT those three; whether to give them the same fallback is the owner's call. Wider impact: none on tests beyond one new case; `docs/features/autopilot.md` and the folder index updated.

**A4 (2026-11-21, Phase 3, one significant item approved by the owner, three minor):**
(a) **Significant, approved by the owner on 2026-11-21 (asked with AskUserQuestion, answer "Proceed, pin the web commit").** Original: Phase 3 "Depends on ... the owner's sign-off of the web half of the active plan". Found: that plan's Plan sign-off is still open (Phase 16 has one deferred live screenshot; the owner box is unticked). Change: Phase 3 is built now against the web record contract as it is at ShatteredArchive commit `4ea2699`, recorded in `docs/features/autopilot.md` and the file headers; E6's kind-name test and the live round trip of box 8.3 guard against later drift, and a later web change to a record kind or rule is a new item (R4). Wider impact: none on other phases; if the web half changes before sign-off, this port gets a follow-up item rather than a silent edit.
(b) **Minor, files beyond the Edit-map row of 3.1.** The store imports four pure web modules, so they were ported with it: `autoleveling-types.ts` and `-step-prefs.ts` (listed under Phase 5.2, pulled forward), `-target-overrides.ts` and `-route-overrides.ts` (not listed anywhere), all verbatim with only the first comment line changed, plus `autoleveling-user-paths.ts` (the type of a `path` record only) and `autoleveling-user-storage.ts` (the AsyncStorage store the plan called "AsyncStorage one key per record"). Their web test suites for target-overrides, route-overrides and step-prefs were adapted in this phase (100% covered); Phase 5.2 therefore has `-types.ts` and `-step-prefs.ts` already done, and 5.3's `-step-prefs.test.ts` item is done; the rest of Phase 5 is unchanged. The web `autoleveling-row-options.test.ts` depends on Phase 5 modules (`-class-defaults`, `-wizard-config`) and stays in Phase 5.
(c) **Minor, box 3.3.** The Save and Load text is built in `features/auth/use-account.ts`, not `components/AccountSection.tsx` (which only renders the status); the edit and its tests are in `use-account.ts` and `use-account-autolevel-test.tsx`.
(d) **Minor, box 3.5.** The committed blob is built from the web record shapes and the server's kind list (one placeholder record of each of the eight kinds), not recorded from a signed-in local test account: recording one needs the owner's account and token. The real round trip with web remains box 8.3.

**A5 (2026-11-21, Phase 4, all minor, none changes the goal or a contract):**
(a) **A producer the plan missed (PORT-01, found while porting the tracker).** The web tracker listens to `shatteredarchive:command-sent`, which the web fires from its one physical send point (`useGameConnection`); the app had no such event, so the tracker would have seen no move and failed every one after 1.2 s. Added: `connection-manager.ts` `sendToSocket` (typed, aliased and programmatic lines) and the command sender handed to the script engine (what an alias sends) fire it once per line really sent, only while someone listens. The producer table in `docs/features/autopilot.md` ("Engine inputs") lists it. Test: `connection-manager-send-test.ts`.
(b) **Bound per run, not at app scope.** The web binds `movementTracker` once at app scope; the phone's tracker is bound by the engine when a run starts and unbound when it ends, and the special-line detector likewise, so a phone that is not running the autopilot never subscribes to the per-line event (E27). **Consequence for Phase 6:** the engine's start must call `movementTracker.bind()` and `startSpecialLines()` and keep both stop functions, and its stop and unmount must call them; 6.3's "stop and unmount leave no timer or listener" test covers it.
(c) **No room cache.** The web tracker also fills a shared "where am I" cache (`setRoomData`); the phone has no consumer for it, so it is not ported, and the web's `movementTracker.roomCache.test.ts` is not ported either.
(d) **Files beyond the Edit map.** `features/connection/outbound-queue.ts` gains a second job kind `sendRaw` and an optional second sender (the Edit map named the file; the shape is new); `features/scripts/event-bus.ts` gains `hasListeners` (not in the map) so the raw-line and command-sent emits build no payload without a listener.
(e) **Name and refusals of the pass-through (box 4.4).** `connectionManager.sendProgrammatic(line): boolean`. It refuses a `;` as the plan says and also a carriage return or line feed (one stored command must not become two), and any send while not connected.
(f) **Which special events.** Only `event:creature-death`, `event:flee:success` and `event:flee:failed` are produced, the three the web engine listens to (checked in its bind method, lines 1094-1210); the web method's `event:fighting:opponent`, `event:damage` and `event:level-up` have no listener in the engine, which reads the enemy's condition and the damage lines from the raw line.

**A6 (2026-11-21, Phase 5, minor):**
(a) **`autoleveling-classes.ts` is the pure half only.** The web file also holds the class catalog's IndexedDB cache and its fetch through the proxy; the phone's equivalent is `contentClient.getClassCatalog()` (Phase 2, AsyncStorage, the C# site, keyed by world and origin), so repeating it would give two class caches. The web's cache tests are not ported (the phone's are in `autoleveling-content-test.ts`); the pure-helper tests are.
(b) **`fullRoute` lives in a new `autoleveling-route.ts`.** The web has it in `autoleveling-content.ts` (the area cache); `autoleveling-wizard-config.ts` imports it from there. The phone's cache is a different module, so the helper sits alone and the one import is changed.
(c) **Not ported.** `autoleveling-normalize.ts` (the web's version-2 to version-3 configuration migration: the phone starts at version 3) and its test case in the wizard-config suite; `autoleveling-row-text.ts` (the desktop wizard's row text, which the phone's configuration page replaces in Phase 7: its web test is then ported with it).
(d) **Tests the plan did not list.** The web had none for `autoleveling-alignment.ts` and for most of the action editor's syntax; the port added `autoleveling-actions-syntax-test.ts` (21) and `autoleveling-command-safety-test.ts` (6) so the ported code is executed and asserted, plus the web's `timing-defaults`, `ability-timing` and `row-options` suites (the last holds the SETTINGS-07 per-field check, typed `Required<BuffRow>` so a field added to the row type without a line in the test fails the type check: E13).
(e) **E18 is split across phases on purpose.** Here: the one expander and the unresolved-placeholder check, and the Rest and Weight lists split on `;` into single commands. The refusal of any other stored command that holds a `;` is at the send (`sendProgrammatic` returns false, Phase 4) and the engine must treat `false` as a refused command (Phase 6 test, box 6.3).

**A7 (2026-11-21, Phase 6, minor):**
(a) **Two listener lifecycles instead of the web's one.** The web `bind()` puts on all eleven listeners and its `unbind()` returns at once (a TODO there). Here `bind()` puts on the five GMCP ones (vitals, affects, tick) and `start()` adds the six per-line ones plus the movement tracker and the special-line detector for the length of one run; `unbind()` really removes them. Why: (1) an idle phone must not build a payload per game line (E27, the allocation hunt on this branch); (2) the affects must be known before a run starts, so the GMCP ones stay on from the moment the hook creates the engine (no affects store exists on the phone to seed from); (3) E17 needs the engine's removal to leave the HUD's handlers alone, which the web's no-op unbind never had to prove.
(b) **The seam.** `deps.send`, `deps.notify`, `deps.subscribeDisconnect` are new optional deps. Without `send` and `notify` the engine emits the web's `shatteredarchive:send-command` and `shatteredarchive:write-terminal` events on the bus (so the web suites are adapted by changing their helpers only); Phase 7's hook passes `connectionManager.sendProgrammatic`, a notice writer and `connectionManager.subscribeState`. A refused command is reported once per command text (E18: the `;` case) and a lost connection stops the run for good (E25).
(c) **Test changes beyond the helpers.** Each adapted suite binds the per-line listeners where the web's `bind()` did (`engine.bindRunListeners()` after `engine.bind()`), clears the bus before and after each test (the web's keyed listeners replaced each other, the bus keeps all), and resets the tracker in teardown (its poll interval otherwise keeps the test process alive, found when a run did not exit: `movementTracker.reset()` added). The web's "bind() registers the same listeners" count (11) is five here, with the per-run set proven in `autoleveling-engine-lifecycle-test.ts`.
(d) **Not changed on purpose.** The engine's own debug helper still reads `window` and `localStorage` behind `typeof` guards (both absent on the phone: debug off).

**A8 (2026-11-21, owner decisions asked with AskUserQuestion before Phase 7, significant items approved):**
(a) **Emulator:** approved again for this item: I may boot `emulator-5554` (never the physical phone) and run device checks through `Shattered-AI/tools/mobile-test/session.mjs` against the local dev stack only (`docs/claude/emulator-testing.md`); Metro stays the owner's.
(b) **Configuration page (D4 confirmed):** one scrollable form with grouped sections in `app/autopilot.tsx`; Start, Pause and Stop in a bar at the bottom.
(c) **Play-screen control (changes box 7.3):** original: one control in `PlayContainer`. Now: the control has three display modes and the **player chooses** which, as a saved setting: a compact bar (status, round and step, Start/Pause/Stop and an Open-page button), a floating expandable HUD (a small handle that expands), and a minimal row of just Start/Pause/Stop. All three must stay clear of the Compass in portrait and landscape (E26) and are captured. The setting is a new AsyncStorage key (listed in `docs/reference/mobile.md`) and a row in the settings screen. No default was named; the compact bar is the default until the owner says otherwise.
(d) **Phases 7a, 7b and 7c: all go ahead now,** including creating the throwaway characters on the running simulacrum and deploying whatever local stack changes they need (the DSL C# service through `Server/deploy-local.ps1`; the emulator runs on the same machine as the C# container, so the LAN-address question of A2 is the emulator alias on this computer). Throwaway characters are removed afterwards only with the owner's word (box 7c.4 unchanged).
(e) **Test account for box 8.3:** the standing rule applies: the ONE reusable local test account from the git-ignored registry, through the real full auth flow, never a new account while one exists, no credential or token printed or photographed.

**A9 (2026-11-21, Phase 7, all minor, none changes the goal or a contract):**
(a) **A controller, not a hook, owns the engine** (box 7.1 said "mirroring the web hook's shape"). `features/autoleveling/autoleveling-controller.ts` creates the one engine, holds the run state and the saved configuration, outside React; `useAutoLeveling()` is a `useSyncExternalStore` view of it. Why: the page unmounts when the player goes back to the game and the run must go on (E24), and two views must never start two engines (E23). The return shape (config, runState, xpProgress, socketReady, start, pause, resume, stop, setConfig, resetToDefaults) is the web hook's apart from the web's sightsee-only move and rescan helpers, which the phone page does not offer.
(b) **Files beyond the Edit map.** `connectionManager.writeNotice(text)` (new public method: the engine's status lines reach the terminal without going to the game); `app/_layout.tsx` (the page is registered with `headerShown: false`); `app/(tabs)/settings.tsx` and `components/autoleveling/AutopilotSettingsCard.tsx` (the display-mode choice and the way into the page, which A8c asked for); `features/autoleveling/autoleveling-last-area.ts` (the page reopens on the area it had open: a device-local key, not a synced record, because the web's wizard starts empty so the account has nowhere to hold it; this is what makes "the configuration is still there after the app is killed" true on the page); `autoleveling-config-storage.ts` (the web's storage file without its v2 migration and with one key, the phone having one connection); the port of `autoleveling-row-text.ts` and its test (A6c deferred it to this phase). New storage keys, all listed in `docs/reference/mobile.md`: `autoleveling-config-v3`, `autoleveling-last-area`, `autopilot:display`.
(c) **A fourth display mode.** A8c named three (compact bar, floating HUD, minimal row). A player who never uses autopilot would otherwise carry an always-on bar, so `off` (hidden) is a fourth choice in Settings. The default is still the compact bar.
(d) **What the phone page edits, and what it keeps.** Per buff and attack row it edits the command, the recast mode and its affect or tick count, the reuse time, pause and resume, order and removal; it adds rows from the class's own abilities. The web's advanced options (combat state, enemy-condition and vitals gates, retry, once per fight, in-combat command, hold near level) and the during-round rest rules are NOT editable on the phone: a row keeps them untouched (rows are always changed by merging, SETTINGS-07), the engine obeys them, the line under a row names which it carries, and they travel with Save and Load. The in-app help says so. If the owner wants them editable on the phone, that is a new item.
(e) **A defect the emulator showed, fixed in this phase.** The expanded floating HUD clipped the Stop button (the card was narrower than three labelled buttons, in both orientations). The card is wider and the button row wraps (`AutopilotPlayControl.tsx`, `RunButtons.tsx`). Found by capture, not by a test; the layout is not asserted by a unit test (React Native layout is not computed under jest), the recapture is the proof.
(f) **Typed routes.** expo-router's typed-routes file is generated and git-ignored, so a new page is not in it until the next `expo start`; the page's href is cast (`as Href`) in one place (`AUTOPILOT_HREF`).
(g) **The emulator driver.** `C:/Projects/Shattered-AI/tools/mobile-test/autopilot-emulator.mjs` (stages: mode, play, hud-open, page, state; later the live run), modelled on the unread-dot driver, every adb call pinned to emulator-5554. It lives in the Shattered-AI repo with the other drivers, not in either repo of this item. The session was brought up with `session.mjs up --planned-phase` (Metro pid 38088 started by the tool) and is left up for Phases 7a to 8; it is stopped with `down --reset` at the end of Phase 8.
(h) **W2 After diagram, corrected to the built behaviour** (original kept above; the engine is created by the controller once, the page and the control both talk to it):
```mermaid
sequenceDiagram
  participant U as Player
  participant C as Autopilot page
  participant P as Play-screen control
  participant H as Controller (one per app)
  participant G as Engine
  participant M as connectionManager
  participant S as script-engine
  U->>C: pick area and class, edit rows
  C->>H: commit the configuration (saved)
  U->>C: press Start (or Start on the control)
  C->>H: start
  H->>G: run (the one engine, bound when the controller was created)
  G->>M: sendProgrammatic, one command at a time
  M-->>S: game text and GMCP
  S-->>G: raw-line, char-data, room-data, tick, affect events
  S-->>G: death, flee and movement events
  G->>H: run state and last kill
  H->>C: shown on the page
  H->>P: shown on the control
  U->>P: Pause or Stop from the play screen
  Note over C,H: the page can unmount, the run goes on
```

**A10 (2026-11-21, Phases 7a to 7c, built; one significant item is the owner's to decide, the rest minor):**
(a) **Where the logic of 7a lives.** The controller of box 7a.2 is a thin local-only file (`Server.Web.Public/Controllers/Copilot/SandboxAutopilotController.cs`); the folder reading and the slug check are in `Server.Dsl/AgentApi/SimulacrumCatalogFolder.cs` (as `WorldMapApi` is for the map) because the Copilot folder is not compiled into the test projects. Its name carries none of the strings the production verifier forbids; the verifier (`Server/scripts/verify-prod-output.mjs`) now also forbids `SandboxAutopilotController`, `SANDBOX_AUTOPILOT_DIR` and `autoleveling/sandbox` in a production dll and the folder names in the production compose, and requires the first two in the local shape. The catalog folder is `Server/Data/simulacrum-autopilot`, which the local compose already mounts at `/app/Data` (no new mount); the production image does not carry `Server/Data`.
(b) **The generator reads more of the game than the plan listed, because the live game refused what the files allowed.** Found by walking every generated route on the running simulacrum (box 7b.5), not by the xunit tests: a reset line can separate its fields with a TAB (the door resets of Midgaard's locked headquarters were being dropped), exits go in ten directions (the four diagonals were ignored), room names carry colour sigils (the game strips them over GMCP), a room of water that needs a boat or of air needs flight, a guild room refuses another class, private and reserved rooms refuse, and an `R` reset shuffles a room's exits every area reset (the Day Care's Mini-Maze and the Pyramid's sandstorm): none of those can be part of a fixed route, so the generator treats them as blocked and offers no target in them. Each rule has a test and is written down in `Server.Jobs/Adhoc/SimulacrumAutopilot/.ai-context` and `docs/game/autopilot.md`.
(c) **The test characters are raised by editing their own player files** (box 7c.2 said "the immortal advance"). The game gives a script no way to advance a character without an immortal's password, which the script never asks for. A character is created through the real prompts, then its player file is edited while it is logged out (level, hit points, mana, movement, armour, the class's skills and spells at that level from the generated catalog, the game's permanent ball of light, and the room it wakes up in). The script touches only characters it holds a password for. It is `merc-mud/scripts/simulacrum-test-characters.mjs`; the walker is `merc-mud/scripts/simulacrum-walk-routes.mjs`.
(d) **Box 8.6 names a file that does not exist:** `docs/implementation-plan/implementation-plan.md` is in neither repo. The porting-status rows were updated where they are (`docs/reference/game-client.md`), and there is nothing else to update.
(e) **Open, the owner's decision: one red test in the DSL repo that this item did not cause.** `Server.Dsl.Tests` had two failing book tests before this work (committed 2026-11-14, "updates"): `seeking-the-sanctum` numbered its pages 1, 2, 4, 5, ... and `umbral-phantasm` numbers 1, 2, 4 and its test expects text of a page 3 that is no longer in the book. I renumbered the first (a pure numbering fix: no text changed, and its test passes); I did not touch the second, because the missing page is the owner's content and the test expects text that is not there. The DSL test project is therefore 1 red of 1000 until the owner decides to restore page 3 or change the test.

**A11 (2026-11-25, Phase 8, minor unless marked):**
(a) **A defect the emulator showed, fixed with a regression test.** The catalog client reported a saved copy that was simply still inside its lifetime as `cache`, the same word it uses after a failed fetch, so the Area section said "The server could not be reached, so this is the list saved on this phone" with the server up. Now a fresh copy is `fresh` and only a failed fetch is `cache` (`autoleveling-content-api.ts`; tests in `autoleveling-content-test.ts` and `sections-test.tsx`; the doc and the folder's `.annotated` say so). Seen gone on the device afterwards.
(b) **The dev bundle arrives damaged through the emulator's NAT.** About 15 MB through `10.0.2.2:8081` lost single bytes near its end (`AreaSection` arrived as `AreaSetion`), so launches failed with a different compile error each time while the host's copy was whole; the `adb reverse` tunnel was intact. Worked around for this emulator only (an `iptables` redirect of `10.0.2.2:8081` to the tunnel, lost at reboot); the finding and the recipe are in `docs/claude/emulator-testing.md`. The emulator process also died once with a graphics error and was booted again with `-gpu swiftshader_indirect`.
(c) **Test tooling changes (in Shattered-AI and merc-mud, not product code).** `autopilot-emulator.mjs`: the `live` stage no longer leaves the Autopilot page by its own Back key, takes fast screenshots instead of screen dumps while the terminal scrolls (a dump stalls then), refuses to start unless the page is on the area asked for (a run on the wrong area walks another area's route, which is what the first mage run did), and reads descriptions as well as texts. `autopilot-mobile-roundtrip-web.mjs`: accepts the web client's native "replace?" confirm (Playwright cancels it by default) and waits for the client's store. `simulacrum-walk-routes.mjs`: `--place-only`.
(d) **Findings for the owner, none changes the port's scope:** (1) a level-8 warrior in Smurfville was killed by an attacker the game showed as "someone" while the autopilot kept trying to move ("No way! You are still fighting!"); the engine has no flee or rest gate in the default configuration and the phone does not edit one, the same as the web engine at the pinned commit. (2) The default attack rows of a thief at level 35 include spells it has no mana for ("You don't have enough mana." every fight). (3) The default configuration has no loot step: corpses stay (the engine supports a post-fight list, the phone page keeps it but does not edit it). (4) One cleric run answered "You don't know any spells of that name." to its sanctuary and bless casts and the engine gave up on each after 3 tries; a direct login of the same character casts both, and a repeat run on the phone killed monsters normally, so the cause was not found. (5) Pause is not offered between laps ("Waiting"), by design (`runControls`), and the lap wait is 3 minutes. (6) Four of the 27 generated routes cannot be walked to the end by the level-35 test warrior (A10).
(e) **A password appeared once in a tool output.** A diagnostic proxy that logged the commands the phone sent masked the wrong lines, so the throwaway test character `Zzapclerhi`'s local password was printed once in this session's output (not in any file of the work item, no screenshot, no document). The proxy was stopped and its log scrubbed. The character exists only on the local simulacrum; the owner may want to recreate it (`simulacrum-test-characters.mjs --remove --yes`, which needs the owner's word).
(f) **Box 8.7 stays open.** No mermaid renderer is installed here and the editor preview cannot be driven from this session. A structural check of all 17 diagrams (known diagram type, balanced quotes and brackets, no `;` outside quotes, node and edge shapes) found nothing; the two lines it flagged are valid cylinder nodes. Opening them in the preview is the owner's part of the sign-off.
(g) **The red Umbral book test is closed (the owner chose "fix the test or the book now", 2026-11-25).** `PlayerBookTests.Umbral_phantasm_guide_credits_geirhart_links_the_post_and_keeps_the_locations_the_way_in_and_the_fight` failed because the guide numbers its pages 1, 2, 4 and because the test still expected pages and a quoted shard message that the committed book no longer has. The guide says it leaves the shard's mechanics out at Geirhart's request, so the book is right and the test was stale. Changes (DSL repo): `UmbralPhantasmGuide.cs` "The Fight" is page 3 (the same renumbering as `SeekingTheSanctum.cs`); the test now asserts the rooms the guide lists, that the shard passage is NOT in it, and that it has 3 pages. `Server.Dsl.Tests` 1001/1001. The two book files are the owner's content: both edits are flagged for the owner's eye in the diff.

## Progress log

- 2026-11-20: Scoped (`scope.md`) and planned. The owner chose to take the port out of the active plan `2026-11-13_editable-autopilot-targets-synced` and keep it here; the owner added the Save button item the same day. Research found that the web engine needs a movement tracker, special-line events and a raw-line event that the app does not have (Phase 4). The owner approved the classifiers INSET-01 and PORT-01 (written to the catalog) and chose a fixed bottom bar for Save. The unticked-box state of this plan is the whole of the work.
- 2026-11-20: item moved from proposed/ to active/; implementation started (Phase 1 first).
- 2026-11-20: Baseline recorded in test-results.md (mobile `tsc` 0 errors, 82 suites and 1137 tests green; the old plan's "7 errors" was out of date). Phase 1 built: Save is now a bottom bar inside a safe-area container, 10 new tests, whole suite 83 suites and 1147 tests green; boxes 1.1, 1.2 and 1.4 ticked; the emulator capture (1.5) and docs (1.6) are open.
- 2026-11-20: Phase 2 done. Catalog client, AsyncStorage cache and ported DTOs in `features/autoleveling/`; 37 new tests (whole package 85 suites, 1184 tests green), `tsc` 0 errors, bundle check exit 0, the three real routes and the real client checked over HTTP. The owner's answer on the base address made the app read the C# site directly with bundle-time settings for the origin and the world (A2, supersedes D1; Phase 7a.3 dropped). My first run of the tests found that a saved copy was never served back (parsed with the wrong shape); fixed.
- 2026-11-20: Owner request (A1): the sign-off is a real run against the simulacrum. Phases 7a (C# sandbox catalog), 7b (generator from the merc-mud area files) and 7c (test characters) added; Phase 8 amended; permission to run the emulator recorded. Owner decisions the same day: D8 local-only sandbox routes, D9 a Server.Jobs job, D10 eight characters, two per class.

- 2026-11-21: Phase 3 built (A4). The owner approved starting it before the web half's sign-off (web commit 4ea2699 pinned). Record store in AsyncStorage, the web's pure rules copied verbatim, Save merges the account's records first and checks the 1000 cap before any upload, Load merges and drops malformed records, the Account messages name the records. 9 new test files (207 tests); whole package 102 suites and 1489 tests green, `tsc` 0 errors, lint 0 errors, bundle check exit 0, the new modules 100% line coverage. Open in Phase 3: only box 3.6 (the device capture, deferred to box 8.4). Phase 1 still open on its emulator capture (1.5) and sign-off (1.S). Box 1.3 ticked (findings were already in test-results.md).

- 2026-11-21: Phase 4 built (A5). The engine's inputs exist and are tested: the raw-line event (guarded, no payload without a listener), the special-line detector, the movement classifier and tracker ported onto the app bus, the command-sent event (a producer the plan had missed), and `connectionManager.sendProgrammatic` on the shared outbound queue. Whole package 109 suites, 1548 tests green (+7 suites, +59 tests: seven new test files, none extended), `tsc` 0 errors, lint 0 errors (103 warnings, the same count as after Phase 3), bundle check exit 0, `check-doc-impact` 0. Box 4.5 closed without code: the phone's combat-compression plugin already exports an identical `DAMAGE_LINE_PATTERN`. Nothing consumes the inputs yet and nothing user-visible changed. Phase 6 must bind the tracker and start the detector per run (A5b).

- 2026-11-21: Phase 5 built (A6). The engine's pure modules are on the phone with the web's tests adapted, plus the tests the web never had for the action editor and the alignment modifier. Whole package 122 suites, 1751 tests green (+13 suites, +203 tests), `tsc` 0 errors, lint 0 errors, bundle check exit 0, `check-doc-impact` 0, line coverage of every ported module 100% except `autoleveling-classes.ts` and `-enemy-condition.ts`, whose single open branches are defaults inherited from the web. 5.1: the web engine is not mid-change (its Phase 16 is open only for one deferred screenshot); the port follows commit 4ea2699. Next: Phase 6, the engine itself (2987 lines on the web).

- 2026-11-21: Phase 6 built (A7). The web engine (2987 lines, commit 4ea2699) runs on the phone's bus, producers and send path with its six web suites adapted (145 tests, all pass) plus 15 lifecycle tests. Whole package 129 suites, 1912 tests green, exit 0 on its own; `tsc` 0 errors; lint 0 errors; bundle check exit 0; `check-doc-impact` 0. One incident: a first run of the engine suites hung on a leaked poll interval (idle, 0 CPU); stopping the task left two orphan processes of mine, which the owner approved killing; cause fixed (`movementTracker.reset()` in the teardown) and all later runs were bounded and finished by themselves. Engine line coverage 82.8%, branch 66.6%: the same suites the web has, so the open lines are the web engine's own untested parts (sightsee, learned-cooldown paths and the like); every line added for the phone is covered. Next: Phase 7, the configuration page and the play-screen control.

- 2026-11-21: Owner decisions before Phase 7 recorded as A8 (emulator, one scrollable form, display modes the player chooses, 7a to 7c go ahead, the standing test-account rule).
- 2026-11-21: Phase 7 built (A9). A controller outside React owns the one engine (a run survives the page, two views cannot start two), the page is one scrollable form (Area, Targets, Combat, Rest, Weight, Route, Run) with Start, Pause and Stop in a bottom bar, and the play-screen control has four modes the player chooses in Settings (compact bar by default, floating HUD, minimal row, hidden), drawn inside the game panel so it cannot overlap the Compass. 12 new test files; whole package 141 suites, 2209 tests green, `tsc` 0 errors, lint 0 errors (149 warnings, the repo's `jest.mock` idiom), bundle check exit 0. Emulator captures in portrait and landscape of every mode, the page, an edited target and the pre-filled combat rows; they showed one defect (the HUD card clipped Stop), fixed and recaptured. The web's advanced row options are kept and obeyed but not editable on the phone (A9d). Open: the simulacrum run and the round trip (Phases 7a to 8).

- 2026-11-21: Phases 7a to 7c built (A10). 7a: the Simulacrum's autopilot catalog is served under `/maps/autoleveling/sandbox/*` by a local-only controller, deployed with `Server/deploy-local.ps1`; the three DSL bodies are byte-identical before and after. 7b: `Server.Jobs --simulacrum-autopilot` generates 27 areas (levels 1 to 51) and the four classes from the real area files and skill table; the live walk of every route (27 areas, 2122 steps) found seven generator defects the tests could not (tabs, diagonals, colour codes, boats and air, guilds, private rooms, shuffled maze exits), all fixed with tests: 23 of 27 routes now walk cleanly on the running game. 7c: eight Zzap... test characters exist on the local simulacrum and check out. DSL `dotnet test`: 999 of 1000 (one pre-existing book test, A10e). Not yet done: the emulator run (Phase 8).

- 2026-11-25: Phase 8 run (A11). Emulator run on the simulacrum with five characters, the round trip with web in both directions, four showcase captures, the full checks (jest 141 suites and 2209 tests, tsc 0, lint 0 errors, bundle OK) and the documents. One real defect found and fixed (a fresh saved copy was reported as a failed fetch). Open: 8.7 (diagram preview, the owner), 7a.S and 7b.S (the red Umbral book test of A10e and the four fight-limited routes), and sign-off.
- 2026-11-25: The owner answered the closing questions: not testing yet (the item stays in `active/`), fix the red Umbral book test now (done, A11g; Server.Dsl.Tests 1001/1001), and the diagrams look good (8.7 ticked). Boxes 7a.S, 7b.S, 8.7, 8.S and the phase headings are ticked; the owner sign-off boxes are the only ones left.

## Plan sign-off

- [x] Every phase above is ticked (work, sign-off and heading boxes) (2026-11-25)
- [x] `node scripts/check-doc-impact.mjs <item folder>` reports 0 unresolved (2026-11-25)
- [x] The After diagrams are in the developer doc (`docs/features/autopilot.md` in the mobile repo) and match the built behaviour (2026-11-25; rendering in the preview is box 8.7, the owner's)
- [ ] Owner sign-off recorded: Signed off by the user on <yyyy-mm-dd>
