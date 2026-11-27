# Scope: Simulacrum Admin - a local-only, simulacrum-only admin and debugging panel in the game client

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ a565d53 (working tree not clean: the Copilot client files are untracked or modified, and were read as they are on disk) · Date: 2026-11-07
Data classification of this work: personal (at run time; nothing personal is committed) (rules: docs/standards/data-classification.md, DRAFT: owner to confirm)

## What the work is

A new "Simulacrum Admin" window in the web game client, beside the Copilot window. It has several tabs, can be moved and resized, and
leaves the command input usable. It exists only in the owner's local install and shows only while the client is connected to the
simulacrum (merc-mud) service. Named tabs: a raw GMCP debug view, and player management (pick a target, pick an immortal command from
a visible list, add optional arguments), with a teleport destination picker filterable by area and vnum. The owner wants every
administrative command reviewed and given UI support so that no raw log reading is needed.

## Affected areas

| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| `apps/game-client` (new feature folder, new window component, styles) | The panel, its tabs, its state | new | `apps/game-client/src/features/copilot/` and `components/CopilotWindow.tsx` are the sibling pattern |
| `apps/game-client` menu and page wiring | A menu entry and a lazily rendered window, shown only when both gates pass | change | `MainMenuBar.tsx`, `MainContainer.tsx`, and their `*.copilot.test.tsx` files show how Copilot did it |
| Build-time local-only gate | Keeps the panel's code out of any production bundle | change or new | `apps/game-client/vite.config.ts:44` defines `__COPILOT_LOCAL__` from the process environment only; `apps/game-client/src/copilot-local.d.ts`; `deploy/game-client.Dockerfile` (build ARG); `deploy/docker-compose.shattered-archive-experimental.yml` (passes it); `scripts/check-local-only.mjs` (proves a production dist is clean) |
| Run-time simulacrum gate | Decides "connected to simulacrum" | new | The client has no notion of simulacrum today: `grep -ic simulacrum` over `apps/game-client/src` finds 0 matches. Connection state is a host and port (`hooks/useConnectModal.ts:17-19,40-41`); the proxy allowlist names the simulacrum relay as `simulacrum-server.shatteredarchive.dev:65001` (`deploy/docker-compose.yml:173`) |
| Raw GMCP source | Feed for the GMCP debug tab | change (new listener) | The socket layer re-dispatches each GMCP message as the event `game:remote-server:gmcp` (`hooks/useGameConnection.ts:84-86`); `features/gmcp/gmcpRouter.ts:23-30` maps 6 package names and ignores the rest |
| Command sending | Every panel-issued command | change (new caller) | Outbound bridge for the event `shatteredarchive:send-command` (`hooks/useGameConnection.ts:166`); Copilot funnels its sends through one gate, `features/copilot/gate.ts` |
| Floating window behaviour | Move, resize, clamp, persist | reuse | `hooks/useFloatingPanel.ts` (test: `useFloatingPanel.test.tsx`); the window shell precedent is `components/CopilotWindow.tsx` |
| Tabbed UI design reference | "Similar to auto level's wizard, more free-form navigation" | reference | `components/AutoLevelingWizard.tsx` plus 7 files in `components/wizard/` (`AreaStep`, `CombatStep`, `RestStep`, `ReviewStep`, `TargetsStep`, `WeightStep`, `FilterableSelect`); `FilterableSelect.tsx` is a candidate for the filterable pickers |
| merc-mud (sibling repo `C:\Projects\merc-mud`) | The commands the panel runs and the GMCP it receives | read only unless a Decision says otherwise | `2.4/src/interp.c:286-360` (immortal block), `:82,89,102` (`at`, `goto`, `sockets` sit earlier in the table), `:425-429` (a command runs only if the character's trust meets its level) |
| Area and vnum data for the teleport picker | Source of area names, room vnums | new data path | Unknown which source: 54 `.are` files plus `area.lst` under `merc-mud/2.4/area/`; the parser in `services/merc-area/src/parse.ts`; the area endpoints `apps/mud-builder-server/src/routes/areas.ts:85-172` (behind MUD Builder's roles); the in-game `areas` command (`merc-mud/2.4/src/db.c:2866`) |
| `apps/simulacrum-server` | The gated relay the client reaches | read only | `src/relay.ts` prompts for a trusted-tier access code and relays TCP to merc-mud; whether it alters or filters GMCP bytes was not checked |
| Documentation | Developer and user docs | new | `docs/copilot/` (19 doc files across the Copilot, MUD Builder and game folders were counted) is the precedent; `docs/game/` has 9 files; no `docs/simulacrum/` folder exists |
| Deploy surface | Only the existing local gate | config | Nothing new is expected beyond the gate constant, but see Decision 1 |

## Stakeholders

- **The owner**: sole user, administrator of the simulacrum instance, and the person who confirms the gate behaves.
- **The Copilot work (other window)**: shares the local-only mechanism, the window shell, the menu bar and `MainContainer`; both items edit the same files.
- **Players and production users**: affected only if the gate fails. The production bundle, images and menu must contain nothing of this panel.
- **Simulacrum users other than the owner**: commands run against real sessions on a shared sandbox (trusted-tier users are admitted through the relay), so they can see the effect of admin actions.
- **Ops and deploy**: `check:local-only` and the Dockerfile and compose switch.
- **Docs**: developer docs, plus an end-user guide whose only audience is the owner.

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Raw GMCP messages (character stats, room data, affects, the character's own identifiers) | Personal | Read, display; possibly store a rolling buffer | New display and buffer; whether the buffer persists or can be exported is undecided (Unknown 6) |
| Target character names typed or picked in player management | Personal | Send (as part of immortal commands), possibly remember recent targets | New; remembering targets would store Personal data in the browser, which is a change to flag |
| Output of commands such as `snoop`, `mwhere`, `stat` | Personal | Read, display | New display of other players' state or private output |
| Immortal command text and arguments | Internal | Send | New sender; includes commands that act on bans and connections, which can involve network identifiers |
| Area, room and vnum lists | Public or Internal (simulacrum-only content) | Read, cache | New read path |
| Panel geometry, selected tab | Internal | Store (localStorage) | Same pattern as the Copilot window |
| The simulacrum access code | Restricted | Not touched | The panel must not read, show or log it; the owner enters it at the relay prompt today |

## Inputs for sizing

Counted facts. Not sized: that is for a human.

- Live rows in the merc-mud command table: 250 (`grep` of `interp.c` for live `{ "name", do_...` rows).
- Rows above mortal level: 72. By level: IM 18, L4 12, L5 10, L1 10, ML 5, L6 4, L3 4, L2 4, L8 3, L7 2. The "Immortal commands" block at `interp.c:286-360` holds 67 of them; the other rows (such as `at`, `goto`, `sockets`) sit earlier in the table.
- Wrapper commands that fan out to sub-handlers: `stat` (3: room, object, mob), `vnum` (3: object, mob, skill), `load` (2), `set` (4: mob, skill, object, room). The `vnum` command finds objects, mobs and skills; no room-vnum lister exists among the live commands.
- GMCP: the server's literal `gmcp_send` call sites name 6 packages (`char_data`, `room_data`, `tick`, `affect_data`, `add_affect`, `remove_affect`); the client router maps the same 6. Packages built through `gmcp_compose.c` were not enumerated. The immortal `admin test gmcp <login|char|room|tick|affects> [all|<player>]` (`act_wiz.c:4303`) and `gmcp [on|off]` (`act_wiz.c:4356`) commands exist for GMCP testing.
- Data sources for the teleport picker: 54 `.are` files and 1 `area.lst`; 3 candidate paths (file parser, MUD Builder endpoints, in-game commands).
- Client files that already reference the local-only constant: 13 source or test files under `apps/game-client/src` (18 counting `.annotated` and `.ai-context` index files; 28 files repo-wide, including docs and scripts).
- Files in the client that mention "simulacrum": 0.
- Existing tests in the reusable pieces: `useFloatingPanel.test.tsx`, `FilterableSelect.test.tsx`, `CopilotWindow.test.tsx`, `MainMenuBar.copilot.test.tsx`, `MainContainer.copilot.test.tsx`, `main.copilot.test.tsx`.
- Sibling repos touched: 1 read (merc-mud) with 0 edits asked for; 0 other repos.
- Unknowns: 8 (below).

## Dependencies and order

- The Copilot window shell, `useFloatingPanel`, the menu entry and the local-only guards already exist on disk but are uncommitted work in another window. This item builds beside them and edits the same menu and page files, so the two items need an agreed order or merge point.
- A reachable simulacrum instance and a character with enough trust to run the commands, for any live check. Trust is checked per command (`interp.c:425-429`), so a panel can list commands the connected character cannot run.
- Copilot's plan states "Editing merc-mud directly" is out of its scope and routes such needs to `/propose-work`. If this item needs mud-side data (for example room lists), that is a separate decision (Decision 3).

## Risks and unknowns

1. **A gate failure ships admin tooling to production.** The existing guard proves a marker string is absent from a production dist for Copilot's marker. A new constant or marker is not covered until the guard is extended (see Decision 1).
2. **Destructive commands in the list.** The 72 privileged rows include `shutdown`, `reboot`, `copyover`, `purge`, `deny`, `ban`, `permban`, `disconnect`, `advance`, `trust`, `force`, `slay`, `freeze` and `dump`. A browsable command list makes a mis-click one step from a world-wide effect (Decision 4).
3. **How "connected to simulacrum" is decided is not defined.** The client knows only a host and port. A user can save any host and port, so a name or port match is a convention, not a proof (Decision 2).
4. **Per-command syntax is not catalogued.** Only the table rows were read; argument shapes for the 72 commands need reading per handler before UI can be specified. Several commands have sub-forms (`set`, `stat`, `load`, `vnum`).
5. **The room list for teleport has no confirmed source** (Decision 3). A source from files reflects boot data and can drift from the live world (`services/merc-area/src/live-state.ts` already exists to diff boot against live state).
6. **GMCP buffering and export are undefined.** A rolling buffer in memory is a different privacy position from a downloadable capture or a persisted one.
7. **Whether the relay changes GMCP traffic** was not checked in `apps/simulacrum-server/src/relay.ts`.
8. **The macro `L1`..`L8` in `interp.h:35-42` is unparenthesised** (`MAX_LEVEL - 1`). Any UI that reads levels from the table should not rely on the macros being evaluated in expressions. Noted because a level filter in the panel would be built from these values.

## Out of scope

- Any production deployment, and any change to a production compose file other than a guard that reads it.
- Changes to merc-mud, unless Decision 3 selects that route.
- Changes to the Copilot window or its server.
- A mobile or web-site version of the panel.
- Granting or changing who may reach simulacrum (the relay's access-code and role rules stay as they are).
- Anything for the live DSL game.

## Decisions for the human

Answers recorded below.

1. **Which switch keeps this out of production?**
   - Reuse `__COPILOT_LOCAL__`: one local-only mechanism and its guards already exist; the panel is available whenever Copilot is, and the two cannot be enabled separately.
   - A separate constant: the panel can be enabled without Copilot; the constant, its declaration, the Dockerfile ARG, the compose line and the guard script and its tests each need a counterpart.
2. **How does the client decide it is connected to simulacrum?**
   - Match the connection's host and port to the simulacrum relay (client-side only; spoofable by a saved connection, which is acceptable for a local-only tool).
   - Have the server announce itself (for example in its login data): a firm signal, but a merc-mud change, outside this repo.
3. **Where do the area and vnum lists for teleport come from?**
   - Parse the `.are` files / use MUD Builder's area endpoints: complete and filterable, but boot-time data and a new dependency on file or service access.
   - Ask the live MUD through commands and parse the text: always current, but depends on what the commands print and on the connected character's trust; no room-vnum lister exists today.
4. **How are destructive commands handled?**
   - List them all, with a confirmation step for a marked set.
   - List all and send directly, as typed commands would.
   - Leave the marked set out of the panel and keep them as typed commands.

### Answers

Recorded 2026-11-07.

1. **Separate new constant.** The panel gets its own build-time switch, independent of `__COPILOT_LOCAL__`. Consequence: its declaration, the
   Dockerfile ARG, the experimental compose line, and the `check-local-only` guard and its tests each need a counterpart, and the guard needs
   a bundle marker for this panel.
2. **Match host and port, against two addresses:** the simulacrum hostname and the owner's LAN address (written here as `<owner-lan-ip>`,
   because an IP address is Personal under `docs/standards/data-classification.md` and must not be committed in this folder). Consequences:
   - The accepted host/port pairs are configuration for the local build; whether they may be literals in source is a question for
     `/tech-plan` (a literal LAN address in committed code would put an IP in a public PR).
   - The owner gave the hostname `simulacrum.shatteredarchive.dev`. The repo shows two names: that one is the web UI vhost
     (`deploy/docker-compose.yml:103`), and the game relay in the proxy allowlist is `simulacrum-server.shatteredarchive.dev:65001`
     (`deploy/docker-compose.yml:173`; relay port per `docs/ports.md:33`). Which hostname and port the client really connects with for the
     hostname case and for the LAN address is not confirmed (new Unknown 9).
3. **Area files / MUD Builder.** The teleport picker reads boot-time area and room data from the `.are` files via the parser or MUD Builder's
   area endpoints. Consequence: it can disagree with the live world after edits not yet loaded, and it needs access to the files or to MUD
   Builder (which sits behind its own roles).
4. **List all, confirm a marked set.** Every privileged command is browsable; the marked destructive set needs an explicit confirmation step
   before it is sent. Which commands are in the marked set is for `/tech-plan` to propose and the owner to approve (the named examples:
   `shutdown`, `copyover`, `purge`, `ban`, `deny`, `force`).

### Added Unknown

9. The exact host and port pairs the client uses when connected to simulacrum (by hostname and by LAN address), and where the accepted list is
   configured. See Answer 2.
