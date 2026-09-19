# Plan: Auto-leveling Combat step — ability-picker correctness + searchable/alphabetized selects

Created: 2026-09-13T01:00:00Z · Workspace: /workspace/shattered-archive · Status: ACTIVE
Task: Fix the Combat step's buff-add picker leaking OTHER classes' spells into every class's
list, make songs actually show up for the classes that get them, and make both the buff-add
and fight-command-add pickers alphabetized and live-filterable by typing.

## Goal
A player on the Combat step's "Add a buff…" dropdown sees, in order of priority: (1) their
selected class's OWN buff-ish spells/songs (not every spell in a matching ability group, not
another class's spells) — sourced from the real per-class catalog; (2) ONLY when that class has
none defined, a generic fallback list (today's `BUFF_CATALOG`). Songs show up for the classes
that actually get them (Bard/Skald/Ovate/Charlatan/Brewmaster/Jongleur). Both the buff-add and
fight-command-add dropdowns are alphabetized and support live-typing to filter the list. Done
when a Shukenja-only spell no longer appears for a non-Shukenja class, a Skald's chants/hymns
appear in its pickers, both pickers are alphabetized + filterable, and the existing wizard test
suite + tsc stay green.

## Constraints
- pnpm via Corepack only; `--frozen-lockfile`.
- No C# changes — the root cause is fully client-side (the server already projects each class's
  OWN abilities correctly; see Context). Everything lives in `apps/game-client`.
- Don't build a new "OFFENSE_CATALOG" generic fallback for the fight-command picker — the user's
  complaint and the described fallback hierarchy were specifically about buffs, and no such
  generic list exists there today. Only extend the fight-command picker with the alphabetize +
  live-filter UX pieces, not a new generic-fallback data source.
- `BUFF_CATALOG` remains the generic fallback list (it already is a hand-verified, cross-class
  "common buffs" list with real cmd+GMCP-affect metadata) — don't build a second, broader
  pooled-across-all-classes list; just gate its visibility on the selected class having nothing
  of its own.
- Adding the 3 song-only group names to BOTH `BUFF_GROUPS` and `OFFENSIVE_GROUPS` (rather than
  hand-classifying ~30 individual songs into buff vs. offense) is a deliberate, coarser choice —
  a song appearing in both add-pickers is a minor UX rough edge, not a correctness bug, since the
  player still explicitly picks what to add either way.
- New picker component must stay a real `<select>`-shaped control from the DOM's perspective for
  existing screenshot/E2E conventions where reasonable, or clearly documented if it can't be
  (e.g. an ARIA combobox) — check how other wizard steps are screenshot-tested before deciding.

