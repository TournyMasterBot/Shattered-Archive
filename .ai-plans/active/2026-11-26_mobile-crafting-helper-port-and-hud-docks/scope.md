# Scope: Port the Crafting Helper to mobile, with selectable display modes and edge icon docks

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ f02e9f9 (ShatteredArchive), optimization/Performance-and-Diagnostics @ f86ba6c (shatteredarchive-mobile, clean tree) · Date: 2026-11-26
Data classification of this work: Personal (saved crafting orders are keyed by character name on the device) (rules: docs/standards/data-classification.md, DRAFT — owner to confirm)

Mobile paths below are relative to `shatteredarchive-mobile/dsl-client/`; web paths to `ShatteredArchive/apps/game-client/src/`.

## What the work is

Port the web Crafting Helper plugin to the mobile client, leaving the web version in place. Let the player choose how
crafting, autopilot and equipment are shown (docked, floating or text-only). Add an icon dock on the left or right edge,
like the VS Code activity bar, that folds out and hides panels and options.

## Where the three features stand today

| Feature | Docked | Floating | Text-only | Can be hidden |
|---|---|---|---|---|
| Autopilot | yes (`bar`, a status row under the HUD) | yes (`hud`, expands from a handle at a fixed spot, not draggable) | no exact match: `minimal` is a row of Start/Pause/Stop buttons with no text | yes (`off`) |
| Equipment | yes (a row of four slots) | no | no | yes (on/off) |
| Crafting | does not exist on mobile | | | |

Evidence: `features/autoleveling/autopilot-display-settings.ts:7-11`, `components/autoleveling/AutopilotPlayControl.tsx:44-92`,
`components/hud/EquipmentHotbar.tsx:29-41`, `features/hud/hud-types.ts:64-98`.

Vitals already have docked and draggable-floating forms with a saved position (`components/hud/FloatingVitals.tsx`), and
the speech stop button is draggable too; both share `features/hud/floating-stop-geometry.ts`.

## Affected areas

| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| Mobile plugin: crafting engine, recipes, parsers, commands | the port itself | new | web `features/plugins/core-plugins/crafting-helper.plugin.ts:50-1877` |
| Mobile plugin storage: skill levels, order queue, history | rewritten for asynchronous storage | new | web `crafting-helper-storage.ts:55-62,93-112,188-223` (synchronous, flushes on page hide) |
| Mobile plugin registry | registers the new plugin | change | `features/scripts/plugin-registry.ts:23-47` |
| Mobile plugin events | the plugin needs "character logged in" and "connection closed"; neither reaches plugins today | change | `features/scripts/script-engine.ts:213-230`, `features/connection/connection-manager.ts:264-274,285-293` |
| Character identity | the web reads a browser global; mobile has the login event's name, remembered only by the autopilot's tracker | change | web `crafting-helper.plugin.ts:973-977`; `features/autoleveling/character-login.ts:15-32` |
| Mobile plugin API | no way for a plugin to publish status to the screen | change | `features/scripts/script-types.ts:163-183`, `features/scripts/plugin-host.ts:114-150` |
| Plugin settings screen | renders the crafting settings (16 fields, two of them long tables) | change or none | `components/scripts/PluginCard.tsx:96-127` |
| Play screen layout | hosts the docked, floating and text forms and the edge dock | change | `components/PlayContainer.tsx:231-239,262-340` |
| Autopilot control | gains whatever the shared modes require | change | `components/autoleveling/AutopilotPlayControl.tsx` |
| Equipment display | gains floating and text forms | change | `components/hud/EquipmentHotbar.tsx` |
| Display preferences | stored choices and migration of existing ones | change | `features/autoleveling/autopilot-display-settings.ts:9-15`, `features/hud/hud-types.ts:64-98` |
| Settings screen | where the player picks modes and the dock side | change | `app/(tabs)/settings.tsx`, `components/autoleveling/AutopilotSettingsCard.tsx` |
| Edge dock | new navigation element on the play screen | new | none exists (`app/(tabs)/_layout.tsx` is the bottom tab bar) |
| Docs and folder indexes (mobile) | feature docs and `.ai-context` / `.annotated` | change | `docs/features/autopilot.md`, `docs/features/scripts-plugins.md` |
| Web game client | source of the port; its disconnect behaviour is now in scope (see "Added after scoping") | change | `apps/game-client/src/hooks/useGameConnection.ts:165-250` |

