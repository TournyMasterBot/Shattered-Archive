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
edit) → **Preview** (exact generated file + diff vs disk) → Download and/or
Save. **Manual edit is available on every tab** (Areas, Mobs, Objects,
Resets): it shows the exact generated file text, editable. "Parse & apply"
validates the text and — only when syntactically valid — applies it back to
the model, so the forms immediately show the change. That round trip is the
bridge between technical and non-technical collaborators: one person can
paste a snippet of area code, the other reviews the same change as forms.
Invalid text never touches the model; saves made after a manual edit are
labeled `MANUAL EDITS`.

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

## Creating and deleting things (Phase 4)

Every entity tab has **+ Add** (rooms on Areas, mobs, objects). New entities
get the first free vnum in the area's declared min/max range (mob/object/room
numbers are treated as one namespace to keep things unambiguous) and a
minimal template that boots as-is — rename and stat it in the form.

**Delete** is reference-checked: an entity still named by resets, room exits,
shops, specials, or scripts cannot be deleted — the button reports exactly
which lines reference it (e.g. `reset #3 (M): mob 3705 into room 3712`).
Remove those references first (Resets tab, exit editor, Scripts tab). Two
safety layers back this up: the client blocks the delete outright, and the
server 400s any save whose in-range references dangle (`validateRefs`), so a
broken world can't reach disk even through manual edits. Cross-area
references (a door into another zone) are warnings shown in the preview, not
errors — stock areas link outward all the time.

Deletion drift to know about: the in-game **hot reload only upserts** — a
deleted prototype stays live until the next **copyover** (the UI reminds you
when a delete is saved). The file on disk is correct immediately.

## Resets tab (Phase 4)

The Resets tab edits `#RESETS` — what spawns where on every area repop.
Resets are listed in file order because order is meaning: `G`/`E` load onto
the mob of the closest `M` line above, `P` fills the closest `O`. Each row is
a compact form for its command letter (M mob→room, O object→room, P
object→container, G give, E equip, D door state, R randomize exits) with
vnum pickers suggesting the area's own mobs/objects/rooms (free-typed numbers
are allowed for cross-area vnums, with a caption showing what resolves
locally). Rows reorder with ↑/↓ and comment lines are preserved read-only.

## Shops and specials (Phase 5)

Both live on the **Mobs tab**, under the stat fieldsets, because both attach
to a mob by vnum:

- **Shopkeeper** — "+ Make shopkeeper" adds a `#SHOPS` entry for the mob:
  profit percentages (buy/sell), open/close hours, and up to five item types
  the keeper will buy from players (unlisted numeric types written by hand are
  preserved "(as written)"). Remember the keeper still needs an `M` reset to
  stand somewhere and `G` resets for stock to sell. One shop per keeper — a
  duplicate (only possible via manual edit) blocks the save, because the game
  silently keeps just the last one.
- **Special function** — attaches a C behavior from `special.c`'s `spec_table`
  (`spec_cast_mage`, `spec_guard`, `spec_janitor`, …). The picker lists the
  table mirrored into `SPEC_FUNS`; an unknown name **blocks the save**, since
  the game refuses to boot on one (`load_specials: bug + exit`). Prefixes of
  known names are accepted, exactly like the game's `spec_lookup`.

## Creating a new area file (Phase 5)

"+ New area" in the Areas sidebar takes a file name, a display name, and a
vnum range. The server validates the range against every area in `area.lst`
(overlap = 400), writes the new `.are` file **before** registering it (a crash
between the two steps leaves a harmless orphan file, never a
listed-but-missing area that would kill the next boot), and backs up
`area.lst`. The new area opens immediately in every tab.

One caveat, straight from the C side: **hot reload only covers areas the game
saw at boot** (`area_reload.c` refuses others by design), so a brand-new file
needs one **copyover** to enter the world. The create response and UI toast
both say so. After that first load it hot-reloads like any other area.

## Area header, socials, and the World tab (Phase 6)

The **Areas** tab now has an "Area header" fieldset: name, credits, and the
vnum range are editable like any other field. Range edits are guarded twice —
the form warns inline the moment the range no longer covers a vnum the file
defines, and the server rejects the save (400) for both that shrink case and
for a grow that overlaps any other area in `area.lst`. Untouched ranges are
never re-checked, so stock files with historically loose ranges keep saving.
A rename/credits change is live after a plain hot reload (the C side commits
`name`/`credits` in place).