## Context
- **Root cause #1 (cross-class leakage):** `CombatStep.tsx:493-516` renders an ALWAYS-VISIBLE
  `<optgroup label="Verified catalog">` of every `BUFF_CATALOG` entry, unconditionally, alongside
  a conditionally-shown `<optgroup label="${playerClass} spells">` of `classBuffs`. `BUFF_CATALOG`
  (`autoleveling-buff-catalog.ts:29-52`) includes `'Blessing of Peace'` and `'Ancestral Honor'` —
  confirmed via `C:/Projects/DSL/Server/Server.Dsl/ClassAbilityGroups/Shukenja.cs:17-22` to be
  Shukenja-group-only spells (`BlessingOfPeace()`, `AncestralHonor()`) — so every OTHER class's
  buff picker shows them too. `classBuffs`/`classOffense` themselves
  (`autoleveling-classes.ts:139-154`, `classBuffAbilities`/`classOffensiveAbilities`) already
  correctly filter to the selected class's OWN `cls.abilities` — confirmed server-side in
  `C:/Projects/DSL/Server/Server.Dsl/Cache/AutoPilotClassCache.cs:88-92` (`BuildAbilities` unions
  ONLY `cls.Skills`/`cls.Spells`/`cls.Songs` — never another class's). The bug is purely the
  UNCONDITIONAL catalog optgroup, not the class-scoped one.
- **Root cause #2 (songs invisible everywhere):** `AutoPilotClassCache.GroupsFor`
  (`AutoPilotClassCache.cs:140-162`) tags each ability with its real `IAbilityGroup` semantic
  group name(s). Confirmed exactly 3 group classes carry `GroupType.Songs`:
  `HymnsOfLife`/`SkaldChants`/`WarHymns`
  (`C:/Projects/DSL/Server/Server.Dsl/ClassAbilityGroups/{HymnsOfLife,SkaldChants,WarHymns}.cs`).
  None of these 3 names appear in the client's `BUFF_GROUPS` or `OFFENSIVE_GROUPS`
  (`autoleveling-classes.ts:88-108`), so `anyGroup()` never matches ANY song ability, for ANY
  class, regardless of the (already-correct) per-class filtering. Confirmed which classes
  actually get these groups (so "relevant classes" isn't a guess):
  `grep 'SkaldChants|WarHymns|HymnsOfLife' Server.Dsl/Classes/*.cs` → Bard, Charlatan, Brewmaster,
  Jongleur, Ovate (WarHymns@8 + HymnsOfLife@6), Skald (also SkaldChants@8).
- `autoleveling-classes.ts:139-154` — `classBuffAbilities`/`classOffensiveAbilities`, the two
  functions to extend (just the `BUFF_GROUPS`/`OFFENSIVE_GROUPS` constants, `:88-108`).
- `autoleveling-classes.test.ts` — existing test file for this module; add coverage here.
- `CombatStep.tsx:361-372` `addClassBuff` — already cross-references `BUFF_CATALOG` by
  label/affect match when adding a CLASS ability (for the verified cmd+affect), falling back to
  an `unverified: true` best-guess row otherwise. This logic is CORRECT and untouched by this
  plan — only the dropdown's OPTION LIST (what's offered, not what happens on pick) is the bug.
- `CombatStep.tsx:391-397` `addClassFight`, `:674-688` its `<select>` — the fight-command
  equivalent picker. No unconditional generic-catalog leak here (no fallback list exists at all
  today — the dropdown just doesn't render when `classOffense.length === 0`), but the same
  alphabetize + live-filter UX gap applies.
- `CombatStep.tsx:256-257` `catalogPick`/`fightPick` state, `:282` `levelTag` helper — existing
  plumbing the new component should slot into rather than duplicate.
- No existing searchable-select/combobox component anywhere in `apps/game-client/src` — this is
  new. No `CombatStep.test.tsx` exists either — this step's own UI pieces are screenshot/manual
  verified, matching the precedent set by the companion combat-rest-tuning plan's UI-only steps
  (e.g. its step 2, step 7).
- Companion plan `.ai-plans/20260912-1629-autoleveling-combat-rest-tuning.md` is ALSO mid-flight
  against `CombatStep.tsx` (steps 10/11 add a Weight step + a live-apply button to this same
  file). Check its Progress log for anything landing in `CombatStep.tsx` after this plan's own
  last entry before editing that file, and vice versa — same file, concurrent work.

## Steps

### [x] 1. Ability-group taxonomy fix — songs
- Do: Add `'HymnsOfLife'`, `'SkaldChants'`, `'WarHymns'` to BOTH `BUFF_GROUPS` and
  `OFFENSIVE_GROUPS` in autoleveling-classes.ts (per Constraints — deliberately not
  hand-classifying individual songs). Add a short comment above each list noting these are the
  server's real `GroupType.Songs` group names (not generic categories like the rest), so a
  future reader isn't confused by the naming-convention mismatch.
- Files: apps/game-client/src/features/autoleveling/autoleveling-classes.ts
- Verify: new unit test in autoleveling-classes.test.ts — a fixture class with a `type:'song'`
  ability tagged `groups:['WarHymns']` (etc. for the other two) IS returned by both
  `classBuffAbilities` and `classOffensiveAbilities`; a song tagged with an unrelated group
  still is NOT. `pnpm --filter game-client test` + `tsc` green.

### [x] 2. Buff-picker fallback ordering — class-defined first, generic catalog only when empty
- Do: In CombatStep.tsx's buff `<select>` (`:493-516`), swap the fixed always-both-optgroups
  layout for a priority order: render the `${playerClass} spells` optgroup (from `classBuffs`)
  whenever `classBuffs.length > 0`; render the `Verified catalog` optgroup (`BUFF_CATALOG`) ONLY
  when `classBuffs.length === 0` (covers: no class picked yet, or a class whose real ability
  data has nothing group-tagged as buff-ish). Keep `pickBuff`/`addFromCatalog`/`addClassBuff`
  logic untouched — this step only changes which optgroup(s) render, not what happens on pick.
- Files: apps/game-client/src/components/wizard/CombatStep.tsx
- Verify: screenshot/manual check — pick a class with real buff abilities (e.g. Cleric) and
  confirm "Blessing of Peace"/"Ancestral Honor" (Shukenja-only) are NOT in its dropdown, only its
  own spells are; pick a class (or no class) with none and confirm the generic catalog still
  appears as a fallback. `tsc` green.

### [x] 3. Searchable, alphabetized picker component — wire into both add-dropdowns
- Do: Build a small reusable filterable-select control (new file, e.g.
  `components/wizard/FilterableSelect.tsx`) — a text input that filters a flat option list
  live-as-you-type (case-insensitive substring match) and commits a pick (click or Enter) the
  same way the existing `<select onChange>` pattern does today, so it drops into `pickBuff`/
  `addClassFight` without changing their signatures. Alphabetize every option list feeding it
  (`BUFF_CATALOG` by label, `classBuffs`/`classOffense` by `.name` — these currently arrive
  level-sorted from the server, per Context, so sort client-side at render time; don't mutate
  the exported arrays or change their order for other consumers). Replace both the buff-add
  `<select>` (`:493-516`) and the fight-command-add `<select>` (`:674-688`) with it, preserving
  the existing optgroup-equivalent grouping (class list vs. fallback catalog) as visually
  distinct sections within the filtered results.
- Files: apps/game-client/src/components/wizard/FilterableSelect.tsx (new)
  apps/game-client/src/components/wizard/CombatStep.tsx
  apps/game-client/src/styles/AutoLevelingWizard.module.scss
- Verify: screenshot/manual check — typing a partial name narrows both pickers' visible options;
  options appear alphabetically; picking still adds the right row (spot-check one class-sourced
  and one catalog-sourced buff, and one fight ability); keyboard usable (arrow keys / Enter),
  not just mouse. `tsc` green, `pnpm --filter game-client test` green (no regressions).

## Progress log

- 2026-09-13T02:45:00Z addendum — user said the "Generic catalog" fallback (renamed from
  "Verified catalog" in step 2) should just go away, and that the buff picker should instead
  categorize by ability TYPE (skills/spells/songs) and show whatever the selected class actually
  has — full stop, no group-based buff-vs-attack guessing at all. This directly follows the
  addendum above (Berserk/Faerie Fire) — three straight corrections to the same group-heuristic
  made clear it was the wrong mechanism, not just missing a couple of entries. Removed it
  entirely: `classBuffAbilities`/`BUFF_GROUPS`/`BUFF_SKILL_NAMES` deleted from
  autoleveling-classes.ts (dead once nothing calls them — verified no other consumers first);
  the buff picker now calls the already-existing, unfiltered `abilitiesForClass(catalog,
  playerClass)` and groups the `FilterableSelect` options by `a.type` (Skills/Spells/Songs,
  alphabetized within each) instead of by buff-group membership. `addClassBuff` picked up a real
  latent bug this surfaced: its `unverified` fallback always guessed `cast '<name>'` + an
  affect-name gate, which is wrong for a skill-type ability (skills are bare commands and rarely
  register a GMCP affect) — previously masked because `classBuffAbilities` categorically excluded
  skills except the one BUFF_CATALOG-covered case (berserk); now that EVERY class skill can reach
  the buff picker, fixed it to guess a bare command + tick-gate for skills, matching Berserk's
  own established convention. `pickBuff`'s `cat:`/`cls:` prefix dispatch is gone too (only one
  option source now, so `onPick` calls `addClassBuff` directly) — `addFromCatalog`/`BUFF_CATALOG`
  itself stays, still used internally by `addClassBuff` for the verified-cmd+affect cross-
  reference when a class ability happens to match a known catalog entry by name. The
  fight-command picker is UNCHANGED (still `classOffensiveAbilities`/`OFFENSIVE_GROUPS`-filtered)
  — the user's ask was specifically about buffs; left fight-commands alone rather than assuming
  the same treatment was wanted there too. Per the user's own "Later: we will utilize the C#
  definition to categorize skills/spells/songs" — this whole group-heuristic (including the
  still-standing fight-command one) is understood to be an interim measure the new DSL-repo
  ability-classification admin plan will eventually replace outright. Updated
  autoleveling-classes.test.ts (removed the deleted function's tests, trimmed the now-buff-only
  assertions out of the Weather/songs fixture tests); 369/369 total tests + tsc green. Refreshed
  both `.annotated` files.