## Stakeholders

- **Mobile players:** new crafting automation; the play screen of autopilot and equipment users changes, including
  players who never craft. Existing saved display choices must keep meaning the same thing.
- **Owner:** reviews the tech plan before code, tests on a device, decides the open questions below.
- **Web players:** unaffected unless crafting behaviour is changed in both places.
- **The game server and other players:** the plugin sends commands automatically; its safety stops have to work on
  mobile as they do on the web.
- **Documentation readers:** developers (mobile `docs/features/`) and players (in-game `crh help`; the web also has a
  Crafting Helper section in `components/ScriptingHelpModal.tsx`; no end-user help for mobile plugins was looked for).

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Character name | Personal | Read from game login data; used in on-device storage keys | New use on mobile; stays on the device |
| Order queue, order history, craft skill levels | Personal (tied to a character) | Read, write, store on device | New on mobile; separate from the web's browser storage |
| Game output lines (the plugin reads every line) | Personal (gameplay) | Read only | Not stored by the plugin |
| Game commands (get, put, craft, lore, score) | Internal | Send to the game; logged to the app console only with the `debug` setting on | New automated sending on mobile |
| Equipment names | Personal (gameplay) | Read (already captured) | Shown in more places; no new storage expected |
| Display mode, dock side, floating positions | Internal | Read, write, store on device | New settings |

## Inputs for sizing

Not sized: that is for a human.

- Repos changed: 1 (`shatteredarchive-mobile`). `ShatteredArchive` holds only this item's documents.
- Web source to port: 2,475 lines (plugin) and 425 lines (storage), `wc -l`.
- Web tests for it: 243 `it(` / `test(` lines across 4 files (19 + 27 + 44 + 153, `grep -c`), plus a 150-line test harness.
- Existing mobile plugins: 18 (`ls features/scripts/plugins/*.plugin.ts`).
- Mobile files that mention autopilot display, floating vitals, equipment or hidden-navigation settings: 16
  (`grep AutopilotDisplay|vitalsFloating|settings.equipment|equipment:|hideNavigationBar`, tests included).
- Existing tests in the touched areas: `PlayContainer-test`, `FloatingVitals-test`, `FloatingSpeechStop-test`,
  `PluginCard-test`, `play-control-test`, `settings-card-test`, `plugin-host-test`, `hud-settings-defaults-test`,
  `floating-vitals-storage-test`, `floating-stop-geometry-test`, `equipment-capture-test`. No test of
  `EquipmentHotbar` itself was seen in the folders listed.
- Features getting display modes: 3. New screen elements: the edge dock, crafting's three forms, equipment's two new forms.
- New events delivered to plugins: 2.
- Deploy artifacts, servers, endpoints, migrations, secrets: none found. A stored-settings migration on the device is
  possible if the autopilot's four mode values change.

## Dependencies and order

- The crafting plugin's safety stops depend on the two missing events, so those come before the engine can be run live.
- Crafting's display forms depend on a way for a plugin to publish status.
- The edge dock and the shared display modes can be built without the crafting port, and the port can be built without
  them (terminal output only).
- `.ai-plans/active/2026-09-12_autoleveling-mobile-port` and `2026-11-18_autopilot-live-test-findings` touch the same
  autopilot control; the first awaits sign-off.
- Character login data arrives over GMCP, which is a connection option (`components/PlayContainer.tsx:146-148`).
- Live testing needs the emulator against the local dev stack (`docs/claude/emulator-testing.md`). Crafting needs a game
  server that accepts the craft commands; what the local stack offers for that was not checked.

## Risks and unknowns

- **Safety stops.** A straight copy would compile and never abandon a run on disconnect or character switch, because
  the events it listens for are never delivered.
- **Saved orders.** With asynchronous storage, a command typed before loading finishes could overwrite the saved queue.
  Losing the queue loses progress that cost crafting materials.
- **Unknown character.** If the login event was never received (GMCP off, plugin enabled after login in a way not
  covered), orders would be filed under a placeholder name. Whether login data is re-sent after a reconnect is unknown.