The **Socials** tab edits `#SOCIALS` (stock: only `social.are` has them). Each
social is up to 8 act()-style messages; a blank field means "unset" and is
written as `$` (the file format cannot represent an empty message). Stock
socials that end early (fewer than 8 lines) keep their short form byte-for-byte
unless you explicitly add lines. One C-side caveat, surfaced in the UI:
**socials load into the global table at boot only** — hot reload deliberately
skips `#SOCIALS`, so saved changes take effect at the next copyover.

The **World** tab is a read-only dashboard: one row per `area.lst` entry with
its vnum range, entity counts, and an expander listing every cross-area
warning, reference error, or parse failure. It is a single `GET /api/world`
aggregate — the place to spot a broken file or a dangling cross-area link
before the game does.

## Skills &amp; spells as data (Phase 7)

Skills and spells live in a compiled C table (`const.c skill_table`), not in
area files. Phase 7 makes their **data** authorable without recompiling: the
**Skills** tab edits `skills.dat`, an optional overlay file the game reads at
boot (between gsn assignment and area loading, so object spell slots resolve
against the final table). No file present = the game boots exactly its
compiled table; a bad row is logged (`bug`) and skipped, never fatal — the
loader deliberately avoids the stock `fread_*` helpers, which exit the process
on malformed input.

What is editable per skill: per-class levels and ratings, target, minimum
position, mana, beats (wait), damage noun, and the wear-off messages (the
object wear-off can be explicitly "unset", which the file writes as `@`).
What is **not**: the skill's name (player files save skills by name and C
code hardcodes lookups — it is the row's identity), its slot (objects
reference spells by slot in `.are` files), and gsn wiring. New skills or new
spell *functions* still require C code.

The spell function is chosen by name from a registry mirroring `const.c`
(98 functions). A safety rule is enforced in the browser, in the server
(400), and in the C loader (row skipped): the *(spell function, target)*
combination must already exist somewhere in the compiled table — magic.c
builds the cast argument from `target` and the function blindly casts it,
so an unproven pairing is a crash vector.

Saves apply at the next **copyover** (the overlay loads at boot only; gsn/slot
bindings and live affects make mid-run swaps unsafe). "Remove overlay" deletes
`skills.dat` and returns the compiled table at the next copyover. Self-test:
`docker exec -w /opt/merc-mud/area merc-mud2.4 ../src/rom --skills-test`.

## Skill groups as data (Phase 8)

Skill **groups** — the bundles behind character-creation costs (`customize`),
`gain`, and training — live in `const.c group_table` and follow the same
overlay pattern: the **Groups** sub-view on the Skills tab edits `groups.dat`,
loaded at boot right after `skills.dat`. Editable per group: the per-class
ratings and the member list. Ratings use the game's sentinel scheme, exposed
in the UI as an "available" toggle: `-1` = not available to that class, `0` =
free/auto (the creation basics), `1+` = cost in creation points or trains.
Group **names** are identity and read-only (player files persist known groups
by name; creation hardcodes the basics/default groups), and groups can only be
modified — never added, removed, or reordered — because every C loop over the
table stops at the first empty row.

