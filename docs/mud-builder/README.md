# MUD Builder

A graphical world-building tool for the Merc 2.4 MUD at `C:\Projects\merc-mud`.
Edit rooms (and soon mobs, objects, scripts, …) in a browser, preview the exact
area-file text that will be written, and push changes into the **running** game
without disconnecting anyone.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| `mud-builder-client` | `apps/mud-builder-client` (dev port **60080**) | React UI: browse areas, edit rooms in forms, preview/download, save, reload |
| `mud-builder-server` | `apps/mud-builder-server` (port **61000**) | REST API over the MUD's `area/` folder; the only thing that touches disk |
| `merc-area` | `services/merc-area` | Pure TypeScript parser/emitter for the Merc 2.4 `.are` format (verified by round-trip tests over the entire shipped area corpus) |
| `area_reload.c` | `merc-mud/2.4/src` | In-game **zero-downtime hot reload** of one area file |
| `copyover.c` | `merc-mud/2.4/src` | **Fresh-slate warm reboot** that keeps players connected (recovery fallback) |

## Core concepts

### Preview-first editing
The UI never writes silently. Every edit path goes: form (or flagged Manual
tab) → **Preview** (exact generated file + diff vs disk) → Download and/or
Save. Manual raw-text edits are parsed and validated before they touch the
model, and saves made after a manual edit are labeled `MANUAL EDITS`.

### The write gate
`mud-builder-server` refuses all disk writes (Save, reload signals) with HTTP
403 unless it was started with `MUD_WRITE_ENABLED=true`. Local dev runs are
preview/download-only by default; the experimental docker deployment (later
phase) sets the flag. Set it manually only when you *intend* to write to
`C:\Projects\merc-mud`. Every save is atomic and leaves a timestamped backup
in `area/backups/`.

### Two reload tiers (both keep players connected)
1. **Hot reload** (`reload.signal`, `areload` command, "Hot reload" button) —
   the game re-parses ONE area file into staging memory and, only if it is
   completely valid, upserts the live prototypes **in place**. Zero
   interruption; on any error the world is untouched and the reason is logged.
   Deletions are deliberately deferred (a live mob may still reference the
   prototype). Helps/socials sections are skipped.
2. **Copyover** (`copyover.signal`, `copyover confirm` command, "Copyover"
   button) — the whole world is rebuilt from disk while every playing
   connection survives the exec ("the world shimmers"). This is the recovery
   path: use it after a failed hot reload, to apply deletions, or to compact
   string space. If the exec fails, the game keeps running untouched.

### Why the docker mount matters
`merc-mud/docker-compose.yml` bind-mounts `./2.4/area` into the container, so
the files the builder writes on the host ARE the files the running game
reloads. Without that mount the game only sees the copy baked into its image.

## Everyday workflows

Start everything for local building:

```bash
# 1. the game (from C:\Projects\merc-mud)
docker compose up -d

# 2. the API (writes OFF by default; add MUD_WRITE_ENABLED=true deliberately)
pnpm --filter @shatteredarchive/mud-builder-server dev

# 3. the UI → http://localhost:60080
pnpm --filter @shatteredarchive/mud-builder-client dev
```

Then in the UI: pick an area → pick a room → edit → **Preview** → Save →
**Hot reload** → check it in game (`telnet localhost 4000`).

See [commands.md](./commands.md) for the full command crib sheet.

## Deployed stack (Phase 3): build.shatteredarchive.dev

The builder ships in the **experimental** compose stack
(`deploy/docker-compose.shattered-archive-experimental.yml`) behind the edge
nginx as the `build.` subdomain:

- **URL:** `https://build.shatteredarchive.dev` (UI); `/api/*` and `/health`
  are proxied by the edge to the `mud-builder-server` container (port 61000).
- **Write gate:** the compose service definition is the ONLY place in the repo
  that sets `MUD_WRITE_ENABLED=true`. Everywhere else (local dev, standalone
  image) the builder is preview/download-only.
- **Volume layout:** the game keeps running from its OWN compose
  (`C:/Projects/merc-mud/docker-compose.yml`), so bringing the experimental
  stack up or down never interrupts the MUD. Game and builder share the same
  host directory — `C:/Projects/merc-mud/2.4/area` — mounted at
  `/opt/merc-mud/area` (game) and `/mud/area` (builder). Saves, `backups/`,
  and the reload/copyover signal files therefore land directly in the live
  game's area directory.
- **Edge resilience:** the `build.` vhost uses nginx's resolver+variable
  pattern, so the edge starts and serves everything else even when the
  builder containers are down.

