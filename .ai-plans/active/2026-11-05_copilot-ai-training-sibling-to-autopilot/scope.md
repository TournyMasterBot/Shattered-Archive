# Scope: Copilot - a local-only AI training companion beside Autopilot that learns to navigate the MUD

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ a565d53 · Date: 2026-11-05
Data classification of this work: personal (it reads gameplay logs; rules: docs/standards/data-classification.md, DRAFT - owner has not confirmed it yet)

## What the work is

A new "Copilot" feature, local-only, that sits beside Autopilot in the game client as a distinct sibling: own nav entry, own modal,
own state, not merged with Autopilot. Autopilot is autonomous scripting toward a goal with a predefined step list; Copilot is
reactive to the game world through the AI agent and does not follow fixed steps. The two connect in both directions: Copilot can
invoke Autopilot, and Autopilot should be able to leverage Copilot. An AI agent reads the live game logs while a user
session is running. Through a client-side piece (the item calls it a userscript) it proposes commands, which the user approves or
replaces with a recommendation of their own; the agent learns from that feedback. It has four modes (battle support, exploration,
questing, leveling), toggleable auto behaviour (combat is the example given), a movable and resizable modal that leaves the chat input
usable, and a "Copilot" nav entry. Its purpose is to train the agent: learn the rules, maintain rule documentation, and improve the
MCP/Expert documentation.

Added by the requester after the first scope: the log stream is large, so it must be watched economically (a cheaper model, the local
model summarizing and escalating, or something else); there must be a fully local mode that works with no Claude; and Claude
(Sonnet) is required as auditor and reviewer of the local agent. The path leans on Claude heavily at first and less and less as the
MCPs, skills, prompts and data improve, and every session that needs Claude must end in an actionable training opportunity so that
scenario no longer needs Claude.

Also added by the requester: the training is organised by domain knowledge spheres: the world (rooms inside areas, areas split into
sub-areas, for example the town, clockworks and factory in Gahboom), fighting (what the creature is, how it compares with the
character, what the character's abilities can do), room interaction, and things (items on mobs, in rooms, and objects). The aim is to
refine the existing experts where they are incomplete for a specific thing. Knowledge is partly shared and partly specific to a user,
class, race or other trait; drawing that line is part of the work.

Also added by the requester: spheres must name their neighbours (spheres that may hold overlapping information), and when a request
is misrouted the sphere must help the AI agent get back on track to the correct location.

Also added by the requester: maps are a desired output. MUD Builder and DSL Mapper are earlier map and world-building efforts, and
simpler hex/grid maps like those of Mudlet, MUSHclient, zMUD and CMud are also wanted. When a high-confidence link between two rooms
is established, the room gets an internal identifier, and the identified rooms build into a file that can draw the world. The zoom
levels are room, subzone, area and continent. A subzone can be consistent in its own directions, maze-like, or have teleports and
loopbacks; subzones and areas have definitive links to each other; areas sit in relative geo-space, and extra paths or teleports are
shown as conceptual "off page links" rather than hard links. Stock ROM and merc-mud are hints, never truth, because DSL has evolved
for decades. MUD Builder and DSL Mapper are to evolve with the experts and MCP. merc-mud is touched only through MUD Builder, and
server-side code there is never written automatically: a needed feature goes through `/propose-work` first.

Explicit callouts from the requester, used as named in this scope: DslMapper `C:\Projects\DslMapper`; mud-builder-server
`C:\Projects\ShatteredArchive\apps\mud-builder-server`; mud-builder-client `C:\Projects\ShatteredArchive\apps\mud-builder-client`;
simulacrum-server `C:\Projects\ShatteredArchive\apps\simulacrum-server`; merc-mud (simulacrum) `C:\Projects\merc-mud`.

Also added by the requester: the world map is to be shown in the web game client, the mobile client and the C# world map (beta, free
to rework entirely); rooms use internal identifiers with an optional vnum setting reserved for the day DSL sends vnums in the
`room_data` GMCP event (it does not now); a community-built CMud map database of many rooms should be mined and used to cross-check
the new data; and the whole effort works with incomplete information, so it needs domain knowledge of what is known and access
patterns that reason about, and bridge, the gaps.

Answered by the requester after the first review:
- The community database is Azah's CMud map. Data that comes purely from Azah can be credited to Azah, who shares it publicly and
  freely allows community use; the requester has Azah's express permission for this use. (Credit by handle only; the database's own
  per-row user ids and edit history stay out of committed data.)
- `RefNum` is a CMud reference id, not a game vnum. It can be tracked to map rows back to the database. No external party has vnums;
  that changes only if the game owner updates the GMCP records.
- The `.dbm` file is git-ignored because of its size, not because it is sensitive. Once parsed out, the data is fine to commit.
- The zip is a JSON export of the same map (see the Affected areas row). It may or may not be useful.
- How CMud models sub-zones and areas is not known to the requester; rules have to be established while the data is processed.
- The game has changed since the database was made: the newest record wins.
- Order: the game-client (web, mobile) world maps are close to the last work, after everything else is solidly working and the C#
  implementation is updated and signed off.
- One map, many readers: the game clients should render from JSON (or another streamed format) delivered by C# APIs, so corrections
  show everywhere at once. Caching is an ongoing concern, trending towards service redeploys; a restart-time endpoint (the health
  check) can be a cheap proxy check with a shorter cache than the map service's longer one.

## Affected areas

| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| `apps/game-client` menu bar | The "Copilot" nav entry. The existing Autopilot entry is the menu item "Autopilot…" and calls `onOpenAutoLeveling` | change | `src/components/MainMenuBar.tsx:177`, props at `:17`, `:31` |
| `apps/game-client` MiscPane | A second "Autopilot" nav location exists: a section type, a stub component and a nav button | change (if mirrored) | `src/hooks/useMiscPane.ts:4`, `src/components/MiscPane.tsx:68`, `:173`, `:211` |
| `apps/game-client` MainContainer | Owns modal open-state and renders each modal; Autopilot is rendered here as `AutoLevelingWizard` | change | `src/pages/MainContainer.tsx:170`, `:183`, `:356-377` |
| `apps/game-client` Copilot modal (UI) | New. The Autopilot wizard is the nearest precedent: `position: fixed`, `zIndex: 5000`, header drag, no backdrop element, but marked `aria-modal="true"` and fixed width | new | `src/components/AutoLevelingWizard.tsx:196-205` (drag), `:289-297` (render) |
| `apps/game-client` resize | No resize exists in the Autopilot wizard (no match for "resiz" in it). `UserScriptSandboxModal` has desktop resize limits, and the text-to-speech plugin has pointer-event drag | new or reuse | `src/components/UserScriptSandboxModal.tsx:38-42`, `src/features/plugins/core-plugins/text-to-speech.plugin.ts:311-322` |
| `apps/game-client` chat input | Must stay usable behind the modal. `CommandInput` owns its own input ref and key handler | check | `src/components/CommandInput.tsx:18`, `:93`, `:106` |
| `apps/game-client` outbound commands | Autopilot sends through a `shatteredarchive:send-command` event, and user scripts through their runtime. Copilot would need one of these paths | reuse | `src/hooks/useAutoLeveling.ts:190`; 24 occurrences in 15 non-test files |
| `apps/game-client` game text in | `shatteredarchive:raw-data` / GMCP events are re-emitted for scripts and the Autopilot engine | reuse | `src/features/userScripts/runtimeSingleton.ts:11-18`, `docs/context.md:53-55` |
| `apps/game-client` user-script runtime | The "userscript" half. Triggers, aliases and timers run in the runtime, with `sendCommand`, `writeTerminal` and (documented as "if available") `httpGetJson` | reuse | `docs/scripting/scripting-summary.md:38`, `:54`, `:64`; `src/features/userScripts/userScriptRuntime.ts` (66 matches of the API names) |
| `apps/game-client` plugin host | A possible home for a feature that watches game text and has config. 22 core plugins exist (`*.plugin.ts`), among them `questbot.plugin.ts` | reuse or none | `src/features/plugins/core-plugins/`, `docs/game/questbot.md` |
| `apps/game-client` Autopilot engine | Autopilot's engine is a script-driven round loop. It stays its own feature. Copilot needs a way to invoke it (the engine is already driven by start/pause/resume/stop/moveNext/movePrev events, `useAutoLeveling.ts:319-363`), and Autopilot needs a way to ask Copilot for help; neither exists today | change (an integration surface on each side) | `src/features/autoleveling/autoleveling-engine.ts` (2471 lines), `src/hooks/useAutoLeveling.ts` |
| `apps/game-client` local-only switch | No runtime gate for "local only" exists. `VITE_ENV` is set by `.env` and the compose files and typed in `env.d.ts`, but no file in `src/` reads it. Only `import.meta.env.DEV` is read, in `siteApi.ts` | new | `apps/game-client/.env:9`, `src/env.d.ts:8`, `src/features/auth/siteApi.ts:20-29`, `deploy/docker-compose.yml:131`, `:148` |
| `apps/game-server` + `services/services-server` logs | The logs the agent would tail. `game:remote-server:raw` and `game:client:input` are written to `server.log.jsonl`; both are SOH-gated. In the experimental compose the log folder is bind-mounted to a host path | config | `apps/game-server/src/index.ts:18`, `:25-26`, `:276-280`; `services/services-server/src/logger-service.ts:143-170`; `deploy/docker-compose.shattered-archive-experimental.yml:181-193` |
| Agent-to-client bridge | Not found in this repo. The client has no code that talks to an AI service; a search for `ollama|api/agent|mcp` in non-test source matched 10 files (first 10 shown, so the count may be higher); I did not open them all, but none of those I saw were an agent bridge, and none are named as one by the annotations | new | grep over `apps/game-client/src` |
| Log-stream reduction (new) | Something between the raw stream and any model: filtering, summarizing and batching so the agent sees a small fraction of the lines. Volume is large: the game-server log folder holds 2.4 GB in 362 jsonl files, and recent daily files range from about 0.3 MB to 6.5 MB. Nothing in this repo reduces the stream today | new | `C:/Projects/DSL/GameLogs/ShatteredArchive/Docker/game-server/` (`du -sh`, `find -name "*.jsonl"`); the earlier hint work in `docs/userscripts/room-hints/` read these files whole |
| Tiered model routing (new) | Which model handles which job: a local watcher/summarizer, a local agent that decides, and Claude as auditor or escalation target. A fully local path must exist that never calls Claude | new | no routing code found; model hosting lives in `Shattered-AI` (`mcp-ollama/`, `qwen-cli/`, `models.config.json`) |
| Claude audit and training loop (new) | Records each Claude-needed event and its resulting training artifact (an MCP/expert fix, a skill or prompt change, new data), and measures how often Claude is still needed per scenario | new | `Shattered-AI/tools/model-bench`, `tools/gate-eval`, `.ai-experts/` hold comparable harnesses; none records this |
| Knowledge spheres versus existing experts (Shattered-AI) | The `.ai-experts` folder holds 45 entries. Experts that map to the named spheres: world `rooms`, `areas`, `directions`, `orientation`, `autoleveling`; fighting `bestiary`, `combat-math`, `abilities`, `classes`, `races`, `merits`; things `items`, `gear-search`, `equipment-slots`, `enchanting`; interaction has no expert of its own (room-interaction hints live in this session's `room-hints` scripts and the DSL local service, which are not an MCP expert). Whether each is complete enough for a given thing is the open question | change | `C:/Projects/Shattered-AI/.ai-experts/` (`ls`), `tools/archive-mcp/experts/*.json` |
| Neighbour and misroute mechanism (exists, expert-level) | Every expert definition already carries `notAFit` (44 of the 46 JSON files in `experts/`), `confusableWith` (22 files, 52 entries, each with a `check`) and `handoffs` (9 files, 11 entries). The 46 files are one more than the page count in `.ai-experts`, so a file or two may not be a full expert; I did not check which. A route log classifies each question as answered, noMatch, recovered (the asked expert found nothing but a declared neighbour did), or unrouted, and summarizes recoveries and dead ends. So the building blocks for "neighbours" and "get back on track" exist at the expert level. They are not organised by sphere, and the agent playing the game (as against a question put to the MCP) does not use them | change | `C:/Projects/Shattered-AI/tools/archive-mcp/experts/*.json` (counted by script), `src/routelog.mjs:1-8`, `:46-75`, `src/server.mjs:85-88` |
| Neighbour links are uneven | Examples from the definitions: `rooms` lists only `bestiary` as confusable, while `areas` lists `rooms`, `bestiary`, `directions` and `autoleveling`; `directions` lists only `areas`; `rooms` has no handoffs. `combat-math` and `orientation` list none. So the link from a room question to areas or directions is declared on one side only | change | `tools/archive-mcp/experts/rooms.json`, `areas.json`, `directions.json` |
| Where a misroute is visible to the Copilot | The route log records questions put to the MCP. A wrong turn by the Copilot agent while playing (it consults the wrong sphere, or applies a fact from a neighbour) is not recorded by anything found; it would be a new kind of record | new | none found in `src/` |
| DSL Mapper (sibling repo `C:/Projects/DslMapper`) | A Vite/React map app (`game-mapping/`) with hex and octagon renderers, SVG export and an ASCII renderer, and a seed map document. The seed `mapdoc.json` has 176 rooms (fields: vnum, label, sector, coords, exits, movement, category) and a `meta.catalog` of worlds and continents with generated ids. Its README says most of the project is AI generated and that it targets Dark and Shattered Lands. It already has world and continent levels in the catalog; subzone and area levels were not looked at | change | `C:/Projects/DslMapper/game-mapping/src/render/` (`HexRenderer.tsx`, `OctRenderer.tsx`, `svgExport.ts`, `ascii.ts`), `seed_data/mapdoc.json`, `README.md` |
| mud-builder-client and mud-builder-server (this repo) | World-building UI over merc-mud's `.are` area files: `mud-builder-client` (dev port 60080), `mud-builder-server` (port 61000, the only writer to disk), `services/merc-area` (parser/emitter for the Merc 2.4 area format, round-trip tested), plus `area_reload.c` and `copyover.c` in merc-mud for hot reload. Its format is the stock Merc one, so DSL-only features have no field in it unless added. It is the one sanctioned way to change merc-mud | change | `docs/mud-builder/README.md:1-20`, `apps/mud-builder-client`, `apps/mud-builder-server`, `services/merc-area/` |
| simulacrum-server (this repo) | The gated way into merc-mud for play: a TCP relay that first asks for a single-use, short-lived access code minted for a trusted-or-higher account, validates it (re-checking the shared role store live) before ever dialing merc-mud, and can send an account/username preamble so a linked character can be created. It shares the Builder's `roles.json` through a bind mount. So a Copilot session that plays merc-mud would enter through this relay, with an access code, not through the DSL game proxy | reuse or change | `apps/simulacrum-server/src/.annotated` (`relay.ts`, `access-codes.ts`, `role-store.ts`, `sso.ts`), `relay.ts:5-18` |
| merc-mud (simulacrum), `C:\Projects\merc-mud` | The private sandbox MUD that simulacrum-server relays to. It holds `2.4/` (area files, source, player files), `custom-commands/`, `docs/agent/`, and a second folder `2.4-builder/` with its own `package.json` and Vite config; I did not open that one, so whether it overlaps with the Builder in this repo is an unknown. Its compose file describes a "long-lived but throwaway demo service" | reuse | `C:/Projects/merc-mud/` (`ls`), `docker-compose.yml:12` |
| merc-mud sandbox (sibling repo, private) | Test ground for training. The requirement is Builder-only interaction; direct code only as server-side support for something the Builder cannot do, never automatic, and any such need is filed as a work item. Nothing in the repo enforces this today (I did not look for a guard) | config / rule | `C:/Projects/merc-mud`; stored project note on DSL versus merc-mud |
| Existing room identity (Archive MCP) | The room graph tells rooms apart by title + sector + exit set, merges two observations whose exit sets nest, and gives each merged room an integer id numbered at build time. Edges come from "typed a direction, then a different room within 3 seconds". These ids are not persistent between builds and there is no confidence level on a link; titles repeat across areas | change | `C:/Projects/Shattered-AI/tools/archive-mcp/src/rooms/graph.mjs:1-12`, `:52`, `:90` |
| Community CMud map database (`C:\Projects\DslScripts\data\db`) | A SQLite file (header confirmed) of about 27.8 MB, with a short `Readme.md` that points to the forum post it came from and gives an example query. Opened read-only: 24,358 rows in `ObjectTbl` (rooms), 77,747 in `ExitTbl`, 396 in `ZoneTbl` (each zone has a `Parent`, so zones nest; none has an empty parent), 5 portals, 10 directions, 9 notes. 24,039 rooms have a description and 9,301 distinct room names, so room names repeat on average about 2.6 times and descriptions are needed to tell rooms apart. 24,321 rooms carry a `RefNum`, which the requester says is a CMud reference id (not a vnum). Its newest room edit is dated 2024-01-05 (the latest `Modified` in `ObjectTbl`); the file is dated 2024-07-27. The same folder holds a second SQLite file, `dsl-world.sqlite3`, which is the existing client's own database: its one table has 0 rows and is unrelated. The `*.dbm` pattern is in `DSL/.gitignore` for size, per the requester | reuse (read) | `C:/Projects/DslScripts/data/db/Readme.md`; table names and counts from a read-only query; `C:/Projects/DSL/.gitignore:233` |
| Zipped JSON export of the community map, `C:\Projects\DslScripts\azah-directions.zip` | One 128 MB file inside (`azah-directions.json`, dated 2024-09-26), shaped as zones, each holding rooms, each holding exits and notes. Parsed in full: 396 zones, 24,317 rooms, 77,721 exits, 9 notes, 0 portals. Compared by room id with the `.dbm`: every JSON room is in the database, and 41 database rooms are missing from the JSON. Its newest room edit is the same date as the database's, so the content is not newer. Each exit carries `DirType`, `DirToType`, `Tested` and `kind`. Whether the missing 41 rooms and the 5 portals matter is not determined | reuse (read) | `C:/Projects/DslScripts/azah-directions.zip` (extracted read-only to the session scratchpad and compared with a Node script) |
| Map-serving API and caching (new, C#) | The requester wants one map served as JSON (or a streamed format) from C# APIs to every reader, with an endpoint reporting when the service last restarted used as a cheap change check and a longer cache on the map itself. Existing facts: the public web project already runs `UseResponseCaching()` (keyed by path only unless told to vary); `Controllers/AgentApiController.cs:125` notes this for a query endpoint. A search of `Server.Web.Public` `*.cs` for "health" or "uptime" found no existing health or restart-time endpoint | new | `Server.Web.Public/Program.cs:248`; `Controllers/AgentApiController.cs:125`; search for "health" (case-insensitive): 0 matches |
| Web game client map surface (new, late) | Placed near the end of the work, after the C# side is signed off. `apps/game-client` has no world-map component (a file search of `src` for "map" found only the Autopilot area-maps client and a damage map, which are unrelated). A map pane would be a new UI surface; the layout shells, the right sidebar and the existing room events are the places it would join | new | `apps/game-client/src/features/autoleveling/autoleveling-maps-client.ts`, `.../combat/damage/damage-map.ts`; `src/components/RightSidebar.tsx`, `LayoutShell.tsx` |
| Mobile client map surface (new, late) | After the web client, per the stored rule and the requester's order. `C:\Projects\shatteredarchive-mobile` (the `dsl-client` app) has no map source file under a name search (hits were build artifacts only). Mobile has its own plans and a rule that a web feature is finished before it is ported | new | `C:/Projects/shatteredarchive-mobile/dsl-client` (name search); stored note: finish web before porting |
| C# world map (beta), `DSL/Server/Server.Web.Public` | `Views/Maps/WorldMap.cshtml` (209 lines) and `wwwroot/js/maps/worldmap.js` (16 lines) exist; `MapsController.cs` (222 lines) serves user maps (create, update, delete) and, per its own comment, sends visitors to the Home/Directions beta view, which is beta-only and about 7 MB of HTML. The requester says it can be completely reworked | change (rework) | `Controllers/MapsController.cs:42-120`, `Views/Maps/WorldMap.cshtml`, `Views/Home/Directions.cshtml`, `wwwroot/js/maps/worldmap.js` |
| Map output formats (new) | Mudlet, MUSHclient, zMUD and CMud map exports: no exporter for any of them was found in the three repos I looked at. A Mudlet importer exists in the game client for Autopilot data (file name only; I did not open it) | new | `apps/game-client/src/features/autoleveling/autoleveling-mudlet-import.ts` |
| Map hierarchy: subzone, area, continent (new) | The levels the requester describes (room, subzone, area, continent; subzone kinds consistent, maze, teleport, loopback; definitive subzone and area links; off-page links) are not modelled together anywhere I found. The creature data has a `SubArea` field and an area flag `IsSubArea`; the Mapper's catalog has worlds and continents | new | `C:/Projects/DSL/Server/Server.Core/Constants.cs:264`, `mapdoc.json` `meta.catalog` |
| Sub-area modelling | The creature data carries a `SubArea` field (a sampled file sets it to `"Unknown"`) and the area flags include `IsSubArea`; 68 Arkania creature files contain `SubArea`. How completely sub-areas are filled for any area (for example Gahboom's town, clockworks, factory) was not measured | change | `C:/Projects/DSL/Server/Server.Dsl/Beastiary/Arkania/BloodshackleFortress/Arkania_BloodshackleFortress_Unknown_anattendant.cs:16`, `C:/Projects/DSL/Server/Server.Core/Constants.cs:264` |
| Scoped (per user/class/race) knowledge store | Some lessons are true for everyone (a room's exits) and some only for one character (what a class can cast, what a race resists, what an account owns). A place that records which is which does not exist yet | new | none found; the Archive's personal data lives in per-connection browser stores (`autoleveling-user-data.ts`, equipment and library docs `docs/game/user-library.md`, `docs/game/user-equipment.md`) |
| `Shattered-AI` (sibling repo) | Home of the MCP (`tools/archive-mcp`, with `src/logs` and `src/rooms`), the experts docs (`.ai-experts/`, 45 entries), qwen CLI, and the model-bench; "maintain rule documentation / improve MCP/Expert documentation" lands here | change | `C:/Projects/Shattered-AI/tools/archive-mcp`, `.ai-experts/README.md`, `.memory/README.md` |
| `DSL` repo local C# agent API (sibling repo) | The hint tooling built earlier this session is a worked example of a userscript calling a local service and a local model. It is not part of this repo | reuse | `docs/userscripts/room-hints/hint.js`, `hint-ai.js` |
| Documentation | Developer doc under `docs/game/`: none about Autopilot or auto-leveling exists (9 files there). auto-leveling is mentioned in `docs/game-client.md` (lines 69, 514, 531, 545), `docs/web-server.md` and two theme/HUD docs, none as a feature guide. No end-user help for Autopilot was found in `docs/` | new | `docs/game/`, `docs/game-client.md` |

| Test characters (prep work, new) | 31 rows, one per public class, on non-limited races, giving 60 characters (the help texts make Felar female only and Wemic male only, so two rows have one gender). They are played on DSL to gather roll data, gameplay experience and exploration experience for the experts, MCP, skills and routing. The roster, with a male and a female name per row, and a written in-game description for each of the 60 are private files in the DSL repo; this plan uses codename plus gender only. Where the per-character records will be kept and in what shape is not decided | new | `C:/Projects/DSL/docs/copilot/test-character-roster.md`, built from `/api/agent/classes` (48 classes, 17 flagged `isCsr`) and `/api/agent/races` (33 races, 9 limited) |

## Stakeholders

- **The owner/developer (requester):** approves each action, supplies the feedback the agent learns from, and owns the training outcome.
- **Players of the local build:** the only users of the feature, because it is local-only. They are also the audience for the end-user help.
- **The AI agent and its tooling (Shattered-AI):** the MCP and Experts it is meant to improve; the maintainers of `.ai-experts` and archive-mcp must accept what it writes.
- **Game-client maintainers:** the menu, `MainContainer`, user-script runtime and Autopilot engine all change or are depended on.
- **Whoever pays for Claude tokens (the owner):** the economics of the stream and of escalation are the central constraint of the added request.
- **Ops/deploy:** the log bind-mount and whatever carries data between the agent and the client (for example a local port).
- **The MUD's operators and community:** the agent plays on the live game, so automated command traffic is visible to them. No rule or policy for this was found in the repo; it is an Unknown.

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Game output in the jsonl logs (room text, chat lines, tells; includes other players' character names) | Personal | Read by the agent | New reader of Personal data; the logs are already stored, but a new consumer is added |
| Player input in the logs (`game:client:input`), which could include anything typed, e.g. login input | Personal, possibly Restricted | Read by the agent | Logged today only while the SOH gate is open; whether credentials can reach the log is not determined. Unknown |
| The user's own character name, level and state | Personal | Read, Send (to the agent) | New transfer to the agent |
| Log excerpts and summaries sent to Claude for audit or escalation | Personal (names, possibly more) | Send (to a hosted service) | Moves Personal data off the machine for the first time in this feature; the standing rule is local models only with no hosted APIs, so this needs the owner's decision and scrubbing before sending |
| Shared domain lessons (rooms, areas, creatures, items, interaction rules) | Public or Internal | Write, Store (into experts/docs) | Safe to commit once scrubbed of player and character names |
| Scoped lessons (skills, spells, songs, race and class definition mechanics) | Public (game mechanics) by the requester's Decision 10 | Read, Write, Store | One store with a scope tag. Private character work (owned items, personal route history, names) is not captured; how that line is held at write time is an Unknown |
| Map data: room identifiers, links, subzones, areas, coordinates | Public or Internal (game-world facts), if the provenance is left out | Write, Store | A new committed or published artifact. The evidence behind a link (which character walked it, when, the typed commands) is Personal and should stay out of the map file |
| Community-built map database (rooms, descriptions, exits, zones) | Public game-world content, a third party's work used with his permission | Read, mined into our own data, parsed data committed | Reuse and credit are settled by the requester (credit by handle, "Azah"). The file's per-row user ids and edit history stay out of committed data. The parsed result may be committed; the large source file stays untracked |
| Test-character names (the roster) | Personal (character names) | Store, in the private DSL repo only | The public plan holds codename plus gender only; the roster file is the sole mapping. Roll data, play logs and route history per test character are Personal and follow the same rule: keyed by codename in anything committed here |
| Map payload served by the C# APIs to clients | Public or Internal (no provenance) | Send (to every client), Cache | New endpoint(s); response size and cache lifetimes undecided |
| `room_data` GMCP event, optional vnum field | Public | Read | Today it carries room name, sector and exits; a vnum would be read only if DSL ever sends one |
| Map files exported for third-party clients | Public or Internal | Write | Leaves the repo as files the user imports elsewhere |
| Training records (what Claude was asked, what it found, what was changed) | Internal; Personal if excerpts are kept | Write, Store | New store; if committed it must hold placeholders only |
| Commands the agent proposes or sends; the user's recommendations and approvals | Internal (Personal if they hold names) | Write, Store, Send | New store of training feedback |
| Learned rules and documentation edits | Public or Internal | Write | New writes into docs or MCP expert files, which are committed. Each must be scrubbed of names |
| Copilot settings (mode, auto toggles, modal position and size) | Internal | Store (local browser storage) | New keys; names not yet chosen |

## Inputs for sizing

Not sized: that is for a human. Counted facts:

- Repos touched: 3 likely (ShatteredArchive; Shattered-AI for the MCP/experts and the agent; possibly DSL for the local service). Depends on Decision 2.
- Menu/nav locations with an Autopilot entry: 2 (`MainMenuBar.tsx`, `MiscPane.tsx`).
- Existing precedents found for a floating panel: 3 (Autopilot wizard drag, sandbox modal resize limits, text-to-speech drag). Existing precedent for a modal that is both draggable and resizable: 0 found.
- Files in `apps/game-client/src` that reference the send-command event: 15 non-test files (`grep -c "shatteredarchive:send-command"`).
- Test files in the Autopilot area: 6 in `features/autoleveling/`, 2 in `components/wizard/`; none for the wizard component itself.
- Developer docs for Autopilot: 0. End-user help for Autopilot: none found.
- Core plugins: 22 `*.plugin.ts` files in `core-plugins/` (a sample of how a game-watching feature is packaged).
- Agent-to-client transport found in this repo: 0.
- Test-character roster (counted from `/api/agent/classes` and `/api/agent/races`, 2026-11-05): 48 classes, of which 17 flagged `isCsr` and excluded, leaving 31 (5 base, 26 reclass); 33 races, of which 9 limited and excluded, leaving 24; 31 rows, every non-limited race at least once (7 twice); 60 characters after the two single-gender races (Felar, Wemic) are applied; 60 written descriptions; 60 narrative personas (all parse with the vendored persona-core parser, none trips `detectTells`). The full public matrix (24 non-limited races, 31 public classes, legal pairs from `availableClasses`) is 601 pairs and 1,157 characters; the 31 roster rows are the first slice, and a name is listed for all 1,157 in the private stub list. Descriptions and personas for the other 570 pairs (1,097 characters) are not written. Including the 9 limited races would add 185 pairs and 370 characters (not included). Names were checked against 10,947 data files (2.66 GB); 117 candidates already appear there and were dropped. All 62 candidate names returned 0 hits in 727 log files (2.47 GB); a control search on one file found its test words, so the scan works.
- Unknowns listed below: 38, of which 1 is answered by the requester (28) and 1 partly (30). Decisions for the human: 18, all answered (see "Answers recorded"), 1 deferred to the tech plan (5).
- Community map database counts (read-only query): 24,358 rooms, 77,747 exits, 396 zones, 5 portals, 9 notes; 24,039 rooms with a description; 9,301 distinct room names.
- Zipped JSON export counts (full parse): 396 zones, 24,317 rooms, 77,721 exits, 9 notes, 0 portals; 41 database rooms absent from it, 0 the other way.
- Health or restart-time endpoints found in `Server.Web.Public`: 0.
- Map surfaces named: 3 (web client, mobile client, C# world map); map components found in the web client: 0, in mobile: 0.
- Repos touched has grown: ShatteredArchive (client, MUD Builder), Shattered-AI (MCP, experts), DslMapper, merc-mud (via the Builder only), and DSL (local C# service, area/creature data): 5.
- Rooms in the Mapper's seed map document: 176. Map exporters for third-party clients found: 0.
- Experts that map to the named spheres: 15 of the 45 `.ai-experts` entries (rooms, areas, directions, orientation, autoleveling, bestiary, combat-math, abilities, classes, races, merits, items, gear-search, equipment-slots, enchanting); none for room interaction. My mapping of experts to spheres is a reading of their names and descriptions, not a check of their contents. Whether each is complete was not measured.
- Log volume: 2.4 GB across 362 jsonl files in the game-server log folder; recent daily files about 0.3 MB to 6.5 MB (`du -sh`, `find -name "*.jsonl"`). No token count was measured, so the cost of passing the stream to any model is not known.
- Completion gate (CLAUDE.md): changes under `apps/game-client/src/` need related tests, and a JSX change needs a fresh showcase screenshot.

## Dependencies and order

- Decision 2 (how the agent gets game text and how commands travel back) gates everything else, including Decision 3.
- The local-only switch is needed before the UI entry ships, otherwise the nav item reaches every build, including production images.
- Rule and expert documentation edits depend on the Shattered-AI experts conventions (`.ai-experts/README.md`, the `create-expert` skill) and on the docs-hub freshness rules in `docs/agent/README.md`.
- The reduction and routing design (Decisions 1 and 8) comes before the modal: the UI shows what the layers below it decide.
- The training loop depends on the Shattered-AI harnesses (model-bench, gates) and the experts/MCP conventions for turning a finding into an artifact.
- Any run of a real model is the owner's to start (standing instruction), so verification of the learning loop cannot be part of automated phases.
- The test characters are prep work that comes before the full plan: the roster exists, the characters are created on DSL, and the shape of the per-character records is settled first. Creating them on the live game is the owner's to do or to start.
- The agent runs outside this repo. The Claude Code harness that would tail the logs is not part of the codebase and is not controlled by it.

## Risks and unknowns

1. **Which model does which job.** The requester has since answered the shape: a local agent does the routine work, with a fully local mode, and Claude (Sonnet) audits and teaches it. Which local model watches the stream, which one decides, and where Claude sits (this Claude Code session or an API call) is still open. The standing rule is local models only, with no hosted APIs in products; the audit role is an exception that needs the owner's explicit wording.
2. **Transport in both directions.** A browser page cannot read host log files. Nothing in this repo connects an agent to the client. The same applies in reverse: how the agent's recommendation reaches the userscript.
3. **Credentials in the input log.** Whether login input can reach `game:client:input` records is not established. If it can, tailing it moves Restricted data to a reader.
4. **Local-only enforcement.** `VITE_ENV` is declared but unread, and the production compose also sets `VITE_ENV`. A build flag, a runtime check on the host name, or leaving the code out of production builds all differ in what can leak into production. Not determined.
5. **Auto modes without approval.** What the agent may do unsupervised, how it stops, and what the failure cost is are unstated. Combat and questing commands can kill the character or lose items. No limits are specified.
6. **Two senders and the link between them.** If Autopilot and Copilot both send commands, ordering and conflict are unspecified. Autopilot already contains its own round, rest and vitals logic. What "Copilot invokes Autopilot" and "Autopilot leverages Copilot" mean in practice is not stated: for example, whether Copilot starts a saved Autopilot configuration or only asks it to pause, and whether Autopilot hands Copilot a decision it cannot make from its steps (an unknown room, an unexpected creature) or Copilot only reads Autopilot's state. Who holds control while the other is active is not determined.
7. **Where learned rules live.** Whether the agent edits docs and expert files directly or proposes changes for review; what happens when two sessions disagree; how a wrong rule is reversed.
8. **Persisted feedback.** What is stored, for how long, and whether it carries across sessions or characters. Not stated.
9. **Reducing the stream.** What a "relevant" line is for each mode, how much of the stream can be dropped without losing what the agent needs, and what a summarizer may lose. A summary that omits the one line that mattered is a wrong decision made cheaply. Not measured.
10. **Escalation rule.** What makes the local agent escalate (low confidence, an unknown situation, a user correction, danger), and how it knows it is unsure. A local model that never escalates defeats the audit; one that always does defeats the economy. Not determined.
11. **Measuring "needed less and less".** What counts as a scenario, as a Claude-needed event, and as a graduation to local-only. Without this the claim cannot be checked. Not defined.
12. **Claude and the local-only-models rule.** The stored project rule is local models only, no hosted APIs and no reporting. The request asks for Claude (Sonnet) as auditor. The two are reconcilable only by an explicit exception that says where Claude may run (for example, this Claude Code session at the owner's direction) and what may be sent.
13. **Fully local quality.** When Claude is unavailable, the local agent acts alone with its current training. How much autonomy it gets in that state, especially in auto modes, is not stated.
14. **Where shared ends and scoped begins.** The request names user, class, race "or some other unique aspect" as scoping traits but does not list them all. A lesson filed as shared that is really class-specific teaches every user a wrong rule; a shared lesson filed as personal is learned again for every user. How the agent decides the scope of a lesson is not defined.
15. **Completeness of the existing experts.** Each named sphere has experts, but how complete any of them is for a specific thing was not measured here. Sub-areas are partly modelled (a `SubArea` field exists and was `"Unknown"` in the file sampled), so a sphere such as Gahboom's town, clockworks and factory may not be reachable in the data. A finding "the expert is wrong" needs a source of truth, and for several spheres the source is the live game itself.
16. **Interaction has no expert.** Room interaction (hidden objects, socials, what a room reacts to) is a named sphere, but the only work on it so far lives in this session's hint scripts and a local-only C# service. Whether it becomes an MCP expert is open.
17. **Overlapping spheres and how a misroute is noticed.** Neighbours are declared by hand per expert, unevenly, and are not tied to the four spheres. A misroute is seen today only when the asked expert finds nothing and a neighbour does (a "recovered" record); a wrong answer from the wrong sphere that still looks plausible is not detected. For the Copilot this matters more, because it can act on a wrong fact. How the agent knows a sphere is the wrong one is not defined.
18. **Overlap versus duplication.** Where two spheres hold the same fact (a creature appears in the bestiary and in its room; an item is both a drop and a shop item), which one is the source and which only points is undecided. Without that, training can improve one copy and leave the other wrong.
19. **What "high confidence" is, and what the identifier survives.** Today's identity is title + sector + exit set, numbered per build. A hidden exit appearing changes the exit set; titles repeat across areas; mazes, teleports and loopbacks produce the same room by different paths. The confidence rule, and whether an identifier is kept, split or merged when new evidence arrives, is not defined. A wrong merge puts two places on one map point; a wrong split draws one place twice.
20. **Room counts do not give geography.** The Arkania example shows two routes between the same places with different room counts. Placement in relative geo-space therefore cannot come from room counts or dead-reckoning over the exits; the source of area-level placement (a hand-set position, the Archive's area data, or an assumption) is not stated.
21. **"Subzone" versus "sub-area".** The request used both words. The creature data uses `SubArea` and the new text uses subzone with named kinds. If they differ, one needs a definition; if the same, one name should win. A subzone list is not given by the game for any area I looked at.
22. **Stock definitions as hints.** The request says stock ROM is a hint, never truth. MUD Builder's file format and the merc-mud sandbox are stock Merc. Any test that passes against merc-mud only proves the Builder and the experts agree with the baseline, not that they match DSL. How DSL-only features are represented in the Builder, and how a test says which behaviour is stock and which is DSL, is not determined.
23. **Builder-only rule has no guard.** The requirement that merc-mud is changed only through MUD Builder, and that server-side code is never written automatically, is a working agreement. The agent (Claude or local) would need to be held to it; I did not find a mechanical check.
24. **Mapper UI.** The requester finds the current Mapper UI hard to follow at times. What "better" means and how it is judged is not stated.
25. **Which world the agent trains in.** The sandbox (merc-mud, through simulacrum-server) is safe to automate but is stock Merc; the live game (DSL) is the truth but is a community game where automated play has unknown policy standing. The request's examples (Gahboom, Arkania) are DSL places; the sandbox does not contain them. What is learned in one world and tested in the other is undefined.
26. **Access to the sandbox.** simulacrum-server admits only trusted-tier accounts with a single-use code that expires in minutes. A Copilot-driven client would need a way to obtain a code each session, and its preamble carries an account id and username (Personal). Whether the Copilot may mint codes itself, or the owner hands each one over, is not stated.
27. **A second builder in merc-mud.** `C:\Projects\merc-mud\2.4-builder` has its own package and Vite config. Its relation to `mud-builder-client`/`-server` in this repo (replaced, older, or a different tool) is unknown and matters for the "Builder-only" rule.
28. **Reuse of the community map database.** ANSWERED by the requester: Azah shares it publicly, allows community use, and gave express permission for this use; data purely from him is credited to Azah. Remaining: where the credit line is shown, and how to credit a room that mixes his data with newer evidence.
29. **Fit between its model and ours.** It is a CMud model with zones nesting through a parent, rooms with coordinates, and exits as separate rows; the new model has subzones, areas, continents, subzone kinds and off-page links. How a CMud zone maps to a subzone or an area (many of its 396 zones may be neither) is not determined, and the requester does not know how CMud models them either: the rules have to be worked out and written down while the data is processed. Its coordinates are for drawing, not proof of adjacency.
30. **Its reliability.** It is one person's map from a date in 2024 (file time) and the game changes. Rooms that no longer exist, renamed rooms and wrong links are plausible. PARTLY ANSWERED: the game has changed since, and the newest record wins. Remaining: records carry dates only inside the database (its `Modified` column, newest 2024-01-05), so "newest" needs a comparable date on our own evidence, and a record with no date has no rule yet.
31. **Representing a gap.** An unknown exit destination, an unvisited room, or a link seen once and never confirmed all need a stated form so the map, the experts and the agent can say "unknown" rather than guess. No such representation exists in the room graph or the Mapper document I looked at.
32. **Three map surfaces, one data source.** The data source is answered: the C# APIs serve it. Still open: whether the three renderers are shared or separate. Their load size differs (the existing C# beta view is about 7 MB of HTML), and mobile has less room.
33. **Optional vnum.** It is reserved for a future change in DSL's GMCP, which is a game-owner decision; no external party has vnums and `RefNum` is not one. No code or data should depend on it. How an optional field is carried in the map file so adding one later does not break identity is not defined.
34. **Map payload shape and size.** The requester allows JSON or another streamed format. The community database alone has 24,358 rooms and 77,747 exits, and its JSON export is 128 MB, so one document for the whole world is unlikely to suit a phone. How the payload is split (by continent, area, subzone, or zoom level) and streamed is not determined.
35. **Change detection and caching.** The requester proposes a restart-time endpoint with a short cache as the cheap check and a longer cache on the map. No health or restart-time endpoint exists in `Server.Web.Public`, and the site's response cache keys on path only. A map corrected between redeploys (live edits) would not show until the next restart if clients trust only that check; whether corrections arrive only through redeploys is not stated.
36. **Credit placement.** Where Azah's credit appears (in the map file, on each map surface, in docs) is not stated.
37. **Policy of the MUD.** Whether automated play on the live game is allowed is not recorded in the repo. A wrong assumption affects the owner's account, not just the code.
38. **Test-character names and records.** Name uniqueness across the game is only checked against the logs we hold (0 hits), which cannot prove a name is free; the first creation attempt is the real check, and a refused name is replaced in the private roster. Also not determined: what "CSR" means beyond the class records' `isCsr` flag (it flags Paladin, Monk and Necromancer among 17, which I took as the special classes the requester excluded), where the per-character roll, gameplay and exploration records are kept, and whether a row is played as one gender or both.

## Out of scope

Stated by the item or implied by it, so nobody assumes otherwise:
- A production or public deployment (the item says local-only).
- Merging Copilot into Autopilot, or replacing Autopilot. Autopilot's own step-list behaviour is not changed by the item; only the
  hooks that let the two invoke and leverage each other are in scope.
- Training or fine-tuning model weights. "Training" in the item means improving MCPs, experts, skills, prompts and data, so a scenario no longer needs Claude; it does not mean changing the model itself.
- A mobile version (`shatteredarchive-mobile`).
- Publishing merc-mud. It stays private; only its use as a training sandbox is in scope.
- Writing server-side merc-mud code. Any feature that needs it is filed through `/propose-work` and decided there.
- Sizing, scheduling and a technical design. Those follow in `/tech-plan`.

## Decisions for the human

1. **How are the models layered?** The requester's direction is: a cheap local layer handles the stream, a local agent decides, Claude (Sonnet) audits and teaches, and a fully local mode works without Claude. The open part is the layering:
   - (a) Two layers: a local model reads the stream and decides, and Claude only audits afterwards (reviewing recorded sessions, not live). Cheapest in tokens; Claude never acts live.
   - (b) Three layers: a small local watcher filters and summarizes, a larger local agent decides, and Claude is called live on escalation and in review sessions. Most capable; most parts.
   - (c) Rule-based filtering in front, with a single local model behind it, and Claude in review sessions only. The least model work on the stream; the filter rules must be written and maintained.
   Every option keeps the local path complete without Claude. The consequence to weigh is how much of the stream each layer reads, and what is lost when it is dropped or summarized.
2. **How do the agent and client exchange data?**
   - (a) Agent tails the jsonl log files; client talks to a small local HTTP endpoint for recommendations and approvals.
   - (b) Client streams game text and receives actions over a local WebSocket or HTTP service; the logs stay a record.
   - (c) File-based: both sides read and write a local folder.
   Each option changes what the client can do on its own, what is stored on disk, and what the Personal-data exposure is.
3. **Where does the client code live?**
   - (a) A first-class client feature and modal (like the Autopilot wizard): full UI control, a normal test and gate path.
   - (b) A user-script plus plugin shipped as an import (like the hint scripts): fast to change, but the runtime has no UI-rendering API, so the modal still needs client code.
4. **How is "local-only" enforced?**
   - (a) Build-time flag, so the code is absent from production images.
   - (b) Runtime check on environment or host name, so the code ships but stays hidden.
   - (c) Registered only when a local agent service answers.
5. **What may run without approval?** A per-mode list is needed. The item names combat as an example only.
6. **Is the Misc pane's Autopilot section mirrored for Copilot, or is the menu entry enough?** The two features are siblings, so a Copilot entry beside each Autopilot nav location is the consistent reading; the open part is whether the Misc pane's Autopilot section (a stub today) is worth mirroring.
7. **What is the contract between the two features?**
   - (a) Copilot can start, pause, resume and stop Autopilot through the events it already listens to, and Autopilot can only emit a "need help" event that Copilot may answer.
   - (b) A typed interface owned by neither: both sides call it, so either can be absent.
   - (c) Copilot can also read and edit Autopilot configurations. This reaches further into Autopilot's data.
   Each option changes how much of Autopilot is touched and what happens when Copilot is not present (for example, in production).

8. **How does Claude run when it is used?**
   - (a) Through this Claude Code session, started and watched by the owner, reading recorded logs and the local agent's decisions: no API calls from the product, no keys to store.
   - (b) Through an API call from a local service: it can run unattended and live, but needs a key and sends data to a hosted service from the product.
   - (c) Both, with (a) as the default and (b) off unless enabled.
   This is also where the standing local-models-only rule needs an explicit exception; the consequence of (b) is a key to protect and Personal data leaving the machine.
9. **What counts as a training opportunity, and who accepts it?**
   - (a) Every Claude-needed event must end in a written artifact (an MCP or expert fix, a skill or prompt change, a data fix) that the owner accepts before it counts as graduated.
   - (b) Claude proposes the artifact and it is applied automatically after tests pass.
   - (c) Claude records the scenario only; artifacts are written later in batches.
   The choice decides how fast the dependence on Claude falls, and how much unreviewed change reaches the MCP and expert docs.

10. **How is shared versus scoped knowledge separated?**
   - (a) Two stores: shared lessons are written into the experts/docs (committed, scrubbed); scoped lessons stay in a local, uncommitted per-character store that the agent reads in addition.
   - (b) One store with a scope tag on every lesson (shared, class, race, character, other); a publisher step promotes only shared ones.
   - (c) Start shared-only and add scoped knowledge later, leaving the per-character parts to what the game itself reports at play time.
   The consequence in every case is where Personal data lands and who can read it; (a) and (b) need the list of scoping traits settled first.
11. **Which spheres come first, and does interaction become an expert?** The four named spheres (world, fighting, interaction, things) are not equally covered; the order decides which existing experts are refined first and whether room interaction gets its own expert.

12. **How are neighbouring spheres declared, and how does the agent get back on track?**
   - (a) Extend what exists: keep per-expert `confusableWith` and `handoffs`, make them two-sided, add the missing interaction sphere, and have the Copilot agent follow the same hints when an answer is empty or a recovery was found.
   - (b) Add a sphere-level map above the experts (world, fighting, interaction, things, with their neighbours), and have each expert point to its sphere; the agent routes by sphere first.
   - (c) Keep the declared links as they are and rely on the route log to find the gaps, adding links only where recoveries show them.
   The consequence in every case is who keeps the links true, and whether the Copilot's own wrong turns are recorded the way MCP questions are today.

13. **Where does the world-map file live, and what is its identity model?**
   - (a) Grow the Archive MCP's room graph: make its ids persistent, add a confidence level and the subzone/area levels, and make the Mapper and Builder read that file.
   - (b) Make DSL Mapper's map document the home (it already has a catalog and room coordinates) and feed it from the logs; the MCP reads it.
   - (c) A new neutral file with its own schema, with importers and exporters to the MCP graph, the Mapper document and the Builder.
   Each option decides which tool owns room identity, and which of the two existing efforts has to adapt.
14. **Which map exports first, and by what route?** Mudlet, MUSHclient, zMUD and CMud use different map formats, and which the requester uses most was not stated. Options: (a) one at a time starting with the most used; (b) a neutral grid/hex export first and per-client converters later; (c) only the views inside DSL Mapper until the data is richer. I did not verify any client's current map format.

15. **Where does Copilot train?**
   - (a) The merc-mud sandbox through simulacrum-server only: no live-game policy risk and free to automate, but stock rules and none of the DSL areas named in the request.
   - (b) The live DSL game only, supervised: real rules and places, with the policy and account risks above.
   - (c) Both: build and test lessons on the sandbox first, then confirm them on DSL under supervision, tagging each lesson with the world it came from.
   The consequence is what the lesson's tag means: a lesson proven on the sandbox is a hint for DSL, never truth.

16. **What role does the community map database play?** (Input from the requester: mine it into our own design; newest record wins; credit Azah for data purely from him.)
   - (a) A seed: import its rooms, exits and zones as low-confidence candidates that walked evidence then confirms or refutes.
   - (b) A cross-check only: our map is built from walked evidence and the database is consulted to raise or lower confidence.
   - (c) Both, with every imported fact carrying its source so it can be filtered out later.
   The consequence is whether the first map is large and uneven in quality (a, c) or smaller and cleaner (b); and what credit and consent are needed in each.
17. **How is the C# world map reworked?** (Narrowed by the requester: the C# service is the one source of the map and serves JSON or a stream to every client; it is done and signed off before the game-client maps. Open: the three options below, and the fate of the user-created maps.)
   - (a) Rework in place: replace the beta page and its controller behaviour with the new map, keeping the user-maps feature.
   - (b) Build the new map beside the beta and retire the beta once the new one is trusted.
   - (c) Keep the C# map as a thin host that renders the shared map file the clients also read.
   The consequence is whether the user-created maps (create, update, delete in `MapsController`) are preserved as they are, migrated, or dropped.
18. **Which surface first?** ANSWERED by the requester: the C# implementation first, updated and signed off; the web client map and then the mobile map come very near the end, after everything else is solidly working.

13 is narrowed by the requester's "one map served from C# APIs": whatever file is authored, the C# service serves it. Open: where it is authored and how identity is kept (the options above still apply).

### Answers recorded (requester, 2026-11-05)

| # | Decision | Answer |
|---|---|---|
| 1 | Model layers | Three layers: a small local watcher filters and summarizes, a larger local agent decides, Claude on escalation and in review sessions |
| 2 | Data exchange | The agent tails the game-server jsonl logs; the client talks to a small local HTTP endpoint for recommendations and approvals |
| 3 | Client code | A first-class client feature and modal in `apps/game-client`, like the Autopilot wizard |
| 4 | Local-only | Build-time flag: the code is absent from production images |
| 5 | What runs without approval | Deferred to the tech plan |
| 6 | Misc pane | Menu entry only; the Misc pane's Autopilot stub is not mirrored |
| 7 | Copilot-Autopilot contract | Events both ways: Copilot can start, pause, resume and stop Autopilot; Autopilot can only emit a "need help" event Copilot may answer |
| 8 | How Claude runs | Through this Claude Code session, started and watched by the owner; no API calls from the product and no keys |
| 9 | Training opportunity | Every Claude-needed event ends in a written artifact the owner accepts before the scenario counts as graduated |
| 10 | Shared vs scoped knowledge | One store with a scope tag. Character-level knowledge is limited to public, mechanical facts (skills, spells, songs, race and class definition mechanics); private character work is not captured |
| 11 | Sphere order | World first; room interaction becomes its own expert, then things, then fighting |
| 12 | Neighbouring spheres | A sphere-level map above the experts (world, fighting, interaction, things, with neighbours); experts point to their sphere and the agent routes by sphere first |
| 13 | Map home | A new neutral map file with its own schema; importers/exporters for the MCP graph, the Mapper document and the Builder; served by the C# APIs |
| 14 | Exports | A neutral grid/hex export first; per-client converters (Mudlet, MUSHclient, zMUD, CMud) afterwards |
| 15 | Where Copilot trains | Both, sandbox first; each lesson tagged with its world; a sandbox lesson is a hint for DSL, never truth |
| 16 | Azah's database | Seed and cross-check: dated, low-confidence candidates credited to Azah, also used to raise or lower confidence in walked evidence; every imported fact keeps its source; newest record wins |
| 17 | C# map rework | Build the new map beside the beta and retire the beta once the new one is trusted and signed off |
| 18 | Surface order | C# first; the web map, then the mobile map, near the end |

What these answers change in the rest of this document:
- Decision 10 lowers the sensitivity of the scoped store: its content is public, mechanical game knowledge, so it is no longer treated as
  Personal data by design. The scope tag still has to say which trait (class, race, ability set) a lesson belongs to, and the rule that
  private character work is not captured has to be enforced where lessons are written (an Unknown: how).
- Decision 8 means no hosted-API call is added by the product. The standing local-models-only rule needs no exception for the product;
  log excerpts reach Claude only through the owner's own session.
- Decision 12 adds a new artifact (the sphere map) beyond the experts; who keeps it true is an Unknown.
- Decision 17 leaves the fate of the user-created maps in `MapsController` open until the beta is retired.

Still open for the requester: none of the 18 decisions. Open items are the Unknowns, which the technical plan has to resolve or
carry (counts: 38 Unknowns; 28 is answered, 30 is partly answered, 32 and 33 are narrowed).