- **Background running.** The plugin runs on timers. Whether they fire while the app is in the background, with and
  without "Stay connected in the background", was not verified.
- **Screen space.** An edge rail takes width from the terminal in portrait, changing the wrap column count. In landscape
  it competes with the compass, which can itself sit left or right.
- **System gestures.** Android's back gesture starts at the left and right edges, so a swipe-to-open dock would collide
  with it. Safe-area insets and display cutouts apply to both edges.
- **Overlap.** Several floating panels (vitals, speech stop, crafting, autopilot, equipment) can cover each other or the
  terminal.
- **Recipes in two places.** After the port the recipe tables exist in both clients with nothing keeping them in step.
- **Game text.** The web matchers were verified against desktop log text; that the mobile line pipeline hands plugins
  identical lines was not verified.
- **Higher class.** Crafting data tied to a character name is newly stored on mobile.

## Out of scope

- Removing or changing the web Crafting Helper.
- Display modes or docks in the web client.
- Syncing orders or history between web and mobile, or to a server.
- New recipes or crafting behaviour the web version lacks.
- iOS-specific testing (the code is shared; Android is where it can be tested here).

## Decisions (answered by the user, 2026-11-26)

1. **The third display mode is "minimal", not literally text-only.** In the user's words: "Buttons only when they fit,
   text when it needs to display information. The minimal version is effectively 'The minimal information required to
   convey the required meaning'". So the three modes are docked, floating and minimal, and each feature decides what its
   minimum is.
2. **The docks hold all show/hide controls:** autopilot, crafting, equipment, vitals, affects, compass and connection.
3. **Two docks,** left and right; each feature is assigned to a side. A side with nothing assigned takes no space.
4. **One work item.** "Utilization of the docks at all can be a settings option": the player can turn the docks off.

Consequence of decision 4: the existing status-bar buttons and compass toggle have to keep working when the docks are
off, so both layouts exist and are tested.

### Found while planning (2026-11-26)

- Plugin **settings and on/off state** already sync between web and mobile by plugin id
  (`features/scripts/plugin-records.ts:14-26`), so the port shares the web's Crafting Helper settings. Orders and
  history still do not sync.
- The user added a requirement: runs and timers keep going regardless of the screen while connected; see
  `tech-plan.md`, decision D6. It adds `pause` / `resume` commands on mobile, the one behaviour the web lacks.

## Added after scoping (2026-11-26)

The user added two things after this scope was written. The sections above describe the item before them.

**1. Timers across a dropped connection, web and mobile.** "We should skip or pause timers when the connection drops."

| Client | Keeps going after a drop today | Already handled | Evidence |
|---|---|---|---|
| Web | script timers, bundled plugin timers, delayed commands, autopilot run, respell and quest bot delays, auto-group lookups | tick clock, crafting, tick warning, level progress | `features/userScripts/runtimeSingleton.ts:380-390`, `userScriptRuntime.ts:501`, `features/plugins/pluginScriptRunner.ts:100`, `features/autoleveling/autoleveling-engine.ts:1099` (no close listener) |
| Mobile | script timers, delayed commands, respell and quest bot delays | autopilot stops the run | `features/scripts/script-runtime.ts:179,366`, `features/autoleveling/autoleveling-engine.ts:1236` |

Related defects found on the way: the web ignores which socket an event came from (a late close can mark a new connection down), and
the autopilot hook and the script sandbox hook register the same listener keys, so one replaces the other.

Answers: timers restart after the character logs in again; waiting one-off commands are cancelled; fix both clients.

**2. Compass and input bar placement, and a layout reset (mobile).** The compass can be docked or floated, the input bar sits at the top,
bottom or is hidden, and a setting restores defaults. Areas: `components/PlayContainer.tsx`, `components/Compass.tsx`,
`components/AnsiViewer.tsx`, `features/hud/hud-types.ts`, the Settings screen.

Answers: compass docks top or bottom in portrait and left or right in landscape; with the input hidden and docks off a small floating
button stays ("tap expands/shows, hold toggles selector to show/hide"), and once it is hidden Settings brings it back; reset restores the
screen layout only.