- 2026-09-13T02:00:00Z addendum — user corrected two specific miscategorizations found after
  the picker fix landed: Berserk was showing as a fight command instead of a buff, and Faerie
  Fire wasn't reachable as the combat debuff it is. Root causes: Berserk is a SKILL, and
  `classBuffAbilities` categorically excludes all skills (`a.type !== 'skill'`) — it could only
  ever reach the buff picker via the generic `BUFF_CATALOG` fallback, which step 2 now hides
  whenever the class has ANY real buff spells, so it silently disappeared for most
  Berserk-capable classes; it was ALSO still in `COMBAT_SKILL_NAMES`, so it kept showing under
  fight commands too. Fixed with a new `BUFF_SKILL_NAMES` constant (mirroring
  `COMBAT_SKILL_NAMES`, just for the buff side) containing `berserk`, wired into
  `classBuffAbilities` the same way `COMBAT_SKILL_NAMES` is wired into `classOffensiveAbilities`;
  removed `berserk` from `COMBAT_SKILL_NAMES`. Faerie Fire's only real ability-group, confirmed
  in `Server.Dsl/ClassAbilityGroups/Weather.cs`, is `Weather` — not in `BUFF_GROUPS` OR
  `OFFENSIVE_GROUPS`, so it wasn't reachable via either picker at all; the group is mostly attack
  spells (Call Lightning, Lightning Bolt, Tornado) plus Faerie Fire itself, so added `'Weather'`
  to `OFFENSIVE_GROUPS` wholesale rather than building a per-ability override for one spell.
  Updated the 2 existing tests that encoded the old Berserk behavior + added a Weather/Faerie
  Fire fixture test; 370/370 total tests + tsc green. Refreshed
  `features/autoleveling/.annotated`.