Members may name skills *or other groups*, and resolve exactly like the game's
`group_add`: skill first, then group, both by case-insensitive **prefix**
(stock itself relies on this — `illusion` lists `invis`, which resolves to the
skill "invisibility"; the UI shows each member's resolution). Two rules are
enforced in the browser, the server (400), and the C loader (row skipped):
every member must resolve to a compiled skill or group, and membership must
stay **acyclic** — the game's `group_add`/`gn_add` recurse unconditionally, so
any cycle (even a group listing itself) would overflow the stack at the first
login that touches it.

Saves apply at the next **copyover**, same as skills; "Remove overlay" deletes
`groups.dat`. The `rom --skills-test` self-test covers the groups loader too.

## Access guard and audit trail (Phase 9)

Whenever writes are enabled, every mutating request (`PUT`/`POST`/`DELETE`
under `/api/*`) requires a bearer token; requests without one get a 401 and
touch nothing. Reads — the UI, previews, downloads — stay open. There are two
kinds of credential, both sent as `Authorization: Bearer <token>`:

- **The service master key.** Generated by the server on **first run** with
  writes enabled and stored at `<area>/auth/builder-auth.json` on the bind
  mount (Phase 12b — installs that still have the old
  `<area>/backups/builder-auth.json` are migrated automatically at boot) —
  git-ignored, unique per install, surviving container recreation. Read it off
  the host once; it authorizes everything, including key management. It can
  also be rotated **from the host** at any time with
  `pnpm generate-master-key` (optionally `-- --key <value>` to designate the
  key): the file is rewritten atomically, the running server picks it up
  without a restart, and **every API key is revoked** — reprovision them in
  the Access tab afterwards.
- **API keys**, minted in the UI's **Access** tab with the master key. Each
  has a label, can be **rotated** (same key, new secret — the old value dies
  instantly) and **revoked** (permanent). Keys authorize saves but not key
  management. Only sha256 hashes are stored; the plaintext appears exactly
  once, in the show-once box right after create/rotate. The master key itself
  can also be rotated from the Access tab (the browser swaps to the new value
  automatically, and `builder-auth.json` is rewritten).

Paste a token once in the Access tab; it lives in this browser's localStorage
and rides along on every request. The tab reports what the server thinks of
it: master (key management unlocked), API key (saves enabled), or rejected.

Every accepted mutation and key-lifecycle event appends one JSON line to
`<area>/backups/audit.log` — when, method, route, HTTP status, and the acting
credential (`master` or `key:<id> (<label>)`), never a token value. Audit
failure never blocks the save it describes. A corrupt `builder-auth.json`
**locks** the builder (everything 401s) and is never overwritten — it may hold
the only copy of the master key; fix or delete it on the host and restart.
Deleting it deliberately and restarting is also the reset path: a fresh master
is generated and all API keys are gone.

Local development needs none of this: with `MUD_WRITE_ENABLED` unset the guard
is off (there is nothing to protect), and `MUD_BUILDER_AUTH=off` exists to
test write flows locally without tokens — never set it in a deployed compose.

## Importing an existing .are file (Phase 10)

The Areas page's **Import .are file…** control brings an area authored
elsewhere (another builder install, a hand-written file, an old backup) into
the world through the same safety funnel as everything else. Pick a file or
paste its text, then **Validate**: the server runs the full quarantine suite —
parse, canonical round-trip stability (the text it would write must survive
its own parse→emit cycle byte-identically), `#AREA` header and vnum-range
sanity, range overlap against every area in `area.lst`, vnum-reference
integrity, and script validation — and returns a report **without touching
disk**. Errors block the commit outright; warnings (formatting normalization,
cross-area references, an existing file) just inform. The report includes the
entity summary and the exact canonical text a commit would write, downloadable
as a file.

**Commit** re-validates server-side (never trusting a stale report), writes
atomically, and registers new files in `area.lst` (with the same backup
semantics as every other save). A brand-new file loads at the next **copyover**
— hot reload only covers areas the game saw at boot. Replacing an existing
file requires the explicit **overwrite** checkbox, takes a timestamped backup
first, and *can* hot-reload. Imports are mutations: they need a builder token
and appear in the audit log (previews do not — they never write). Uploads are
capped at 2 MB and must be plain text.

The Access tab (master key only) also gains an **Audit log** panel: the most
recent entries from `backups/audit.log`, newest first, via `GET /api/audit`
(read-only — the API never truncates or rewrites the log file).

## Multi-builder safety and real cross-area links (Phase 11)

Two credentials can edit at the same time without silently clobbering each
other. Every area load carries a **content hash** of the on-disk file; the UI
sends it back on save, and if the file changed in between (another builder,
an import) the server answers **409 — nothing is written** and the editor
shows a conflict panel with the two honest ways out: **Reload from disk**
(discard your edits) or **Save anyway** (overwrite theirs — explicit confirm,
their version lands in a timestamped backup first). Saves without a hash keep
the old unconditional behavior, so raw API users are unaffected until they
opt in.

Alongside that, **advisory presence**: while you have an area open, your
credential (key label or `master`) heartbeats every ~20 s. The area sidebar
shows 👥 badges for other builders' open files, and a banner appears inside
the editor when someone else is on *your* file. It is never a lock — entries
expire ~60 s after the last heartbeat (a crashed browser cannot wedge an
area), nothing touches disk, and presence traffic is never audited.

Cross-area references are now **checked, not assumed**. The server keeps a
world vnum index (every mob/object/room in every `area.lst` file, cached per
file and refreshed on change) and resolves each out-of-range reference
against it. A reference that another area really defines shows up as a
**resolved link** — "room #3700 — Entrance to Mud School (school.are)" — in
the preview pane, the import report, and the World dashboard; clicking it
opens the defining area (and selects the room, for rooms). Only vnums that
**no listed area defines** remain warnings, now worded "not defined in this
file or any listed area" — so a warning means a real dangling reference, not
a guess. In-range references to missing entities stay hard errors even when
some other file defines the vnum: that is a range-overlap smell, not a
healthy link.

## World map (Phase 12)

The **Map** tab draws the world instead of listing it. In **Area** mode any
area's rooms render as an SVG grid: exits are compass directions (all ten of
them since Phase 12b — the diagonals own the corner cells and up/down rooms
are placed in the nearest free cell), so the layout walks the exits
breadth-first and most areas fall onto a natural grid — no graph library
involved. Drag to
pan, wheel to zoom. Clicking a room opens it in the Areas tab (same hand-off
as World-dashboard links); cross-area exits appear as dashed **portal stubs**
labeled with the neighboring file and room name, and clicking one swaps the
map to that area. Dangling exits (a target no listed area defines) draw
nothing — the validation warnings are the place to chase those.

