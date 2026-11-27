# Scope: Port auto-leveling to the mobile client (dsl-client)

Item: item.md · Type: legacy-plan · Scoped against: performance/Allocation-hunt @ 9191edc (ShatteredArchive), optimization/Performance-and-Diagnostics @ 09b5d85 (shatteredarchive-mobile) · Date: 2026-11-20
Data classification of this work: Personal (the synced records are stored per account; see Data touched) (rules: docs/standards/data-classification.md, DRAFT — owner to confirm)

## What the work is

Bring the web client's auto-leveling wizard and engine (area and class pick, buff and fight configuration, a vitals-aware move, engage, fight, loot and rest loop) to the React Native app `dsl-client`, on the app's own connection manager, event bus and AsyncStorage, with Android first and no native module so iOS shares the code. It was captured on 2026-09-12 as a plan that waited for the web side to settle (the plan header says "Web comes first"). It has never been scoped.

**Extra item added by the owner on 2026-11-20 (while scoping):** in the mobile editor where a player defines an alias, trigger or timer, the Save button in the top right cannot be tapped on Android because of the system UI. It has to move somewhere reachable. It is independent of the port and is carried here as its own phase.

**This item overlapped an active plan.** `.ai-plans/active/2026-11-13_editable-autopilot-targets-synced/tech-plan.md` carries the same port as its Phases 7 to 11 (content API, user-data and cloud sync, engine port, configuration screen and play-screen control, device verification), written against the web engine as it stands now. Its Phase 11 already lists "mark `2026-09-12_autoleveling-mobile-port` superseded in its item.md" (`tech-plan.md:655-675` of that plan). See Decisions for the human.

## Affected areas

| Area | Role in the work | Kind | Evidence (path:line) |
|---|---|---|---|
| shatteredarchive-mobile `dsl-client/features/autoleveling/` | The whole port: content API and cache, types and defaults, user-data store, engine, hook | new | folder absent: `ls dsl-client/features` lists 13 folders, none autoleveling; a text search of the repo finds the word only in `docs/reference/game-client.md:128,164` (a description of the web client) |
| mobile `features/connection/connection-manager.ts` | The send path the engine must use; `sendUserInput` splits stacked input and offers each line to the script engine before the socket | change or reuse (a decision of the old plan, Step 3) | `connection-manager.ts:295` (`sendUserInput`), `:17` (`preprocessCommand` import), `:181,190` (`subscribeState`, `subscribeOutput`); no separate programmatic send found |
| mobile `features/scripts/script-engine.ts` and `event-bus.ts` | GMCP to event demux and the pub-sub the engine listens on | reuse | `script-engine.ts:209` (`processGmcpEvent`), `:219-225` (the seven event names); `event-bus.ts:5` (`eventBus`) |
| mobile `features/hud/vitals-store.ts` | Parses hp, mana, stamina from `game:char-data`; the engine also needs the fighting flag | change | `vitals-store.ts:44,49,68` exports; a search for `isFighting` in `features/hud/*.ts` finds nothing |
| mobile `features/walkable-areas/` | Closest storage precedent; its API calls an older C# route directly | reference only | `walkable-areas/api.ts:3-4` (`API_BASE`), `:41` (`fetch-area-as-json`) |
| mobile `features/auth/cloud-sync.ts` and the account section | Save and Load; the active plan adds the autoleveling collection here | change | `cloud-sync.ts:198` (`saveAllToCloud`), `:268`, `:312` |
| mobile `components/PlayContainer.tsx` and `app/` | Control surface and a configuration route | change / new | `PlayContainer.tsx:6,261` (Compass, `showCompass`) |
| mobile `components/scripts/ScriptEditorModal.tsx` | **Extra item (owner, 2026-11-20):** the Save button of the alias, trigger and timer editor sits top right and cannot be tapped on Android; it has to move | change | `ScriptEditorModal.tsx:175` (`<Modal ... presentationStyle="pageSheet"`), `:181-189` (header row holding Close, title and Save), `:320-333` (header and `saveBtn` styles); the file has no safe-area or inset handling (a search for `useSafeAreaInsets`, `SafeAreaView`, `statusBarTranslucent` in it finds nothing); no test file for it exists (`components/scripts/__tests__/UserScriptsSection-test.tsx:67` replaces it with a stub) |
| mobile engine inputs the old plan does not mention | The web engine needs a movement tracker and classifier, damage-line pattern, and the special-line events; the app has none of them | new | engine imports `../movement/classifyMovement`, `../movement/movementTracker` (228 lines), `DAMAGE_LINE_PATTERN` from `combat-compression.plugin` (`autoleveling-engine.ts:70-72`); listens to `shatteredarchive:movement-succeeded|failed`, `event:creature-death`, `event:flee:success|failed` (`:1094-1204`); those two event families come from `UserScriptRuntime.processForSpecialLines` (web, `userScriptRuntime.ts:689`), absent in mobile (`grep processForSpecialLines|creature-death|flee:` in `dsl-client` finds nothing); mobile does emit `shatteredarchive:raw-data` (`script-engine.ts:23,141`) |
| mobile docs | A feature doc for autopilot does not exist; `docs/features/` holds six files, none for it | new | `ls docs/features`; `docs/reference/mobile.md` (stack and screens) |
| game-client `features/autoleveling/` | The source of truth to port from | read only | 2987-line `autoleveling-engine.ts`; 24 test files in the folder; engine has 20 lines using browser-bound calls (`window`, `document`, `DispatchEvent`, `ListenEvent`, `addEventListener`), including `DispatchEvent('shatteredarchive:send-command'` at `autoleveling-engine.ts:1306,1310` |
| game-client wizard | UI reference, not a template | read only | `components/wizard/`: AreaStep, CombatStep, RestStep, ReviewStep, TargetsStep, WeightStep, plus 11 test files |
| web-server | Serves the content endpoints the app would call; falls back to an offline snapshot | read only for this item | `apps/web-server/src/index.ts:461-524` (`/maps/autoleveling/areas`, `/areas/:slug`) |
| Active plan `2026-11-13_editable-autopilot-targets-synced` | Owns the same port (Phases 7-11), the sync contract and the engine rules | related | `tech-plan.md:590-675`; Phases 1-6b, 12-15, 17-22 ticked, Phase 16 open |