```bash
# start/refresh just the builder pair (game and other services untouched)
docker compose -f deploy/docker-compose.shattered-archive-experimental.yml \
  up -d --build mud-builder-server mud-builder-client
```

## Mob and object editors (Phase 3)

The **Mobs** tab edits every `#MOBILES` stat: descriptions, race, level,
alignment, hitroll, hit/mana/damage dice, AC, positions, sex, size, wealth,
and checkbox grids for act / affected-by / offense / immune / resist /
vulnerable flags. The **Objects** tab edits `#OBJECTS` entries: the five
values are re-labelled and re-typed per item type using the same table
`db2.c load_objects` uses (weapon class + damage dice, container capacity,
drink liquid, wand/staff charges, potion spells…), plus wear/extra flag
grids, level/weight/cost/condition, and an extra-descriptions editor.

Two preservation rules keep odd area files safe in both editors:

- **Word fields are verbatim.** Race, damage type, positions, sex, size,
  material, item type, and condition are stored exactly as written; the
  inputs suggest known values but never coerce an unknown one.
- **Unlisted flag bits survive.** The checkbox grids only touch the bits they
  list; anything else in the vector is preserved (`(+unlisted bits preserved)`
  appears when that happens). Mob `F`-removal lines and object `A`/`F` affect
  lines are preserved verbatim and noted in the form.

Adding/removing mobs and objects is deliberately out of scope for the forms
(resets and scripts reference vnums); use Manual edit on the Areas tab for
that until a dedicated flow exists.

## Guarantees (and their limits)

- Anything the emitter writes re-parses identically and boots in unmodified
  `db.c` (round-trip suite covers every file in `area.lst`).
- A hot reload either fully applies or fully doesn't; there is no partial
  state. String memory is interned exactly like boot-time strings, so sharing
  with live mobs/objects is safe by construction and repeated reloads of
  unchanged text cost zero bytes.
- Known accepted drift: prototype deletions wait for a copyover; editing the
  affects of an object type someone is currently wearing re-resolves on
  removal (stock OLC behavior); `kill_table` level counts only grow.

## Mob scripts (Phase 2)

Vanilla Merc has no mobprogs; the builder added its own engine
(`merc-mud/2.4/src/mob_prog.c`) plus a `#SCRIPTS` area-file section. A script
attaches to a **mob** and has a **trigger**, a **phrase** (what to match), and
a **body** (commands to run):

```
#SCRIPTS
M 3700 speech hello~
say Hello yourself, $n!
emote bows deeply.~
#0
```

- **Triggers**: `speech` (say/tell substring, case-insensitive; empty = any),
  `greet` / `entry` / `rand` / `fight` / `death` (phrase = percent chance),
  `give` (phrase = object name word or `all`), `bribe` (phrase = minimum
  gold), `act` (reserved, not yet wired to a call site).
- **Commands**: `say`, `emote`, `echo`, `goto <room>`, `transfer <name>
  [room]`, `mload <mob>`, `oload <obj>`, `purge [name]`, `force <name>
  <command>`, plus `if <check> / else / endif` (checks: `rand <pct>`, `ispc`,
  `isnpc`, `level <op> <n>`, `name <word>`). `$n` = the triggering character,
  `$i` = the mob, `*` starts a comment.
- **Safety rails** (stability is king): a hard budget of 256 lines per run, no
  script may trigger another script (recursion depth 1), unknown commands are
  logged no-ops, a script can never purge itself or a player nor touch
  immortals, mload/oload have room caps, and the engine re-validates every
  pointer after each command — a mob or player extracted mid-script is handled,
  never dereferenced.
- **Authoring**: the Scripts tab in the UI (mob picker → trigger → phrase →
  body with the vocabulary beside it). Validation runs live in the browser,
  again in the server (preview/save return 400), and once more in the MUD's
  staged reload — a bad script cannot reach, or take down, the game. Scripts
  hot-load like everything else; a mob's script list is replaced wholesale
  from its area file.
- Scripts must live in the same file as their mob's `#MOBILES` entry (the
  section is emitted last, so mobs always load first at boot).
- Self-test: `docker exec -w /opt/merc-mud/area merc-mud2.4 ../src/rom
  --mp-test` boots the world sockets-free and exercises the interpreter
  (budget, if/else, malformed control flow, trigger matching).

## Scope (what exists today)

Rooms, mobs, objects, and mob scripts are fully editable end to end, and the
builder is deployed at `build.shatteredarchive.dev` in the experimental stack
(the only environment with writes enabled). Resets/shops/specials are parsed,
validated, hot-reloaded and preserved by the emitter, but don't have dedicated
editor forms yet — those, add/remove flows for mobs and objects, and
skills/spells/songs (C tables, not data files) are later phases.