- 2026-09-13T01:45:00Z steps 2 + 3 done — checked `[x]` both, done together since step 3's
  component replacement made step 2's original hand-edit to the native `<select>` moot within
  the same sitting. Step 2: swapped `CombatStep.tsx`'s buff `<select>` (`:489-516` pre-edit) to
  render `classBuffs` as the primary optgroup whenever non-empty, `BUFF_CATALOG` only as a
  fallback when empty — no change to `pickBuff`/`addFromCatalog`/`addClassBuff`. Step 3: new
  `components/wizard/FilterableSelect.tsx` — a text input that filters a flat option list
  live-as-you-type (case-insensitive substring on `label`), renders a positioned dropdown list
  grouped by consecutive-same-`group` headers (mirrors `<optgroup>`), commits via mouse or
  Enter, arrow-key navigable, closes on outside click or Escape; takes `onPick(value)` so it
  drops into the existing `pickBuff`/`addClassFight` callbacks unchanged. Built `buffOptions`/
  `fightOptions` in CombatStep.tsx (alphabetized by `.localeCompare` at render time — the server
  sends abilities level-sorted, per the plan's Context, so this doesn't mutate any shared array)
  and replaced both native `<select>`s with it; removed the now-dead `catalogPick`/`fightPick`
  state (FilterableSelect owns its own display text, no external `value` needed). Added matching
  SCSS (`.filterableSelect*` block in AutoLevelingWizard.module.scss, visually consistent with
  the existing `.select` dark-input styling). Refreshed `components/wizard/.annotated` and
  `features/autoleveling/.annotated`. No new automated tests for this step (pure UI wiring onto
  already-tested engine/data logic, matching the precedent set by the companion plan's UI-only
  steps) — full suite (369/369) + tsc stayed green throughout. **Not yet screenshot/live
  verified** — the game-client dev server wasn't running this session and per standing guidance
  it's never started in the background; please open the wizard's Combat step with a class
  selected (e.g. Cleric) and confirm: no Shukenja-only spells in the buff picker, a Skald/Bard's
  songs actually appear, both pickers are alphabetized, and typing narrows the list.