**World** mode shows every `area.lst` entry as a node (sized by room count)
with an edge for each real cross-area connection, powered by the Phase 11
world vnum index — link thickness is the number of connecting exits and
hovering an edge lists each one (`#3014 south → #3700 Entrance to Mud
School`). Clicking a node drills into that area's map. Unparseable areas
render dashed red so a broken file is visible at a glance.

Everything map-related is **read-only**: two GET endpoints
(`/api/map/:file`, `/api/map`), no writes, nothing audited, and clicking
never mutates — editing stays on the editing tabs.

The skills/groups overlays also gained the areas' conflict safety: GET
carries a `baseHash` (`null` while the game still runs its compiled stock
table), saves send it back, and a mismatch is a 409 with the same conflict
panel — reload or consciously overwrite, with the loser backed up first.
Saves without a hash (raw API users) stay unconditional.

## Mapping fidelity: the 10-direction rose, teleports, and honest exits (Phase 12b)

The engine itself grew four doors: **northeast, northwest, southeast,
southwest** (doors 6-9 in the `.are` format, commands `ne`/`nw`/`se`/`sw` in
the game). Everything is additive — stock areas load byte-for-byte unchanged —
and every editor surface (room exits, door resets, the map) offers all ten
directions.

Rooms can also **teleport**: a room script (`R <room> entry` in `#SCRIPTS`)
with a `warp <vnum>` line moves anyone who *walks* in — `echo` tells the
walker why, `echoroom` tells everyone else. Warp arrivals never re-trigger the
destination's scripts, so teleports cannot chain. The Scripts tab has an
**+ Add room script** button beside the mob one; room scripts hot-reload like
everything else.

The map now tells the truth about exits instead of drawing plain lines, with a
legend on the page:

- **two-way** passages draw as plain edges; **one-way** exits (no reverse
  exit) get an arrowhead; **non-returning** exits (the reverse door leads
  somewhere *else* — the classic trap) draw dashed red with an arrowhead;
  an exit that **loops back** into its own room draws a small ring.
- Doors (any lock state) mark the edge midpoint with an amber diamond whose
  tooltip names the state (door / pickproof / no-pass).
- Script **teleports** draw as dotted violet arrows — cross-area warps get a
  portal stub just like cross-area exits.