## Stakeholders

- The owner: decides whether this item stays separate from the active plan, and runs the Android emulator and any phone check.
- Players who use autopilot on web and would gain it on the phone (end-user audience: players on Android; iOS later).
- The active plan's author context: `2026-11-13_editable-autopilot-targets-synced` and `2026-11-18_autopilot-live-test-findings` both change the engine and the record shapes this port must copy.
- The DSL C# service (separate repo): serves the catalog and validates the synced record kinds; this item adds no endpoint.
- Docs: web has `docs/game/autopilot.md`; mobile has no autopilot page, so a developer and an end-user doc are both missing.

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Area, target and class catalog from `/maps/autoleveling/*` | Public | Read, Store (cache) | New: cached in AsyncStorage on the device |
| The user's configuration, saved targets, overrides and remembered values | Personal (stored per account once synced) | Store, Send (cloud Save and Load) | New on mobile; shapes and ids must match web |
| Game text and GMCP while a run is going (room names, mob names, vitals, the character name in `login_data`) | Personal | Read in memory | New consumer; the old plan does not say anything is stored, and nothing should be (an Unknown to confirm) |
| Run progress and errors (round and step status) | Internal | Read, possibly Log | Unknown whether the port logs; web logs under a fixed prefix |
| Account session used by Save and Load | Restricted | Read | Existing mechanism, unchanged |

## Inputs for sizing

Not sized: that is for a human. Facts counted this session:

