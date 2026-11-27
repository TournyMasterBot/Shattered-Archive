# Test results: Mobile crafting, screen layout and edge docks, and timers across a dropped connection

## Baseline (2026-11-26, before any code change)

ShatteredArchive performance/Allocation-hunt @ f02e9f9 · shatteredarchive-mobile optimization/Performance-and-Diagnostics @ f86ba6c (clean)

| Package | Command | Result |
|---|---|---|
| web game-client | `pnpm --filter @shatteredarchive/game-client test` | 234/234 suites, 4078/4078 tests |
| web | `pnpm typecheck` | exit 0 |
| web | `pnpm lint` | 0 errors, 296 warnings |
| web game-client | `pnpm --filter @shatteredarchive/game-client build` | built |
| mobile | `pnpm --dir M test --runInBand` (see A1) | 141/141 suites, 2209/2209 tests |
| mobile | `pnpm --dir M exec tsc --noEmit` | 0 errors |
| mobile | `pnpm --dir M lint` | 0 errors, 149 warnings |
| mobile | `pnpm --dir M exec expo export --platform android` | exported |

## Phase 1 — Web: user and plugin timers stop at a dropped connection (2026-11-26)

### 1.1 Login data in recorded traffic (2026-11-26)

Source: the dev stack's game-server traffic logs (401 files, 723 connections). Only packet names, menu screens and the fact that something was typed were read out.
The log has no connection id, so a connection made while another session is streaming picks up that session's packets; the counts that matter were
repeated on the 519 connections made after at least 60 s without game traffic.