The World dashboard grew **limit-pressure flags** (⚖): for every mob and
object it compares world-wide spawn demand (M / G / E / P resets everywhere)
against the tightest declared reset limit (`-1` = unlimited, `>50` = the old
format's implicit 6). When demand exceeds the limit the *defining* area is
flagged — "once N exist, further resets mostly skip" — which is exactly how a
rare item drifts toward inaccessible. The stock corpus ships with ~44 such
flags (e.g. `ofcol2.are` object #616: 14 resets vs limit 6).

Reference warnings also got honest: anything the world-wide resolver PROVES
undefined now renders as **✖ INVALID** (red) in the preview pane and the
World dashboard — the search already happened, that vnum exists nowhere — while
anything found in another area stays a clickable link. And the select
dropdowns are readable again (the app forces a dark `color-scheme`, so the
native option list no longer paints light-on-light).

## Reset simulator: see what actually spawns (Phase 13)

The Resets tab gained a **Simulate** pane that answers the most common builder
question — *"what does this area actually spawn, where?"* — straight from the
parsed model, before any reload. A pure simulator in `merc-area`
(`simulateResets`) mirrors stock `db.c reset_area` semantics exactly: the
`LastMob` state machine threaded across the whole reset list (an unrelated
reset between an `M` and its `G` can break the chain, just like the real
game), `M` limits, `G`/`E` give-and-equip with the `>50 → 6` / `-1 →
unlimited` limit decoding, `P` into the most-recently-created matching
container, `D` door lock states on both sides, and `R` reported as
"randomized" without inventing an order.

- **Per-room accordion**: every room that receives a spawn shows its mobs with
  full gear trees (equipped slots + carried items, `P`-nested container
  contents recursively), room objects with contents, door states, and a
  randomized-exits marker. Identical loadouts group into one entry with a
  count ("3 guards"); any gear variance keeps entries separate.
- **Warnings, not silence**: the cases `db.c` silently skips — broken vnum
  refs, a `G`/`E` with no live mob, a `P` with no container — surface as
  warnings at the top. Cross-area vnums resolve through the world index
  (Phase 11), so stock files simulate warning-free.
- **Boot-state only**, and the pane says so: it models a fresh boot with empty
  rooms — repop drift from players and kills is out of scope.
- **Click-through both ways**: each room in the Areas editor offers "See what
  spawns here →" (jumps to the Simulate pane filtered to that room), and the
  **Map tab grew a "Spawns" toggle** that overlays per-room mob counts as
  green badges on the room nodes, with a legend entry while it's on.
- Everything is read-only (`GET /api/areas/:file/spawn`) and reflects the
  last **saved** state, like the World and Map tabs — the MUD is never
  involved, let alone restarted.

## New spells: C codegen assist (Phase 14a)

The Skills tab gained a third sub-view — **"New spell (codegen)"** — that lets a builder
author a brand-new spell declaratively and get back a reviewable C patch, without ever
writing, compiling, or deploying anything themselves.

- **Scope correction, stated plainly:** skill DATA has been authorable via skills.dat
  since Phase 7, but skills.dat can only overlay data onto a row that **already exists**
  in the compiled `skill_table[]` — the C loader (`load_skills_overlay`) skips any row
  whose name it doesn't already recognize, every boot, forever. A brand-new spell's
  deployable artifact is therefore **not** a skills.dat row; it's a fourth patch section —
  a new `skill_table[]` struct literal in `const.c`. `MAX_SKILL` (150) has deliberate
  headroom over the ~100 stock rows for exactly this. Once that section is compiled in,
  the spell is an ordinary stock row from then on, editable via the existing Skills
  sub-view like "armor" or "bless" always have been.
- **Closed archetype set, each lifted from a real stock spell body, not invented:**
  `damage` (`spell_flamestrike`/`spell_acid_blast` shape — `dice(base + level/div, size)`,
  optional save-halves), `buff` (`spell_armor` — no save, self/other guard messages),
  `debuff` (`spell_blindness` — bitvector-gated guard, save negates), `heal`
  (`spell_cure_light` shape), `cure` (`spell_cure_blindness` shape, strips an existing
  compiled condition — blindness/poison/plague — never invents a new one).
- **The generated patch has four labeled sections** (`magic.h` decl, `magic.c` function,
  `skills_data.c` fun_registry line, `const.c` skill_table row), each anchored to a
  verbatim quoted line from current source — never a line number, since those drift.
  const.c's anchor is deliberately an "insert BEFORE the next entry" anchor, not "insert
  after the previous one": that array's entries are multi-line struct literals, so
  anchoring on a predecessor's mere opening line would land the insertion in the middle of
  that predecessor's own entry.
- **Nothing is ever auto-deployed.** Specs persist as builder metadata in
  `<area>/codegen/spells.json` (the game never reads this file); the patch is
  preview-and-download only. Applying it to `merc-mud/2.4/src`, compiling, and
  redeploying the engine stays a human action.
- **Verified end-to-end** (2026-07-24): a generated "spark bolt" damage spell was applied
  to a scratch copy of the engine, compiled cleanly, booted in a throwaway container, and
  actually cast in a live session — `skill_lookup` resolved it by name, mana was deducted
  correctly, and it dealt damage exactly per its spec. A follow-up review pass
  compile-verified all five archetype templates together in one scratch build (zero
  compiler warnings), with each new row proven to resolve by name at boot via a skills.dat
  overlay naming all five ("5 row(s) applied, 0 skipped" + `rom --skills-test` ALL PASS).

## Guarantees (and their limits)

- Anything the emitter writes re-parses identically and boots in unmodified
  `db.c` (round-trip suite covers every file in `area.lst`). Flag vectors are
  written in the traditional letter form (`ABT`-style), matching hand-written
  area files; decimal appears only for values letters cannot express
  (negatives, bits past `z`).
- A hot reload either fully applies or fully doesn't; there is no partial
  state. String memory is interned exactly like boot-time strings, so sharing
  with live mobs/objects is safe by construction and repeated reloads of
  unchanged text cost zero bytes.
- Known accepted drift: prototype deletions wait for a copyover; editing the
  affects of an object type someone is currently wearing re-resolves on
  removal (stock OLC behavior); `kill_table` level counts only grow. Likewise,
  already-spawned mobs/objects keep their old name/description strings until
  they repop (instances share prototype string pointers at creation time) —
  but hot-reloaded **scripts** apply to live mobs immediately, because
  triggers always read the prototype.

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

Everything a `.are` file holds is now authorable in the UI: the #AREA header,
rooms, mobs, objects, resets, shops, specials, socials, and mob scripts —
including creating and deleting entities with reference-integrity checking,
creating brand-new area files registered in `area.lst` (first load via
copyover), and a read-only World dashboard across the whole `area.lst`. The
builder is deployed at `build.shatteredarchive.dev` in the experimental stack
(the only environment with writes enabled). Skill/spell **data** is authorable
via the Skills tab (`skills.dat` boot overlay, Phase 7), and skill-group
ratings/membership via its Groups sub-view (`groups.dat`, Phase 8); new
skills, new spell functions, and new groups remain C work. Deployed writes
are protected by the bearer-token guard with UI-managed API keys, and every
mutation lands in the audit log (Phase 9). Existing `.are` files can be
imported through quarantine validation (nothing touches disk until the report
is clean), and the master key can browse the audit trail in the Access tab
(Phase 10). Concurrent editing is safe: saves are hash-conditional (409 +
conflict panel instead of silent last-write-wins), builders see who else is
editing what, and cross-area vnum references resolve against the real world
index into navigable links — only genuinely dangling vnums warn (Phase 11).
The Map tab visualizes any area as a pan/zoom room grid and the whole world
as an area graph built from real resolved exits, with click-through to the
editors; skills.dat/groups.dat saves are hash-conditional like areas
(Phase 12). The engine speaks ten directions (NE/NW/SE/SW doors 6-9, an
additive C extension), rooms can teleport walkers via hot-reloadable room
scripts, the map classifies every exit honestly (one-way, non-returning,
loop-back, door-blocked, teleport — with a legend), resets display as
color-grouped mob units that move as one, the World dashboard flags
limit-pressured mobs/objects and proven-undefined refs as INVALID, and the
master key lives in `<area>/auth/` with a host-side rotation script
(`pnpm generate-master-key`) that revokes all API keys (Phase 12b). A
read-only reset simulator mirroring `db.c reset_area` shows the post-boot
spawn state per room — mobs with gear trees, container contents, door states,
warnings for what db.c silently skips — in the Resets tab's Simulate pane,
linked from each room editor, and as an optional mob-count badge overlay on
the area map (Phase 13).
