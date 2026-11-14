---
type: proposal
title: Copilot - a local-only AI training companion beside Autopilot that learns to navigate the MUD
slug: 2026-11-05_copilot-ai-training-sibling-to-autopilot
created: 2026-11-05
state: active
data-classification: personal
---

# Copilot - a local-only AI training companion beside Autopilot that learns to navigate the MUD

## Problem or opportunity

Autopilot runs predefined actions from scripts. There is no tool in which the AI agent can learn to play and navigate the MUD:
learn its rules, keep rule documentation, and improve the MCP and Expert documentation, from live play with feedback from the user.
The opportunity is a live session in which the agent reads the game as it happens and acts, or recommends, with the user in the loop.

## Proposed work

Build a "copilot", as the user described it:

- **Live session.** The user starts a live session and lets the AI agent issue commands and learn how to navigate the MUD.
- **Agent side.** The agent operates by tailing the game logs.
- **Userscript side.** The userscript acts by receiving data as input. For each action it either prompts the user for approval to execute,
  or receives a recommended action from the user. The agent receives the user's recommended action, evaluates why the recommendation
  is being made, and adjusts its expectations.
- **Auto modes.** Toggleable UI options for automatic behaviour during things like combat.
- **Local-only sibling to Autopilot,** with a UI nav entry named "Copilot".
- **Modes:** battle support, exploration, questing, leveling.
- **Distinct siblings.** Autopilot and Copilot are separate features with separate nav entries, not co-mingled. Copilot can invoke
  Autopilot, and Autopilot should be able to leverage Copilot. Autopilot is autonomous scripting that accomplishes a goal with a
  predefined step list. Copilot is less defined in how it reaches its goal(s) and reacts to the game world through the AI agent.
- **Economical log handling.** A lot of data streams in during an active session, so the logs must be watched cheaply. Candidates
  named by the user: a cheaper model, the local AI model summarizing and escalating work, or something else.
- **Fully local mode.** Copilot must also work with no Claude (for example when out of AI tokens), using only the local agent.
- **Claude as teacher and auditor.** Claude (Sonnet) is required to help audit and review the local agent for training purposes. The
  path leans heavily on Claude at first and needs it less and less as the MCPs, skills, prompts and data improve.
- **Every Claude session ends in a training opportunity.** Each time Claude is needed, the result should be something actionable
  (an MCP, skill, prompt or data improvement) so Claude is not needed for that scenario again.
- **Training is organised by domain knowledge spheres.** The user named these, in the user's words:
  - the world: rooms, which sit within areas, and areas that are often split into sub-areas (for example in Gahboom: the town, the
    clockworks, the factory);
  - fighting: what the creature is, how it compares with the player's character, what the character can execute from an
    abilities point of view;
  - interaction: how the user can interact with the room;
  - things: items carried by mobs, items that exist in rooms, and objects.
- **Spheres know their neighbours.** The spheres must help identify neighbouring spheres that may hold overlapping information.
  When a request is misrouted, the sphere must help the AI agent get back on track to the correct location.
- **Maps are a desired output.** MUD Builder and DSL Mapper are earlier efforts at map tooling, world building/tracking and
  human-understandable mapping. These, plus simpler hex/grid maps like those from Mudlet, MUSHclient, zMUD and CMud, are desired
  outputs of this process.
- **Room identity from confident links.** At each step, when a high-confidence link between two rooms is clearly established,
  create an internal identifier for the room. The identified rooms build into a file that can draw a clear picture of the world and
  put locations in relation to one another.
- **Zoom levels.** Closest is a room. A room lies within a subzone within an area; an area is made of one or more subzones; areas
  sit in continents.
  - A subzone can be internally consistent with its own directions, or maze-like, or hold teleports or loopbacks.
  - A subzone has a definitive link to another subzone; an area has a definitive link to another area.
  - Areas exist in relative geo-location space. Where several paths or teleports reach an area from other areas, show an
    "off page link" conceptually, not necessarily a hard link when that mapping would not make sense.
  - Example: the room count from the port of Arkania into Arkane and north towards Verminasia differs from the count along the
    port, northeast to the great tree, through Bloodshackle Fortress towards Verminasia. Conceptually they are the same locations but
    hard to represent from the real rooms. Zoom levels of room/subzone/area/continent let one area link to another in relative
    geo-space without confusing room-level mapping.
- **Where the world map is shown.** The established world mapping is wanted as a representation in the web game client
  (`apps/game-client`), in the mobile client (`C:\Projects\shatteredarchive-mobile`), and in the C# world map in
  `C:\Projects\DSL\Server\Server.Web.Public`. That C# map is currently beta and can be completely reworked to fit the rework of all
  this information.
- **Order: the game-client maps come last.** The web and mobile world maps are among the very last pieces of work, well after
  everything else is solidly working and the C# implementation has been updated and signed off.
- **One map, served by the C# APIs.** The game clients should render from JSON (or another streamed format) delivered by C# APIs,
  so there is one map to maintain and a correction shows up everywhere at once.