- 2026-09-13T01:15:00Z step 1 done — checked `[x]`. Added a `SONG_GROUPS` constant
  (`['HymnsOfLife','SkaldChants','WarHymns']`, with a comment explaining why these look
  different from the rest of the list) and spread it into both `BUFF_GROUPS` and
  `OFFENSIVE_GROUPS` in autoleveling-classes.ts. 1 new test (a fixture Bard with songs tagged
  `HymnsOfLife`/`WarHymns`/an unrelated group — the first two show up in both
  `classBuffAbilities` and `classOffensiveAbilities`, the unrelated one in neither); 369/369
  total tests + tsc green.

- 2026-09-13T01:00:00Z plan created — user reported the Combat step's pre-round buff picker
  showing spells from an unrelated class ("shukenja spells"). Traced to two independent root
  causes rather than guessing: (1) `CombatStep.tsx`'s buff `<select>` renders the hardcoded
  `BUFF_CATALOG` "Verified catalog" optgroup UNCONDITIONALLY alongside the class-scoped one —
  and `BUFF_CATALOG` happens to include two spells (`Blessing of Peace`, `Ancestral Honor`)
  confirmed via the actual C# source (`Server.Dsl/ClassAbilityGroups/Shukenja.cs`) to be
  Shukenja-only. The class-scoped list (`classBuffAbilities`) was already correctly filtered to
  the selected class's own abilities — verified server-side too
  (`AutoPilotClassCache.BuildAbilities` unions only that class's own Skills/Spells/Songs
  dictionaries, never another class's). (2) Songs never appear in EITHER picker for ANY class —
  the server tags song abilities with 3 real semantic group names
  (`HymnsOfLife`/`SkaldChants`/`WarHymns`, confirmed via `ClassAbilityGroups/*.cs` and which
  classes reference them: Bard/Charlatan/Brewmaster/Jongleur/Ovate/Skald) that were simply never
  added to the client's `BUFF_GROUPS`/`OFFENSIVE_GROUPS` lists. Also folded in the user's UX asks
  (alphabetize, live-typing filter) as step 3, building one small reusable component for both the
  buff-add and fight-command-add pickers rather than duplicating filter logic twice. Kept this as
  a separate plan from the concurrent `20260912-1629-autoleveling-combat-rest-tuning.md` (weight
  gate / live hot-swap work) since it's a distinct, unrelated concern (picker correctness, not
  round/rest/weight mechanics) even though both touch `CombatStep.tsx` — cross-linked both docs'
  Context sections so an implementer checks the other's Progress log before editing that shared
  file.