| Question | Result |
|---|---|
| Login, character or room data before the account menu | none in the 519 isolated connections (the few cases in the whole set all start within 60 ms of another session's traffic) |
| First such packet of a login | `login_data` in 473 isolated connections; `char_data` in 2; none (never entered the game) in 44 |
| Reconnect to a character left in game | `login_data` sent in every one: 102 overall, 24 of 24 isolated |
| Other packets before `login_data` | `remove_affect` on some reconnects: not a login marker, the gate ignores it |

Outcome: P12 holds; the plan's stop condition is not met.

### Phase 1 gate

Commands: `pnpm --filter @shatteredarchive/game-client test` · `pnpm typecheck` · `pnpm lint` · `pnpm exec eslint <changed files>` ·
`pnpm --filter @shatteredarchive/game-client build` · jest with coverage on the five changed source files · `node <item>/tools/web-drop-check.mjs --showcase`
Results: build OK · typecheck OK · lint 0 errors, 296 warnings (as the baseline; the two on changed files are older `any` casts) · tests 4115/4115 in 238 suites ·
coverage of added lines: statements and branches all run (sessionGate 51/51 and 15/15, useGameConnection 12/12 and 10/10, runtimeSingleton 35/35 and 22/22,
userScriptRuntime 14/14 and 4/4, pluginScriptRunner 19/19 and 4/4)
Tests added/updated: new `sessionGate.test.ts`, `useGameConnection.test.ts`, `userScriptRuntime.doAfter.test.ts`, `pluginScriptRunner.test.ts`;
`runtimeSingleton.test.ts` extended. Five of the new cases were run against the old `useGameConnection.ts` and `pluginScriptRunner.ts` and failed.
Edge cases covered: R20 and RUNLOOP-05 (user timers, plugin timers, doAfter: unit tests and live check) · R21 and CONNLIFE-01 (replaced-socket test) ·
R22 and CONNLIFE-02 (AFK reset) · R23 and EVENTBUS-01 (a default-key listener still hears the open) · E12 (waiting line; recorded traffic in 1.1) ·
E13 (no existing test relied on timers ticking while disconnected: the old 4078 passed unchanged) · E14 (nothing echoed or sent without an open socket) ·
E21 (notices follow the dropped session's scripts)
Classifiers proposed / approved and added / declined: CONNLIFE-03 / added / none
API: none in this phase
Live check: 13/13 PASS (built bundle in Chromium, this script standing in for the game proxy; see A2)
Incremental screenshots: phase-01_timers-paused.png, phase-01_timers-resumed.png, phase-01_help.png (each opened and checked)
Showcase captures taken in the browser-test tool's store (copied into the item in Phase 12): 06-web-timers-paused, 08-web-scripting-help-timers
Docs: developer `docs/game-client.md` (new section with the W5 diagram, close-event listeners), `docs/architecture/Emitted Events.md`,
`docs/scripting/scripting-summary.md` · end user: the in-app Scripting Help (Timers and doAfter) · indexes: `features/connection/.ai-context`,
`features/userScripts/.annotated`, `features/plugins/.annotated`, `hooks/.annotated`
Skipped verification: none. The running game-client container still serves the old build: rebuilding and deploying it is the owner's.

Documentation impact (`check-doc-impact.mjs`):
- docs/context.md: checked, still accurate: the layer diagram (hook, RuntimeSingleton, UserScriptRuntime) is unchanged.
- docs/game/chat-panes.md: checked, still accurate: chat capture in runtimeSingleton and userScriptRuntime is untouched.
- docs/game/simulacrum-admin.md: checked, still accurate: open and close events and the send-command path to the socket are as described.
- apps/game-client/src/components/: checked, still accurate: only help text changed in ScriptingHelpModal.tsx; nothing the code cannot tell.
- .ai-code-review/20261002-0900-crafting-helper-v1.0.0-review.md: unrelated change: historical review record.
- .ai-code-review/20261017-1350-pr160-crafting-helper/bugfix-proposal.md: unrelated change: historical review record.
- .ai-code-review/20261017-1350-pr160-crafting-helper/findings.md: unrelated change: historical review record.
- .ai-code-review/20261017-1350-pr160-crafting-helper/fix-log.md: unrelated change: historical review record.
- .ai-code-review/20261017-1350-pr160-crafting-helper/review.md: unrelated change: historical review record.
- docs/superpowers/plans/2026-09-14-custom-hud-layout.md: unrelated change: historical plan.
- docs/superpowers/plans/2026-10-02-crafting-helper-v1.0.0-review-fixes.md: unrelated change: historical plan.
- docs/superpowers/specs/2026-09-14-custom-hud-layout-design.md: unrelated change: historical spec.

## Phase 2 — Web: the autopilot and the built-in bots stop at a dropped connection (2026-11-26)

Commands: `pnpm --filter @shatteredarchive/game-client test` · `pnpm typecheck` · `pnpm lint` · `pnpm --filter @shatteredarchive/game-client build` ·
jest with coverage on the changed source files · `node <item>/tools/web-autopilot-drop-check.mjs` · `node <item>/tools/web-drop-check.mjs`
Results: build OK · typecheck OK · lint 0 errors, 296 warnings (as the baseline) · tests 4136/4136 in 242 suites ·
coverage of added lines: autoleveling-engine 6/6 and 4/4, useAutoLeveling 1/1, respell 7/7, questbot 26/26 and 14/14, auto-group 6/6.
`autoleveling-debug.ts` 0%: a function moved unchanged out of the hook because it reads `import.meta`, which Jest cannot load (A6).
Tests added/updated: new `autoleveling-engine.disconnect.test.ts` (waiting, paused, mid-wait between laps, idle and a second close),
`useAutoLeveling.socket.test.tsx` (failed with the old keys), `respell.plugin.test.ts`, `questbot.plugin.drop.test.ts`; `auto-group.plugin.test.ts` extended;
`autoleveling-engine.rearm.test.ts` listener count 12 to 13.
Edge cases covered: R20 and RUNLOOP-05 (autopilot, quest bot, respell, auto-group) · R23 and EVENTBUS-01 (hook keys) · R22 and CONNLIFE-02 (respell's affect
list, quest bot's fighting flag, auto-group's in-flight lookups)
Classifiers proposed / approved and added / declined: none
API: none in this phase
Live check: autopilot 4/4 PASS (run started through the app's start event, dropped, reconnected, logged in); the Phase 1 script again 13/13
Incremental screenshots: phase-02_autopilot-stopped.png (opened and checked)
Docs: developer `docs/game/autopilot.md` (pause-and-stop list and state diagram), `docs/scripting/plugins.md` (Auto Respell, Quest Bot),
`docs/game-client.md` (W5 diagram) · end user: in-app help (Auto Leveling, Auto Respell, Quest Bot). Auto Group has no player help section; its change
(a lookup in flight is forgotten) has nothing a player sets or types · indexes: `features/autoleveling`, `features/plugins/core-plugins`, `hooks`
Skipped verification: none
Seen, not changed: stopping a run that is waiting (the player's Stop does the same) also prints `error: stopped` before `stopped`.

Documentation impact:
- docs/copilot/client.md: checked, still accurate: the diagram shows the hook reporting run state to the signals; that path is unchanged.

## Phase 3 — Measure what keeps running in the background (2026-11-26)

Environment: `emulator-5554` (Pixel8), installed dev client built 2026-11-21 with the JavaScript served by Metro from the working tree;
`session.mjs up --planned-phase` printed only loopback and emulator-alias origins; no sign-in. Stand-in: `tools/fake-mud.mjs --port 4501`,
`adb reverse tcp:4501`, app connected to `localhost:4501`. A user timer script (every 10 s, one harmless command). Emulator set to run on
battery for each run and restored after; no battery-optimisation exemption.

| State | Setting on | Setting off |
|---|---|---|
| foreground, 30 s | 3 of 3 | 3 of 3 |
| home screen, 60 s | 6 of 6 | 0 of 6 |
| screen locked, 60 s | 6 of 6 | 1 of 6, at the start only |
| forced deep idle, 60 s | 7 of 6, longest gap 10.0 s | 1 of 6, at the start only |

Setting on: the app's keep-alive service was running in the foreground (`isForeground=true`). Setting off: no such service. A first setting-off run
(3-minute windows, stopped early, see A8) sent nothing from 13:34 until the return 2.5 minutes later, then one send. The connection stayed open in
every run (loopback).

Outcome: timers do fire with the setting on, so the stop condition of 3.S is not met and D6 stands as planned.
Typecheck baseline (3.3): `pnpm --dir M exec tsc --noEmit` 0 errors.
Tests added/updated: none (a verification tool and a doc). Edge cases covered: RUNLOOP-04 (measured), R18 (loopback only).
Classifiers proposed / approved and added / declined: none. API: none. Screenshots: none kept (the evidence is the stand-in's timestamps).
Docs: developer `shatteredarchive-mobile/docs/features/background-connection.md` (measured result and date) · end user: no user-visible change.
Skipped verification: build, lint and tests not rerun: no code changed in either repository in this phase (doc and a tool in the item folder only).

## Phase 4 — Plugins learn when a character logs in and when the session ends (2026-11-26)

Mobile moved to ead69f9 during the work (A9).
Commands: `pnpm --dir M test --runInBand` · `pnpm --dir M exec tsc --noEmit` · `pnpm --dir M lint` · `pnpm --dir M exec expo export --platform android` ·
jest with coverage on the changed source files
Results: bundle OK · typecheck 0 errors · lint 0 errors, 173 warnings (3 errors before 4.8; warnings in touched files are the repo's usual
`jest.mock`-before-import ones and one older hook warning) · tests 2266/2266 in 149 suites · coverage of added lines: statements and branches all run
(connection-manager 13/13 and 4/4, script-engine, character-login 5/5 and 2/2, AnsiViewer 2/2, chat 8/8 and 4/4)
Tests added/updated: new `script-engine-session-events-test.ts`, `script-engine-plugin-gmcp-test.ts`, `connection-manager-session-end-test.ts`,
`AnsiViewer-focus-test.tsx`; `ChatScreen-test.tsx` (clear while scrolled up); `connection-manager-send-test.ts` (fake engine)
Edge cases covered: R1 (login and close have producers) · R3 and PORT-03 (identity cleared on all three ends) · E4 (a disconnect ends once) ·
R21 (a replaced socket's close ends nothing) · E22 and PORT-01 (game events reach plugins)
Classifiers proposed / approved and added / declined: none. API: none. Screenshots: none in this phase.
Docs: developer `scripts-plugins.md` (events that reach plugins, session events, W1 diagram), `play-connection.md` (session end) · end user: no
new text: the four plugins now do what their descriptions on the Scripts screen already say · indexes: `features/scripts`, `features/connection`,
`features/autoleveling`
Workflow check (W1): matches the After diagram.
Seen, not changed: nothing in the app emits `event:disarm` or `event:fighting:opponent`, so Text to Speech's enemy health alert cannot fire on mobile.

## Phase 5 — Crafting data can be saved and read on the device (2026-11-26)

Commands: as Phase 4.
Results: bundle OK · typecheck 0 errors · lint 0 errors, 173 warnings (unchanged) · tests 2306/2306 in 151 suites ·
coverage: `crafting-helper-storage.ts` 223/223 statements, 152/152 branches; the hydrate line in `script-engine.ts` runs
Tests added: `crafting-helper-storage-test.ts` (39 cases: the web's 19 ported, then refused writes before the load, a failed load and a later
success, one shared load, odd saved data, write order behind a slow write, failed saves, the save on backgrounding);
`script-engine-crafting-hydrate-test.ts` (plugins are enabled only after the load, also a failed one)
Edge cases covered: R2 and PORT-02
Classifiers proposed / approved and added / declined: none. API: none. Screenshots: none (no screen).
Docs: developer `features/scripts/.annotated`; the feature doc `crafting-helper.md` is written with the plugin in 6.6 · end user: no visible change

## Phase 6 — The Crafting Helper works from the command line on mobile (2026-11-26)

Commands: as Phase 4, plus `gradlew assembleDebug -PreactNativeArchitectures=x86_64` and `adb -s emulator-5554 install -r` after the session
preflight (A12), then `session.mjs up --planned-phase`.
Results: bundle OK · typecheck 0 errors · lint 0 errors, 173 warnings · tests 2676/2676 in 157 suites · coverage: all 107 lines that differ from
the web plugin run (the unrun lines of the file are carried-over web code); `plugin-panel-store.ts` and the new host lines run
Tests added/updated: the web's three suites ported (`crafting-helper-test.ts`, `-hardening-test.ts`, `-hardening-units-test.ts`),
`crafting-helper-mobile-test.ts`, `plugin-panel-store-test.ts`, `use-plugin-panel-test.tsx`, `plugin-host-test.ts` (setPanel),
`plugin-records-test.ts` (the crafting record); harness `__helpers__/crafting-harness.ts` and `crafting-device.ts`
Web cases changed, none dropped (reason in each case: the device has no browser):
- the `buildHudContent` block rewritten for `buildPanelContent`; widget-write assertions read the published panel text
- "flushed when the tab becomes hidden" and "pagehide" use the app going to the background
- the failed-write case makes the device refuse the write instead of throwing from `Storage.prototype`
- cases are asynchronous, saves are allowed to land between cases, and the store is loaded before the first one
Edge cases covered: R1 (each event has a producer; table in the feature doc) · R3 and PORT-03 · R4 and RUNLOOP-02 · R5 and RUNLOOP-03 (carried-over
cases) · R9 and SETTINGS-04 · R15 and CMDTPL-01 · R16 and CLOUDSYNC-02 · E1 · E2 · E3 (see A13) · E9 · E10
Classifiers proposed / approved and added / declined: none. API: none.
Emulator (rebuilt app, stand-in game on loopback): plugin enabled on the Scripts screen; tailoring training ran its loop, pulls about 200 ms apart;
`improve stop` stopped it and returned the materials; an order for one gem was queued, crafted, quality-checked, stored and tallied; the
stand-in dropped the connection during a run and received nothing more; after reconnecting nothing was sent in 6 s and the plugin reported
`state=idle`. The "run abandoned" line itself cannot be seen on the phone (A14).
Incremental screenshots: phase-06_crafting-terminal.png (the finished order), phase-06_abandoned.png (idle after the reconnect), both opened and checked
Docs: developer `docs/features/crafting-helper.md` (new), `scripts-plugins.md` · end user: `crafthelper help`, the plugin's description and its
Pull confirm timeout setting text; the player section of the feature doc · indexes: `features/scripts`, `features/scripts/plugins`, `features/hud`
Skipped verification: curly quotes were not typed on the emulator (the keyboard tool cannot enter them); covered by E2's test.

## Phase 7 — Runs survive other screens, and stop at a dropped connection (2026-11-26)

Commands: as Phase 4, plus `Server/deploy-local.ps1` (DSL) and a Playwright capture of `http://localhost:5000/Library/Scripting`.
Results: bundle OK · typecheck 0 errors · lint 0 errors, 182 warnings (new ones are the test files' usual `jest.mock`-before-import pattern) ·
tests 2728/2728 in 161 suites · coverage of added lines: run-hold, session-gate, script-runtime, respell, quest bot, script-engine,
connection-manager, useAutoLeveling, controller: all statements and branches run; every line of the crafting plugin that differs from the web runs
Tests added/updated: new `session-gate-test.ts`, `run-hold-test.ts`, `script-runtime-session-test.ts`, `plugins-session-end-test.ts`;
extended crafting mobile (pause, resume, discard, put-backs while held, start notice), `crafting-helper-test.ts` (paused panel; running actions
now include pause), controller (start notice), `use-autoleveling-test.tsx` (hold), engine session events (gate calls, run hold),
connection-manager (gate and hold wiring), `PlayContainer-test.tsx` (E11: a script timer, a crafting run and the autopilot carry on after the
Play screen unmounts)
Edge cases covered: R6 and RUNLOOP-04 · R20 and RUNLOOP-05 · E5 (`inactive` holds nothing) · E11 · CONNLIFE-02 (respell, quest bot)
Autopilot on disconnect (7.6): already stops (`onDisconnected`); covered by the existing lifecycle test.
Classifiers proposed / approved and added / declined: none. API: none.
Emulator (stand-in with a 600 ms reply delay): background mode off, a training run sent nothing during 12 s away, showed the `[Paused]` line, sent
nothing until `crh resume`, then carried on; background mode on, 19 crafting commands arrived during 12 s away; the stand-in dropped the
connection during a run: nothing more was sent, the run did not restart, and the script timer's first send came 11 s after the reconnect (login
at 1 s, then a full 10 s). A first attempt with a 1 s reply delay failed at the `score` step (the plugin waits 1 s for it by default).
Incremental screenshots: phase-07_paused.png, phase-07_dropped.png (waiting and resumed lines), phase-07_site-help.png, all opened and checked
Docs: developer `background-connection.md`, `autopilot.md`, `crafting-helper.md`, `scripts-plugins.md` · end user: `crafthelper help`,
the start notices, the public Scripting page (DSL repo, deployed to the local site and checked; production is the owner's) · indexes:
`features/connection`

## Phase 8 — Floating panels and equipment's display modes (2026-11-26)

Commands: `pnpm --dir $M test --runInBand`, `exec tsc --noEmit`, `lint`, `exec expo export --platform android`, coverage as in Phase 4.
Results: bundle OK · typecheck 0 errors · lint 0 errors, 200 warnings (new ones are the test files' usual `jest.mock`-before-import pattern) ·
tests 2764/2764 in 165 suites before the last added drag case, which passed with its files (31/31) · coverage of added lines in the six
source files: all statements run; branches all run after removing two that could not happen
Tests added/updated: new `panel-layout-settings-test.ts`, `floating-panel-storage-test.ts`, `FloatingPanel-test.tsx`,
`EquipmentHotbar-test.tsx` (includes the Settings chips); one case added to `PlayContainer-test.tsx`
Edge cases covered: R7, R8, R10 (layout store tests) · R13, R14 (slop, exact offset, clamping) · E8 (three panels, portrait and landscape,
distinct places)
Classifiers proposed / approved and added / declined: none. API: none.
Emulator (stand-in): equipment docked, floating and minimal; the floating card dragged and stayed on screen in landscape.
Incremental screenshots: phase-08_equipment-docked.png, -floating.png, -floating-landscape.png, -minimal.png, -minimal-landscape.png, all
opened and checked. Seen in the minimal shots: the compass loses its exit highlights after a rotation (E20, fixed in Phase 10).
Docs: developer and player `docs/features/play-layout.md` (new), `docs/reference/game-client.md` · indexes: `features/hud`, `components/hud`

## Phase 9 — Autopilot and crafting share the display modes (2026-11-26)

Commands: as Phase 8.
Results: bundle OK · typecheck 0 errors · lint 0 errors, 210 warnings (new ones are the test files' usual `jest.mock`-before-import pattern) ·
tests 2792/2792 in 166 suites · coverage of added lines: CraftingPanel, AutopilotPlayControl, FloatingPanel: all statements and branches run
Tests added/updated: new `CraftingPanel-test.tsx` (every form and status, every button calls its action, pressed state, disable);
`play-control-test.tsx` (what the minimal row says, floating panel); `settings-card-test.tsx` (labels); `FloatingPanel-test.tsx` (touched
card on top, press not taken); `PlayContainer-test.tsx` (crafting panel in the game panel)
Edge cases covered: R13 on the device (a plain press on Pause inside the movable card paused the run; nothing was sent after it) · E8
(overlap found and fixed, see A16)
Classifiers proposed / approved and added / declined: none. API: none.
Emulator (stand-in): a crafting run with autopilot and crafting docked, minimal and floating. The autopilot has no area set up on this device, so
its shots show the idle and "Not set up yet" states; its running, paused and error texts are covered by tests only.
Incremental screenshots: phase-09_docked.png, -minimal.png, -floating.png, -floating-paused.png, -floating-autopilot-open.png, opened and checked
Docs: developer `autopilot.md`, `crafting-helper.md`, `play-layout.md` · end user: `play-layout.md` "For players", Settings descriptions ·
indexes: `components/autoleveling`, `components/hud`

## Phase 10 — Compass and input bar placement, and resetting the layout (2026-11-26)

Commands: as Phase 8.
Results: bundle OK · typecheck 0 errors · lint 0 errors, 238 warnings (new ones are the test files' usual `jest.mock`-before-import pattern) ·
tests 2836/2836 in 171 suites · coverage of added lines: all statements and branches run, except the command field's existing focus and blur
handlers in `AnsiViewer.tsx`, which were only re-indented
Tests added/updated: new `layout-reset-test.ts` (every HUD setting is either restored or deliberately kept), `exits-store-test.tsx`,
`Compass-test.tsx`, `InputRestoreButton-test.tsx`, `ScreenLayoutSettings-test.tsx`; extended `PlayContainer-test.tsx` (every compass place,
input placements, restore button, stable header button), `AnsiViewer-test.tsx` (placement, comparator, text kept), `FloatingPanel-test.tsx`
(handle, keyboard), `FloatingSpeechStop-test.tsx` (reset moves it), `hud-settings-defaults-test.ts`
Edge cases covered: R7, R8, R10 · R22 (exits forgotten at session end) · E15 (emulator, both orientations) · E16 · E17 · E18 · E19 · E20
Classifiers proposed / approved and added / declined: none yet (two candidates listed under A17 for the end of the plan). API: none.
Emulator (stand-in): reset with its confirmation; compass top, floating (moved by its handle; a swipe over the directions did not move it) and
floating sideways; input top with the on-screen keyboard, portrait and landscape; everything hidden, then the input button's hold options, drag and
tap. Found there and fixed: the first tap after a press-and-hold was swallowed; floating cards stayed behind the keyboard.
Known limit: a floating card taller than the room above the keyboard (the compass, phone sideways) is moved to the top but stays partly covered.
Incremental screenshots: phase-10_layout-settings, _reset-confirm, _after-reset, _compass-top-input-top, _input-top-keyboard,
_input-top-keyboard-landscape, _compass-floating, _compass-floating-moved, _landscape-compass-floating-input-top, _everything-hidden,
_input-button-options, _input-opened-from-button (.png), opened and checked
Docs: developer and end user `play-layout.md` · indexes: `components`, `components/hud`, `features/hud` · `app/(tabs)`: nothing to say (a
settings section that renders one component)

## Phase 11 — Left and right icon docks (2026-11-26)

Commands: as Phase 8.
Results: bundle OK · typecheck 0 errors · lint 0 errors, 254 warnings (new ones are the test files' usual `jest.mock`-before-import pattern) ·
tests 2880/2880 in 173 suites, plus the plugin-enabled listener test added after (1/1) · coverage of added lines: all statements and branches
run, except the status bar's existing connection button handler in `PlayContainer.tsx`, which was only re-indented
Tests added/updated: new `dock-items-test.ts` (every icon's tap, restore, options and side moves against the real stores), `EdgeDock-test.tsx`
(tap, hold, accessibility action, target size, keyboard padding, options placement inside the safe area, back and outside press, rails
following the settings), `plugin-enabled-subscribe-test.ts`; extended `PlayContainer-test.tsx` (docks on), `ScreenLayoutSettings-test.tsx`.
The docks-off `PlayContainer` cases are unchanged and green (E6).
Edge cases covered: R11, R12 (device and tests) · R19 (device: lit and unlit icons, pressed and selected rows) · E6, E7
Classifiers proposed / approved and added / declined: none new. API: none.
Emulator (stand-in): docks upright; options folded out; compass moved to the right (two rails, terminal re-wrapped); hold then one press outside
or the back button closed the options at once; sideways with gesture navigation (rails inside the safe area, last icon reached by scrolling);
sideways with the keyboard up the rail stopped above it, and the last icon opened its options; swipes along the rail changed no state.
Observed, standard behaviour: a short swipe that stays within a button's tap slop counts as a tap (seen upright, where the rail does not scroll).
Observed, not changed (older than this work apart from the crafting row): sideways with the keyboard up, docked vitals, equipment and autopilot
rows can fill all the room above the keyboard, hiding the command input; making those Floating or Minimal or hiding them avoids it.
Incremental screenshots: phase-11_docks-setting, _docks-portrait, _flyout, _both-sides, _docks-landscape, _docks-landscape-keyboard,
_docks-landscape-keyboard-scrolled, _docks-landscape-keyboard-options, _docks-connection-dialog (.png), opened and checked
Docs: developer and end user `play-layout.md`, `play-connection.md`, `docs/reference/mobile.md` · indexes: `components/hud`, `features/hud`

## Phase 12 — Whole-feature verification and showcase (2026-11-26)

Commands: mobile `pnpm --dir $M test --runInBand [--coverage]`, `exec tsc --noEmit`, `lint`, `exec expo export --platform android`; web
`pnpm typecheck`, `pnpm lint`, `pnpm --dir apps/game-client test --coverage`, `pnpm --dir apps/game-client build`,
`tools/web-drop-check.mjs --showcase`, `tools/web-autopilot-drop-check.mjs`.
Results: mobile bundle OK · typecheck 0 errors · lint 0 errors, 254 warnings · tests 2886/2886 in 174 suites · web typecheck clean · lint 0 errors,
296 warnings (as at baseline) · tests 4136/4136 in 242 suites · build OK · live checks 13/13 and 4/4.
Coverage (mobile, whole app): statements 84.3%, branches 78.0%, functions 84.8%, lines 87.3%. Added lines: all run except the crafting plugin's
lines that are identical to the web file (every one of the 228 differing lines runs), the Settings screen (no test renders it; its new parts are
tested as their own components and were used on the device), and three re-indented handlers. Web whole app: statements 57.7%, lines 59.0%.
End to end on the emulator (stand-in): docks on, a crafting order and an autopilot run on the Training Ground area together; both carried on
while on another tab; with background mode off, leaving the app paused them and nothing was sent until Resume.
**Found and fixed here:** a run that was between laps or resting was not held on leaving the app (only 'running' was). Fixed with tests, then
proven on the device: left while "Waiting", away longer than the lap wait, nothing was sent.
Observed in scripted runs: one press-and-hold registered as a tap while the screen was busy (12 repeats all opened the options); an Enter key
from a hardware keyboard activates the dock icon that last had keyboard focus (standard Android behaviour).
Scan (R17, R18): changed files of both repos and the item folder hold no addresses, e-mail addresses, tokens or user paths; character names are
placeholders, except that the new web auto-group cases reuse the fixture names that file already had. One capture showed clipboard text on the
keyboard; it was overwritten. The app connected only to loopback and the local dev stack; the one test account's cloud data was emptied by the
session reset.
Doc impact: doc impact: 0 doc(s) naming a changed file and 0 folder index(es) unresolved (13 already recorded)
Emulator afterwards: AVD config restored, navigation and rotation restored, app data cleared, test session down, stand-in stopped. The emulator
itself is left running.

## Screenshots

**Incremental screenshots (progress, git-ignored):** phase-01_help.png, phase-01_timers-paused.png, phase-01_timers-resumed.png, phase-02_autopilot-stopped.png, phase-06_abandoned.png, phase-06_crafting-terminal.png, phase-07_dropped.png, phase-07_paused.png, phase-07_site-help.png, phase-08_equipment-docked.png, phase-08_equipment-floating-landscape.png, phase-08_equipment-floating.png, phase-08_equipment-minimal-landscape.png, phase-08_equipment-minimal.png, phase-09_docked.png, phase-09_floating-autopilot-open.png, phase-09_floating-paused.png, phase-09_floating.png, phase-09_minimal.png, phase-10_after-reset.png, phase-10_compass-floating-moved.png, phase-10_compass-floating.png, phase-10_compass-top-input-top.png, phase-10_everything-hidden.png, phase-10_input-button-options.png, phase-10_input-opened-from-button.png, phase-10_input-top-keyboard-landscape.png, phase-10_input-top-keyboard.png, phase-10_landscape-compass-floating-input-top.png, phase-10_layout-settings.png, phase-10_reset-confirm.png, phase-11_both-sides.png, phase-11_docks-connection-dialog.png, phase-11_docks-landscape-keyboard-options.png, phase-11_docks-landscape-keyboard-scrolled.png, phase-11_docks-landscape-keyboard.png, phase-11_docks-landscape.png, phase-11_docks-portrait.png, phase-11_docks-setting.png, phase-11_flyout.png, phase-12_autopilot-held-while-waiting.png, phase-12_both-paused-on-return.png

**Final showcase screenshots (shipped with the PR):** showcase_01_crafting-docked.png, showcase_02_floating-panels.png, showcase_03_minimal.png, showcase_04_docks-landscape.png, showcase_05_dock-flyout.png, showcase_06_web-timers-paused.png, showcase_07_compass-floating-input-top.png, showcase_08_web-scripting-help-timers.png

## Final state

Mobile (`shatteredarchive-mobile`, uncommitted):
- `docs/features/autopilot.md`
- `docs/features/background-connection.md`
- `docs/features/play-connection.md`
- `docs/features/scripts-plugins.md`
- `docs/reference/game-client.md`
- `docs/reference/mobile.md`
- `dsl-client/app/(tabs)/chat.tsx`
- `dsl-client/app/(tabs)/settings.tsx`
- `dsl-client/components/.annotated`
- `dsl-client/components/AnsiViewer.tsx`
- `dsl-client/components/Compass.tsx`
- `dsl-client/components/PlayContainer.tsx`
- `dsl-client/components/__tests__/AnsiViewer-test.tsx`
- `dsl-client/components/__tests__/ChatScreen-test.tsx`
- `dsl-client/components/__tests__/FloatingSpeechStop-test.tsx`
- `dsl-client/components/__tests__/PlayContainer-test.tsx`
- `dsl-client/components/autoleveling/.annotated`
- `dsl-client/components/autoleveling/AutopilotPlayControl.tsx`
- `dsl-client/components/autoleveling/AutopilotSettingsCard.tsx`
- `dsl-client/components/autoleveling/__tests__/play-control-test.tsx`
- `dsl-client/components/autoleveling/__tests__/settings-card-test.tsx`
- `dsl-client/components/hud/.annotated`
- `dsl-client/components/hud/EquipmentHotbar.tsx`
- `dsl-client/components/hud/FloatingSpeechStop.tsx`
- `dsl-client/features/autoleveling/.annotated`
- `dsl-client/features/autoleveling/__tests__/autoleveling-controller-test.ts`
- `dsl-client/features/autoleveling/__tests__/use-autoleveling-test.tsx`
- `dsl-client/features/autoleveling/autoleveling-controller.ts`
- `dsl-client/features/autoleveling/character-login.ts`
- `dsl-client/features/autoleveling/useAutoLeveling.ts`
- `dsl-client/features/connection/.annotated`
- `dsl-client/features/connection/__tests__/connection-manager-send-test.ts`
- `dsl-client/features/connection/connection-manager.ts`
- `dsl-client/features/hud/.annotated`
- `dsl-client/features/hud/__tests__/hud-settings-defaults-test.ts`
- `dsl-client/features/hud/floating-stop-storage.ts`
- `dsl-client/features/hud/hud-settings-storage.ts`
- `dsl-client/features/hud/hud-types.ts`
- `dsl-client/features/scripts/.annotated`
- `dsl-client/features/scripts/__tests__/plugin-host-test.ts`
- `dsl-client/features/scripts/__tests__/plugin-records-test.ts`
- `dsl-client/features/scripts/plugin-config-storage.ts`
- `dsl-client/features/scripts/plugin-host.ts`
- `dsl-client/features/scripts/plugin-registry.ts`
- `dsl-client/features/scripts/plugins/.annotated`
- `dsl-client/features/scripts/plugins/questbot.plugin.ts`
- `dsl-client/features/scripts/plugins/respell.plugin.ts`
- `dsl-client/features/scripts/script-engine.ts`
- `dsl-client/features/scripts/script-runtime.ts`
- `dsl-client/features/scripts/script-types.ts`
- `docs/features/crafting-helper.md`
- `docs/features/play-layout.md`
- `dsl-client/components/__tests__/AnsiViewer-focus-test.tsx`
- `dsl-client/components/__tests__/Compass-test.tsx`
- `dsl-client/components/__tests__/CraftingPanel-test.tsx`
- `dsl-client/components/__tests__/EdgeDock-test.tsx`
- `dsl-client/components/__tests__/EquipmentHotbar-test.tsx`
- `dsl-client/components/__tests__/FloatingPanel-test.tsx`
- `dsl-client/components/__tests__/InputRestoreButton-test.tsx`
- `dsl-client/components/__tests__/ScreenLayoutSettings-test.tsx`
- `dsl-client/components/hud/CraftingPanel.tsx`
- `dsl-client/components/hud/DockFlyout.tsx`
- `dsl-client/components/hud/EdgeDock.tsx`
- `dsl-client/components/hud/FloatingPanel.tsx`
- `dsl-client/components/hud/InputRestoreButton.tsx`
- `dsl-client/components/hud/PanelModeChips.tsx`
- `dsl-client/components/hud/PlayDocks.tsx`
- `dsl-client/components/hud/ScreenLayoutSettings.tsx`
- `dsl-client/features/connection/__tests__/connection-manager-session-end-test.ts`
- `dsl-client/features/connection/__tests__/run-hold-test.ts`
- `dsl-client/features/connection/__tests__/session-gate-test.ts`
- `dsl-client/features/connection/run-hold.ts`
- `dsl-client/features/connection/session-gate.ts`
- `dsl-client/features/hud/__tests__/dock-items-test.ts`
- `dsl-client/features/hud/__tests__/exits-store-test.tsx`
- `dsl-client/features/hud/__tests__/floating-panel-storage-test.ts`
- `dsl-client/features/hud/__tests__/layout-reset-test.ts`
- `dsl-client/features/hud/__tests__/panel-layout-settings-test.ts`
- `dsl-client/features/hud/__tests__/plugin-panel-store-test.ts`
- `dsl-client/features/hud/__tests__/use-plugin-panel-test.tsx`
- `dsl-client/features/hud/dock-items.ts`
- `dsl-client/features/hud/exits-store.ts`
- `dsl-client/features/hud/floating-panel-storage.ts`
- `dsl-client/features/hud/layout-reset.ts`
- `dsl-client/features/hud/panel-layout-settings.ts`
- `dsl-client/features/hud/plugin-panel-store.ts`
- `dsl-client/features/scripts/__helpers__/crafting-device.ts`
- `dsl-client/features/scripts/__helpers__/crafting-harness.ts`
- `dsl-client/features/scripts/__tests__/crafting-helper-hardening-test.ts`
- `dsl-client/features/scripts/__tests__/crafting-helper-hardening-units-test.ts`
- `dsl-client/features/scripts/__tests__/crafting-helper-mobile-test.ts`
- `dsl-client/features/scripts/__tests__/crafting-helper-storage-test.ts`
- `dsl-client/features/scripts/__tests__/crafting-helper-test.ts`
- `dsl-client/features/scripts/__tests__/plugin-enabled-subscribe-test.ts`
- `dsl-client/features/scripts/__tests__/plugins-session-end-test.ts`
- `dsl-client/features/scripts/__tests__/script-engine-crafting-hydrate-test.ts`
- `dsl-client/features/scripts/__tests__/script-engine-plugin-gmcp-test.ts`
- `dsl-client/features/scripts/__tests__/script-engine-session-events-test.ts`
- `dsl-client/features/scripts/__tests__/script-runtime-session-test.ts`
- `dsl-client/features/scripts/crafting-helper-storage.ts`
- `dsl-client/features/scripts/plugins/crafting-helper.plugin.ts`

Web (`ShatteredArchive`, uncommitted, item folder not listed):
- `apps/game-client/src/components/ScriptingHelpModal.tsx`
- `apps/game-client/src/features/autoleveling/.annotated`
- `apps/game-client/src/features/autoleveling/autoleveling-engine.rearm.test.ts`
- `apps/game-client/src/features/autoleveling/autoleveling-engine.ts`
- `apps/game-client/src/features/connection/.ai-context`
- `apps/game-client/src/features/plugins/.annotated`
- `apps/game-client/src/features/plugins/core-plugins/.annotated`
- `apps/game-client/src/features/plugins/core-plugins/auto-group.plugin.test.ts`
- `apps/game-client/src/features/plugins/core-plugins/auto-group.plugin.ts`
- `apps/game-client/src/features/plugins/core-plugins/questbot.plugin.ts`
- `apps/game-client/src/features/plugins/core-plugins/respell.plugin.ts`
- `apps/game-client/src/features/plugins/pluginScriptRunner.ts`
- `apps/game-client/src/features/userScripts/.annotated`
- `apps/game-client/src/features/userScripts/runtimeSingleton.test.ts`
- `apps/game-client/src/features/userScripts/runtimeSingleton.ts`
- `apps/game-client/src/features/userScripts/userScriptRuntime.ts`
- `apps/game-client/src/hooks/.annotated`
- `apps/game-client/src/hooks/useAutoLeveling.ts`
- `apps/game-client/src/hooks/useGameConnection.ts`
- `docs/architecture/Emitted Events.md`
- `docs/game-client.md`
- `docs/game/autopilot.md`
- `docs/scripting/plugins.md`
- `docs/scripting/scripting-summary.md`
- `docs/standards/edge-cases/README.md`
- `docs/standards/edge-cases/automation-run-loops.md`
- `docs/standards/edge-cases/mobile-screen-insets.md`
- `docs/standards/edge-cases/web-to-app-port.md`
- `docs/standards/typescript.md`
- `apps/game-client/src/features/autoleveling/autoleveling-debug.ts`
- `apps/game-client/src/features/autoleveling/autoleveling-engine.disconnect.test.ts`
- `apps/game-client/src/features/connection/sessionGate.test.ts`
- `apps/game-client/src/features/connection/sessionGate.ts`
- `apps/game-client/src/features/plugins/core-plugins/questbot.plugin.drop.test.ts`
- `apps/game-client/src/features/plugins/core-plugins/respell.plugin.test.ts`
- `apps/game-client/src/features/plugins/pluginScriptRunner.test.ts`
- `apps/game-client/src/features/userScripts/userScriptRuntime.doAfter.test.ts`
- `apps/game-client/src/hooks/useAutoLeveling.socket.test.tsx`
- `apps/game-client/src/hooks/useGameConnection.test.ts`
- `docs/standards/edge-cases/connection-lifecycle.md`

Public site (`DSL`, deployed to the local site in Phase 7):
- `Server/Server.Web.Public/Views/Library/Scripting.cshtml`

Not done by this work: rebuilding or deploying the web game-client container, any production deploy, a store or device build of the app.