- **Caching is an ongoing concern.** It trends towards service redeploys for the C# side. An endpoint that reports when the service
  was last restarted (the health check) can be a light-weight proxy check with a shorter cache duration than the longer cache of
  the map service itself.
- **Internal identifiers, optional vnum.** Rooms use internal identifiers, with an optional vnum setting. The vnum is reserved for
  the case that DSL ever shares raw vnum data in the `room_data` GMCP event. It does not do so today; no external party has vnums,
  and that changes only if the game owner decides to update the GMCP records. The option may exist in the future.
- **A community map database to mine (Azah's CMud map).** The player Azah has previously mapped a great many rooms; that database
  can be used to leverage and cross-check information. It has not been fully extracted or integrated and should be mined into this
  design. It is a CMud map database shared publicly on the game's forum, kept at `C:\Projects\DslScripts\data\db` (`azah-db.dbm`
  and its `Readme.md`). The requester has Azah's express permission for this use, and use of data that comes purely from Azah can be
  credited to Azah, who freely lets the community use it. Its `RefNum` is a CMud reference id, not a game vnum; it can be tracked
  to map rows back to the database. The file is git-ignored only because it is large, not because it is sensitive: once parsed out,
  the data is fine to commit. Where the database and newer evidence disagree, the newest record wins.
- **Incomplete information is the normal case.** The work proceeds on incomplete information, so it needs good domain knowledge of
  what is known, and access patterns that can reason about the gaps and bridge them.
- **Stock ROM is a hint, never truth.** DSL has evolved for decades from stock ROM and has many features that have never existed in
  stock. merc-mud definitions are baselines and guidance only.
- **Builder and Mapper evolve with the experts.** MUD Builder and DSL Mapper are to be evolved along with the experts, MCP and other
  tooling. Both are built for DSL from an outsider/fan's view of the game. Replicating the game programmatically in the build, to
  create tests for the experts/MCP/testing, is fine. The current Mapper map UI is acceptable but hard to follow at times and will
  need improvement as more data is gathered.
- **How merc-mud is touched.** merc-mud is private sandbox work for training, never intended to be published. Interaction with it is
  exclusively through MUD Builder, never direct coding into merc-mud, except server-side code support for a feature that cannot
  otherwise be done through the Builder. That never happens automatically: a newly required feature is raised as work through
  `/propose-work`, filed and prioritised.
- **Refine the existing experts.** Many experts already cover these areas, but they may not be complete or comprehensive enough for
  any specific thing. The goal of the training is to refine and perfect that information.
- **Shared versus unique knowledge.** Many areas are shared; many are specific to a user, class, race or some other unique aspect.
  Defining the shared domains and the personal/unique domains is part of the work to resolve.
- **Purpose.** Autopilot focuses on predefined actions from scripts. Copilot is a training tool for the AI: to learn how to navigate the
  MUD, learn the rules, maintain rule documentation, and improve MCP/Expert documentation. It should use all tools available from the
  MCP, the logs and everything else, and actively take feedback from the user.
- **UI.** The modal is movable and resizable. The user can keep using the chat input bar behind the modal without closing it.
- **Test characters (prep work).** Before this plan is pursued in full, a set of test characters is created on DSL: one per public
  class (the 5 base classes and 26 public reclasses; no CSR or other special class), each on a non-limited race, so every
  non-limited race appears. For each character we track roll data, the gameplay experience and the exploration experience. That
  record is used to improve the expert information, the MCP, skills, routing and so on, and this section exists to help write down
  what has to be prepared first. The roster (codename, class, race, a male and a female name per row, and where each name comes
  from) is kept in the private DSL data repository, not in this repository: `docs/copilot/test-character-roster.md` in
  `C:\Projects\DSL`. Two races are single-gender in the game (Felar female, Wemic male), so the 31 rows give 60 characters. Their
  in-game descriptions are in `test-character-descriptions.md` beside the roster, and a Shattered Story narrative persona for each
  is in `test-character-personas.md`, both also private. The 31 rows are only the first slice: the measurement covers male and female for
  every legal public race and class pair, which is 601 pairs and 1,157 characters. All of them are named in a private stub list,
  `test-character-matrix.md` (with a JSON copy); descriptions and personas exist only for the first 60 and are not yet wired up for the rest. **This plan refers to a character only by codename plus gender (for example `Agate-F`), never by name.**
  The names are English-readable forms of names from real history, myth and legend, and must be unique across the whole game.

## Who benefits

- The owner/developer: an AI that learns the game from supervised play, and maintained rule documentation and MCP/Expert documentation.
- Players of the local build: battle support, exploration, questing and leveling help.
- The AI tooling (MCP experts and docs), which gets corrections from real play.

## Constraints and known unknowns

Stated by the user:
- Local only; not a production feature. Sibling to Autopilot, with its own "Copilot" nav entry; the two stay distinct features.
- Two-way link between them: Copilot can invoke Autopilot, and Autopilot should be able to leverage Copilot.
- The user must be able to type in the chat input bar while the modal is open.
- merc-mud is never edited directly, and Builder-only interaction is the rule. A feature that needs server-side code in merc-mud is
  never built automatically; it is filed through `/propose-work` first.