- Repos touched: 2 for this item alone (shatteredarchive-mobile; ShatteredArchive as a read-only source and for docs). The active plan also touches the DSL repo.
- Mobile folders: 1 new feature folder; 4 existing feature folders changed or reused (connection, scripts, hud, auth); 1 screen component and 1 route to add; `PlayContainer.tsx` to change.
- Source to port: 1 engine file of 2987 lines, 24 test files in its folder (6 named `autoleveling-engine*.test.ts`, covering the engine, gates, rearm, pause, lap wait and lag), 6 wizard step components and 11 wizard test files. Command: `ls`, `wc -l` and `grep -c` on `apps/game-client/src/features/autoleveling` and `components/wizard`.
- Lines in the engine that use browser-bound calls: 20 (`grep -c "window\.\|document\.\|DispatchEvent\|ListenEvent\|addEventListener"`).
- Mobile tests today: 75 test files under `dsl-client/{features,components,app,hooks,utils}` (`find ... -name "*test.ts*"`); the old plan says `tsc` has a baseline of 7 errors, which this scoping did not re-run (an Unknown).
- Storage keys, endpoints and schemas: 0 new endpoints; 3 content endpoints consumed; record kinds to mirror: 8 (per the active plan's Phase 8).
- Migrations or backfills implied: none (the old plan starts mobile at version 1).
- Deploy artifacts: none for the app code; a local Android build only (`expo run:android`; the repo has no `eas.json` per the old plan, not re-checked).
- Risks and unknowns listed below: 10.

## Dependencies and order

- The old plan's blocker is gone in part: the three web plans it waited for are in `.ai-plans-completed/closed-incomplete/` (`20260909-0739-autoleveling-redesign.md`, `20260912-1629-autoleveling-combat-rest-tuning.md`, `20260813-1325-movement-tracking-fix.md`), and the web engine has since taken in vitals gates, a serial re-arm queue, lap wait and pause files (`autoleveling-engine.gates|rearm|pause|lapwait|lag.test.ts`). The port's source is therefore a different engine from the one the old plan describes.
- The active plan's Phases 7-11 wait on its Phase 6b and the owner's sign-off of the web half; its Phase 16 (pause on timeout) is still open and changes the engine.
- The mobile stack moved: the old plan says Expo 52 and RN 0.76; `dsl-client/package.json` now has `expo ^58.0.22`, `react-native 0.88.1`, `jest-expo ~58.0.13`, pnpm 12.9.1 (a finished item: `.ai-plans-completed/2026-11-01_mobile-expo-sdk-upgrade`).
- An emulator run needs the owner's go (standing permission covers `emulator-5554` only, from an earlier item).

## Risks and unknowns

1. **Stale source.** The old plan says to port the current core engine without the gates work. The web engine no longer matches that; a port following the old text would copy a superseded shape. Wrong assumption: the port and the web engine diverge at the first step.
2. **Two plans for one port.** If both stay open, two different tech plans could be implemented against the same files and record shapes.
3. **Line references drifted.** The old plan cites `script-engine.ts:192-208` for `processGmcpEvent`; it is at `:209`, and `sendUserInput` is at `:295` (old text `:296-305`). Treat the old plan's line numbers as hints.
4. Whether `sendUserInput` or a new programmatic send path suits the engine is not decided (old Step 3); the active plan's Phase 9 owns it.
5. The proxy versus direct-to-C# choice (old Step 1): the active plan's Phase 7 records the proxy; `walkable-areas/api.ts:3-4` shows the app already calls C# directly in dev through the emulator host, so the dev base URL differs per route. Not re-verified end to end.
6. Whether the port logs or stores any game text (Personal) is not specified; confirm before the engine is written.
7. `tsc` baseline and the mobile jest count were not re-run here; both are needed before a phase can claim "no new errors".
8. **Engine inputs missing on mobile** (found after the first draft): see the affected-areas row. The old plan, and Phases 7-11 of the active plan, assume the engine moves over by swapping the event bus and the send call; the movement tracker and the special-line events are also needed, and the web movement modules are 228 and 83 lines and the event producer is a method of the web script runtime. Wrong assumption: the port compiles and then never sees a death, a flee or a completed move.
9. **Save button cause not reproduced.** The header has no inset handling and the app targets Expo SDK 58 (edge-to-edge), which points at the status bar or a display cutout covering the header; this was not confirmed on a device in this session.
10. iOS: build verification is deferred by design; there is no Mac in this session's environment.

## Out of scope

- The web fixes the old plan listed as someone else's job, unless the active plan owns them.
- A pixel-for-pixel copy of the desktop six-step wizard (the old plan asks for a mobile-shaped screen).
- iOS build and run verification.
- Any new C# endpoint.

## Decisions for the human

1. **What becomes of this item?** The active plan's Phases 7-11 already covered the port.
   - **Answered by the owner on 2026-11-20: option C, take the port out of the active plan.** This item keeps the mobile port and gets a rewritten `tech-plan.md`; Phases 7-11 are removed from `2026-11-13_editable-autopilot-targets-synced` by an amendment there. Consequence accepted: that plan loses its mobile half and its web-and-phone round-trip check, which this plan now owns.
   - (Not chosen: A, mark this item superseded; B, keep both plans.)
2. **The Save button** (extra item): the item says only "moved elsewhere". **Answered by the owner on 2026-11-20:** a bar fixed at the bottom of the editor, above the navigation bar and the keyboard (not the end of the form).
