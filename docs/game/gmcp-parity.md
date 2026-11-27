# GMCP parity: what DSL sends and what simulacrum sends

DSL is a third-party MUD (no source). Its GMCP is known from its live traffic, which the game-server logs record. The simulacrum
(merc-mud, the owner's own base) is made to send the same packages with the same shapes, so the game client works against both. This
page records what DSL sends, where simulacrum differs on purpose, and how to re-check.

## How DSL's GMCP was read

- **Source:** the game-server jsonl logs under `GameLogs/ShatteredArchive/Docker/game-server/2026/` (365 files), the lines whose type is
  `game:remote-server:gmcp`. Read on 2026-11-07: about 1.16 million messages over 220 days (2026-01-01 to 2026-11-07).
- **Tools:** `scripts/gmcp-corpus/report-shapes.mjs` (per package: count, days, and every key path with its value types),
  `report-values.mjs` (the value sets of the enum-like fields) and `report-affect-t.mjs` (the affect `t` value per affect name).
  Each reads the GMCP lines on stdin:

  ```
  grep -rh --include="*.jsonl" '"type":"game:remote-server:gmcp"' <logs>/2026 | node scripts/gmcp-corpus/report-shapes.mjs
  ```

  They print keys, types and enum values only, never character names or text. The logs themselves hold character names (Personal data),
  so copy nothing from them into a document.
- **Cross-check:** `DslScripts/src/dsl/processors/gmcp-processor.ts` handles the same seven packages and
  `DslScripts/src/models/gmcp-models/` has their TypeScript shapes.

## The seven packages

Wire format: `<package> <json>`.

| Package | Count | Fields | simulacrum |
|---|---|---|---|
| `login_data` | 623 | `name`, `is_clan`, `is_kingdom`, `level`, `time` always; `clan` when in a clan (568), `kingdom` when in a kingdom (36) | sent first at login and on reconnect. `is_kingdom` is always false (no kingdoms). `clan` only for a real clan, not a loner. `time` is the game clock |
| `char_data` | 517,844 | 29 always: `hp` `max_hp` `mana` `max_mana` `move` `max_move` `gold` `silver` `wimpy` `str` `max_str` `int` `max_int` `wis` `max_wis` `dex` `max_dex` `con` `max_con` `stance` `language` `tnl` `carry_weight` `can_carry_weight` `is_afk` `is_quiet` `is_flying` `is_riding` `is_fighting`; plus `chamber` (a number, 100) on 386 messages | the 29. `is_riding` is always false (no mounts). `chamber` is a dragon-only field in DSL and has no equivalent |
| `room_data` | 517,844 | `room` (no colour codes in any message), `sector`, `exits[]` (direction strings; 28,062 messages have none) | same shape. simulacrum leaves closed doors out of `exits` |
| `tick` | 83,997 | `time` | same, every half game hour |
| `add_affect` | 18,407 | `n` name, `d` duration, `m` modifier, `lc` location, `t` type | same |
| `remove_affect` | 20,339 | `n` | same |
| `affect_data` | 1,649 | `affects[]` of the five add_affect fields | same, once at login (after `login_data`) |

`char_data` and `room_data` have exactly the same count: DSL sends them as a pair.

## Vocabularies

| Field | DSL sends | simulacrum |
|---|---|---|
| `char_data.stance` | `Offensive`, `Defensive`, and `neutral` (46 messages) | the same three words. Berserk is an ability, not a stance, and reports as `Offensive`. The in-game text and the prompt keep the engine's own words |
| `char_data.language` | `Common` (capitalised), `Dragon`, `Yinnish`, `Goblin`, `Althainian`, `Elvish`, `Ogre`, `Dwarvish`, `Leonine`, and `common` (46) | **known difference, owner's decision:** `common`, `elven`, `dwarven`, `giant` |
| `room_data.sector` | `inside` `forest` `field` `city` `air` `desert` `underground` `underwater` `mountain` `tundra` `hills` `ice` `ocean` `swim` `noswim` | `inside` `city` `field` `forest` `hills` `mountain` `swim` `noswim` `unused` `air` `desert`. The five sectors DSL has beyond these do not exist in the engine; `unused` is the engine's reserved type |
| `room_data.exits[]` | `N E S W U D NE NW SE SW` | same |
| `affect.lc` | `none` `armor class` `hit roll` `saves` `dexterity` `damage roll` `strength` `constitution` `moves` `hp` `intelligence` `wisdom` `mana` `sex` `level` | the engine's ROM names, a superset (for example `class`, `age`, `gold`, `experience`) |
| `affect.t` | documented 0 = spell, 1 = song; live traffic has 231 distinct values | always 0 (no songs). See below |
| `tick.time`, `login_data.time` | `H:MMam` / `H:MMpm`, minutes `00` or `30` | the same form |

### The affect `t` field

`DslScripts` documents `t` as 0 = spell, 1 = song. In live traffic the songs do carry 1 (`song of war`, `we come, we come`,
`shield of words`), but most spells carry 0 *or* 3, and 231 different values appear overall, many on a single message. The same spell
shows several values, so `t` is not a function of the affect name (`report-affect-t.mjs`: only 33 of 132 names have one value). Only 0
and 1 are meaningful; the rest looks like uninitialised data on DSL's side. simulacrum has no songs and sends 0, which is correct.

### The game clock

In DSL each tick is half a game hour (ticks read `9:00pm`, then `9:30pm`). merc-mud now matches: `time_info.minute` is 0 or 30, every
`weather_update` call moves the clock half an hour, the hour logic (sunrise, sunset, day rollover) runs on the `:30` to `:00` step, and
the boot clock is computed in half-hour units. The tick length is unchanged (`PULSE_TICK`, 60 real seconds), so **a game day is 48 real
minutes**. The prompt's `%t` and the `time` command show half hours too ("It is half past 3 pm").

## When GMCP is sent

DSL pushes GMCP to every client from the start, with no negotiation. The game client's telnet layer (`DslScripts/src/mud/TelnetClient.ts`)
never negotiates: it ignores `WILL` and sends no `DO GMCP`. merc-mud used to start every connection with GMCP **off**, turned on only by a
negotiation or by an immortal typing `gmcp`. The server never offered GMCP (`gmcp_offer` exists but nothing calls it), so in practice
ordinary players got none, and `login_data`, which goes out once at login, was always lost.

Now **GMCP is on from the first byte**, for a fresh connection (`comm.c`, `init_descriptor`) and for one recovered after a copyover
(`copyover.c`). Nothing is sent before a character is playing. The immortal `gmcp off` still turns it off for a session and `gmcp` turns it
back on. A raw telnet client sees the usual `IAC SB ... IAC SE` bytes, which telnet clients discard.

## Where it lives

| What | Where |
|---|---|
| composers and senders | `merc-mud/2.4/src/gmcp_compose.c`, `gmcp_compose.h` |
| when each package goes out | `merc-mud/2.4/src/comm.c` (login, reconnect, per-command flush), `handler.c` (affects), `update.c` (tick) |
| the check that runs the composers against the real world | `merc-mud/scripts/gmcp-compose-check/run.mjs` (needs Docker) |
| the client's copy of DSL's schema and the parity check | `apps/game-client/src/features/simulacrumAdmin/dslGmcpSchema.ts`, `gmcpParity.ts`, shown in the Simulacrum Admin GMCP tab |

A change to merc-mud's C needs the image rebuilt and simulacrum restarted: a copyover cannot load new code.