- Stock ROM/merc-mud definitions are hints only; DSL is the truth where they differ.
- Session volume is large, so token and compute cost is a constraint on the design, not an afterthought.
- Must keep working with Claude unavailable.

Known unknowns (not answered in the request):
- Which model does which job. The project's standing rule is local models only with no hosted APIs; the request now asks for Claude
  as an auditor and optional escalation target, so how that fits the rule needs the owner's decision.
- What "high confidence" means for a link between two rooms, and what the identifier survives (a hidden exit appearing, a repeated
  room title, mazes, teleports, loopbacks).
- What the mined community database may be used for (seed, cross-check, or both), and how its zones and rooms map onto this design.
  The requester does not know how CMud models sub-zones and areas; rules for it have to be established while the data is processed.
  (Reuse and credit: answered, see the proposed work.)
- How a gap is represented (an unknown exit, an unvisited room, a conflicting link) and how an answer says what it does not know.
- Whether the three map surfaces share one renderer, or only the data served by the C# APIs. (Order: answered, the C# map first and
  the game-client maps last.)
- The shape of the map payload (JSON, or a streamed format), how it is sized for mobile, and how the clients learn the map changed
  (restart-time check, cache lifetimes).
- Whether "subzone" is the same thing as the "sub-area" used earlier in this request (the user's wording changed), and how an area's
  subzones are found when the game gives no list.
- Which hex/grid map formats are wanted from each client (Mudlet, MUSHclient, zMUD, CMud) and in what order.
- How the map file relates to the existing MUD Builder and DSL Mapper data, so one is not abandoned or duplicated.
- Where the boundary lies between shared knowledge (the same for everyone) and scoped knowledge (per user, class, race or other),
  who may see and edit each, and how the agent knows which one a lesson belongs to.
- How neighbouring spheres are declared and kept true (for example, whether the existing expert-to-expert links are enough or a
  sphere-level map is needed), and how the agent is told it is in the wrong place and where to go instead.
- Which existing experts cover each sphere, and how gaps and errors in them are found and recorded.
- How the stream is reduced before any model sees it (filtering, summarizing, batching), and what triggers an escalation from the
  local agent to Claude.
- How "needed less and less" is measured: what counts as a scenario, a Claude-needed event, and a graduation to local-only.
- What is sent to Claude, since game logs hold player names and other Personal data, and whether it is scrubbed first.
- How the agent reads the game: which game logs, in what form, and how the userscript and the agent exchange data in each direction
  (the "receiving data as input" mechanism).
- What "auto mode" may do without approval, in each of the four modes, and what stops it (limits, a kill switch, danger states).
- Where learned rules and the documentation updates live, who reviews them before they change MCP/Expert docs, and whether the agent
  may edit them directly.
- How feedback from the user is captured and kept: the form of a recommended action and the agent's "why", and whether it persists
  across sessions.
- What the two-way link between Copilot and Autopilot looks like (what "invoke" and "leverage" mean in each direction), and how the
  two are kept from sending commands at the same time.
- The game logs contain player data (character names, accounts, IPs); where such data may be read, stored and sent needs deciding.
- How the "local-only" boundary is enforced (build flag, config, or environment).

## Related

Explicit callouts from the requester (the code locations the work refers to):

| Name | Location |
|---|---|
| DslMapper | `C:\Projects\DslMapper` |
| mud-builder-server | `C:\Projects\ShatteredArchive\apps\mud-builder-server` |
| mud-builder-client | `C:\Projects\ShatteredArchive\apps\mud-builder-client` |
| simulacrum-server | `C:\Projects\ShatteredArchive\apps\simulacrum-server` |
| merc-mud (simulacrum) | `C:\Projects\merc-mud` |
| game-client (web) | `C:\Projects\ShatteredArchive\apps\game-client` |
| mobile client | `C:\Projects\shatteredarchive-mobile` |
| C# public web server and world map | `C:\Projects\DSL\Server\Server.Web.Public` |
| Community CMud map database and its Readme (credit: Azah) | `C:\Projects\DslScripts\data\db\azah-db.dbm`, `Readme.md` |
| JSON export of the same map, zipped | `C:\Projects\DslScripts\azah-directions.zip` (one 128 MB `azah-directions.json`) |
| Test-character roster, in-game descriptions and personas (private; codenames only are used here) | `C:\Projects\DSL\docs\copilot\test-character-roster.md`, `test-character-descriptions.md`, `test-character-personas.md`, `test-character-matrix.md` (full stub list) |

Other:

- Autopilot: the game-client's Autopilot menu entry (`apps/game-client/src/components/MainMenuBar.tsx`) and the auto-leveling feature
  (`apps/game-client/src/features/autoleveling/`).
- Existing hint tooling from this session: `docs/userscripts/room-hints/` (a userscript that calls the local C# agent API and the local AI).
- No overlapping work item found in `.ai-plans/proposed/` or `.ai-plans/active/`.
- Item `2026-09-12_autoleveling-mobile-port` concerns the autoleveling feature and is not the same work.
