# Plan: MUD Builder — Phase 14a (new-spell C codegen assist: spec → reviewable patch, never auto-deployed)

Created: 2026-07-23T17:59:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Let a builder author a NEW spell declaratively in the UI and get a complete, reviewable
C patch (magic.h decl + magic.c function + skills_data.c registry row) generated from safe
templates, plus the paired skills.dat overlay row — the builder NEVER writes to merc-mud src,
never compiles, never deploys.

## Goal
A builder fills a spec form (archetype, target, dice scaling, saves, affect, messages) and
sees the generated C live: a 4-section patch (magic.h decl, magic.c function, skills_data.c
fun_registry line, AND a new const.c skill_table row — see the 2026-07-24T01:30 progress-log
correction for why the row lives in const.c, not skills.dat) plus an informational preview of
what the skill will look like once deployed. Specs persist server-side in
`<area>/codegen/spells.json` so patches regenerate. Done when a generated spell patch applies
cleanly to a SCRATCH copy of merc-mud, compiles, boots, and the new skill resolves BY NAME
(skill_lookup / `rom --skills-test` sees it, not just "table intact") — and the live game was
never touched (StartedAt discipline).

## Constraints
- **STABILITY IS KING — hard boundary:** the builder NEVER writes into `merc-mud/2.4/src`,
  never triggers a compile, never deploys. Codegen output is preview + download + server-side
  spec storage only. Engine deployment stays a HUMAN action (apply patch, rebuild the game
  image, compose recreate — brief dev-time downtime is user-approved). If any step seems to
  need the builder touching the C checkout, the step is wrong — stop and re-read this line.
- **Generated C composes ONLY proven stock primitives** — `damage()`, `affect_to_char()`,
  `saves_spell()`, `act()`, `send_to_char()`, and the exact body shapes of existing stock
  spells (see Context). No freeform C from the user, ever: the spec is declarative and the
  template set is closed. Each archetype's template must be derived by READING a stock spell
  of that shape, not written from memory.
- **The (fun,target) crash guard stays absolute** (Phase 7): magic.c builds `vo` from the
  skill row's target and the fun casts it — a mismatched pair crashes the game. An overlay
  row's pair must match either `STOCK_FUN_TARGET_PAIRS` or a stored spec that declares
  EXACTLY that (funName, target). The C loader remains the last gate (unknown fun =
  `bug()`+skip at boot, never a crash) — nothing in this phase weakens it.
- **Naming rules:** funName must match `/^spell_[a-z_]+$/` and not collide with the existing
  `fun_registry` (98 entries, alphabetical) — collision check against merc-area's generated
  `SKILL_SPELL_FUNS`. Skill name must not collide with `STOCK_SKILLS` names or existing
  overlay rows (name = row identity, player saves depend on it — Phase 7).
- `<area>/codegen/spells.json` is builder metadata — the game NEVER reads it. Writes to it
  are gated (bearer guard) and audited like any mutation. Follow the Phase 9 middleware
  order (guard → audit → routes) and the first-parser-wins gotcha (any new `express.json`
  must be scope-mounted, never app-wide before existing parsers).
- merc-area stays the dependency-free base package: ALL pure logic (spec model, validation,
  generation) lives there; the server only stores and serves.
- pnpm quirk: no `--` before positional args (`pnpm --filter <pkg> <script> <args>`).
- qwen (container) must NOT run pnpm install|build|test; JS verification is a HOST task.

## Context
(all file:line refs verified 2026-07-23 against current source)
- Registry to patch: `/workspace/merc-mud/2.4/src/skills_data.c:47-51` —
  `static const struct { const char *name; SPELL_FUN *fun; } fun_registry[]`,
  alphabetical, NULL-terminated; exact-match lookup at `:156-159`. A new spell adds ONE line
  in alphabetical position. `SKILLS_NULL_SENTINEL "@"` at `:45` (msg_obj null form).
- Spell signature: `void spell_x(int sn, int level, CHAR_DATA *ch, void *vo, int target)` —
  see `/workspace/merc-mud/2.4/src/magic.c:688` (spell_armor).
- Targets: `/workspace/merc-mud/2.4/src/merc.h:1663-1669` — TAR_IGNORE 0,
  TAR_CHAR_OFFENSIVE 1, TAR_CHAR_DEFENSIVE 2, TAR_CHAR_SELF 3, TAR_OBJ_INV 4,
  TAR_OBJ_CHAR_DEF 5, TAR_OBJ_CHAR_OFF 6. Archetype→target compatibility: damage →
  TAR_CHAR_OFFENSIVE; affect(buff) → TAR_CHAR_DEFENSIVE|TAR_CHAR_SELF; affect(debuff) →
  TAR_CHAR_OFFENSIVE; heal/cure → TAR_CHAR_DEFENSIVE.
- Template reference bodies (READ these before writing templates): magic.c
  `spell_magic_missile` (damage w/ per-level table + saves-half), `spell_armor`/`spell_bless`
  (AFFECT_DATA apply w/ already-affected guard + wear-off), `spell_cure_light` (heal:
  `dice(1,8)+level/3`, cap at max_hit, update_pos), `spell_cure_blindness` (cure: check
  is_affected, affect_strip, act messages). Executor: quote the actual lines into the
  template fixtures, don't paraphrase.
- TS validation seam: `/workspace/shattered-archive/services/merc-area/src/skills.ts:29`
  imports `SKILL_SPELL_FUNS, STOCK_FUN_TARGET_PAIRS, STOCK_SKILLS` from generated
  `skills-stock.ts`; `:66` `knownPairs` Set; `:179` `validateSkills(file)`.
- Server skills routes: `/workspace/shattered-archive/apps/mud-builder-server/src/routes/skills.ts`
  (exports `readBaseHash`, shared by groups.ts; overlay stores use baseHash-conditional
  writes with null = stock sentinel — Phase 12 pattern to copy for the codegen store).
- Client Skills tab: `/workspace/shattered-archive/apps/mud-builder-client/src/features/skills/SkillsPage.tsx`
  with `GroupsView.tsx` as the existing sub-view precedent (standalone fetch flow, NOT the
  area workbench; ConflictPanel from `../areas/workbench.js:320`).
- Audit exclusions idiom (for what NOT to copy — codegen writes ARE audited):
  `/workspace/shattered-archive/apps/mud-builder-server/src/audit.ts:52`.
- UI layout: compact grouped `mb-field` forms — RoomEditor is the reference idiom
  (never .mb-form-row/script-editor CSS reuse).
- Game image build (for the scratch-compile E2E): the game's compose lives at
  `/workspace/merc-mud/docker-compose.yml` — discover its Dockerfile/build context at
  execution time; the E2E must build a THROWAWAY tag, never the live image's tag.

## Steps
### [x] 1. (CLAUDE) merc-area: SpellSpec model + validation
- Do: new `spell-spec.ts` in `/workspace/shattered-archive/services/merc-area/src/`. Types:
  `SpellSpec { name; funName; archetype: 'damage'|'affect'|'heal'|'cure'; target: number;
  damage?: {baseDice: [n,size], perLevelDice?, saveType: 'none'|'half'|'negate', damageNoun};
  affect?: {location: number, modifierExpr: 'flat:<n>'|'perLevel:<div>', durationExpr,
  bitvector: number, alreadyAffectedMsg, wearOffMsg}; heal?: {dice: [n,size], levelDiv};
  cure?: {strippedSn: string, notAffectedMsg}; messages: {victim?, room?}; datDefaults:
  {levels: [4 classes], ratings: [4], mana, lag, msgOff?} }`. `validateSpellSpec(spec,
  {existingOverlayNames})`: funName regex + collision vs `SKILL_SPELL_FUNS`; name collision
  vs `STOCK_SKILLS` + overlay names; archetype/target compatibility matrix (Context); dice
  bounds (n,size ≥ 1, ≤ 50); duration/modifier expr parse. Export from `index.ts`.
- Files: /workspace/shattered-archive/services/merc-area/src/spell-spec.ts (new),
  src/spell-spec.test.ts (new), src/index.ts
- Verify (HOST): `pnpm --filter @shatteredarchive/merc-area test` green;
  `pnpm --filter @shatteredarchive/merc-area build` clean (server work resolves built dist).

### [x] 2. (CLAUDE) merc-area: C generator + .dat row generator with golden-file tests
- Do: `generateSpellC(spec)` → `{ magicHDecl: string; magicCFunction: string; registryLine:
  string; registryAnchor: {after: string} ; patchText: string }`. Templates per archetype
  built from the ACTUAL stock bodies named in Context (read them first; fixture-quote the
  shapes). `registryAnchor.after` = the alphabetically-preceding existing registry name so a
  human (or later tooling) inserts deterministically; patchText = a single human-applyable
  document: three labeled sections (`--- magic.h`, `--- magic.c`, `--- skills_data.c`) each
  with an unambiguous INSERT AFTER anchor line quoted verbatim from current source + the new
  block. NO line numbers (files drift). Also `generateOverlayRow(spec) → SkillEntry` (slot
  never emitted — Phase 7; msg_obj null via the "@" convention handled by the existing
  emitter). Golden tests: one checked-in expected `.c` function per archetype under
  `src/__fixtures__/spell-codegen/`, asserted byte-exact; registry line alphabetical-anchor
  test; overlay row round-trips through the existing skills emitter/parser.
- Files: /workspace/shattered-archive/services/merc-area/src/spell-codegen.ts (new),
  src/spell-codegen.test.ts (new), src/__fixtures__/spell-codegen/* (new), src/index.ts
- Verify (HOST): merc-area suite green; build clean.

### [x] 3. (CLAUDE) Server: codegen spec store + routes
- Do: `CodegenStore` (`codegen-store.ts`, constructor takes the area dir like AuthStore):
  `list()`, `hash()` (sha256 of file bytes, null = no file — Phase 12 overlay sentinel),
  `write(specs, {baseHash})` (AreaConflictError on mismatch, atomic tmp+rename into
  `<area>/codegen/spells.json`, create dir on demand), `readSpecs()` tolerant of a missing
  file (= []). Routes `routes/codegen.ts`: `GET /api/codegen/spells` (open; {specs,
  baseHash}), `PUT /api/codegen/spells` (guarded by the standard bearer flow — writes are
  audited automatically by middleware order; validate EVERY spec via validateSpellSpec
  before write, 400 on any error), `GET /api/codegen/spells/:funName/patch` (open;
  text/plain patchText regenerated on the fly; 404 unknown funName). Register in app.ts
  AFTER the audit middleware like every other route. Tests: guard 401, audit line appears
  on PUT, 409 conflict, invalid spec 400, patch download content, missing-file GET = [].
- Files: /workspace/shattered-archive/apps/mud-builder-server/src/codegen-store.ts (new),
  src/routes/codegen.ts (new), src/routes/codegen.test.ts (new), src/app.ts
- Verify (HOST): `pnpm --filter @shatteredarchive/mud-builder-server test` green; build
  clean. REMEMBER: rebuild merc-area first or its new exports won't resolve.

### [x] 4. (CLAUDE) merc-area: const.c skill_table row generator (replaces the skills.dat idea)
- **OBSOLETES the original step 4 ("manifest-aware (fun,target) validation").** Verified
  2026-07-24 against skills_data.c:189-199,285-291 (`sk_find_skill`/`load_skills_overlay`):
  the C loader SKIPS any skills.dat row whose name isn't already in the compiled
  `skill_table[]` — skills.dat can only overlay DATA on an EXISTING row, never introduce a
  new name. const.c has exactly one "reserved" placeholder (row 0), already excluded — no
  pool of blank slots. So a manifest-aware downgrade to validateSkills would guard a
  pathway (a not-yet-compiled fun/target reaching skills.dat) that can never actually be
  reached: a new spell's data was never going into skills.dat in the first place. Dropped
  in full, not implemented.
- Do: `MAX_SKILL` is 150 (`merc.h:121`) while the stock table fills ~100 rows — confirmed
  headroom exists to append new struct literals to `skill_table[MAX_SKILL]`'s initializer
  in const.c, no size bump needed. Extend `generateSpellC` (spell-codegen.ts, already built
  in step 2) with a fourth section: `constCRow: string` + `constCAnchor: {after: string}`
  (same alphabetical-predecessor-over-SKILL_SPELL_FUNS anchor logic already used for the
  other two anchors, reused, not reinvented). Struct field order per merc.h:1679-1694: name,
  skill_level[4], rating[4], spell_fun, target (TAR_* macro name), minimum_position (POS_*
  macro name — reuse `datDefaults.minPosition` → POS_* name mapping, add a small
  POSITION_MACRO table alongside APPLY_LOCATION_MACRO if one doesn't already exist), pgsn
  (always `NULL` — no gsn binding for a brand-new spell), slot (always `SLOT(0)` — "no
  #OBJECTS training reference"; document this as a known limitation a human can hand-edit
  post-patch if the spell should be object-trainable), min_mana, beats, noun_damage,
  msg_off, msg_obj (quote literally, `""` not `NULL` — const.c uses empty-string literals
  for "no message", NOT the skills.dat "@" sentinel — verify this against a stock row with
  an empty msg_obj before assuming). patchText becomes 4 labeled sections (add `--- const.c`
  after `--- skills_data.c`). `generateOverlayRow`/`SkillEntry` output stays (still useful:
  it's the informational "what this will look like once you later edit it via the Skills
  page" preview data, and its field values are exactly what feeds the const.c row builder —
  just no longer fed into a live skills.dat PUT). Golden fixture(s) for the const.c row
  shape, byte-exact, same pattern as the other three.
- Files: /workspace/shattered-archive/services/merc-area/src/spell-codegen.ts,
  src/spell-codegen.test.ts, src/__fixtures__/spell-codegen/*const.c* (new)
- Verify (HOST): merc-area suite green; build clean; re-grep the exact const.c field order
  before finalizing the template — do not trust this plan's field list over the live read.

### [x] 5. (CLAUDE) Client: Codegen sub-view on the Skills tab
- Do: third sub-view beside Skills/Groups (copy GroupsView's wiring): spec list +
  compact `mb-field` form (archetype picker drives which fieldsets render), LIVE generated-C
  preview in a mono `<pre>` showing all 4 patch sections (regenerate on every valid form
  change; validation errors disable save/download), buttons: "Download patch" (client-side
  blob of patchText) and "Copy skills.dat-shape preview" (the generateOverlayRow-derived
  text — informational only, labeled "this is what you'll edit via the Skills page after
  the engine patch is deployed", NOT a live save — there is nothing to save until the spec
  is compiled in). Specs (the JSON manifest, not any game file) save via PUT with baseHash +
  ConflictPanel (workbench.tsx:320) — this part is unchanged, it's still just
  `<area>/codegen/spells.json` CRUD. Tests: render, archetype switch, validation error
  disables download, preview contains funName AND all 4 section headers, conflict panel on
  spec-manifest save.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/skills/CodegenView.tsx
  (new, +test), SkillsPage.tsx, src/api/client.ts (codegen endpoints + types)
- Verify (HOST): `pnpm --filter @shatteredarchive/mud-builder-client test` green;
  `npx tsc --noEmit` in the client package (vite build alone does NOT typecheck).

### [x] 6. (CLAUDE) Scratch-checkout compile E2E + docs + close-out
- Do: driver (scratchpad) — author one real spec of EACH archetype via the live API at the
  edge (build.shatteredarchive.dev; node needs `--use-system-ca` for the mkcert CA), pull
  each patchText. Then HOST-side: copy `/c/Projects/merc-mud/2.4` to the scratchpad, apply
  the four patches by scripted anchor-insertion (magic.h, magic.c, skills_data.c, AND
  const.c's skill_table), build a THROWAWAY docker image from the scratch copy (discover the
  game Dockerfile via merc-mud's compose; never the live tag), boot it sockets-free
  (`rom --skills-test` or equivalent) and prove each new spell resolves BY NAME — e.g.
  `skill_lookup("<name>")` returns a valid sn and its `spell_fun`/`target` match the spec —
  not merely "table intact". Confirm the LIVE game container's StartedAt unchanged
  throughout (this phase never restarts anything). Update `docs/mud-builder/README.md` (new
  Phase 14a section + Scope paragraph: skill DATA authorable since Phase 7, spell CODE now
  generatable — including brand-new named spells via a const.c row — but deploy-by-human;
  correct the record that skills.dat is an EXISTING-row-only mechanism, never a
  new-row mechanism), refresh `.annotated` for every touched dir + `@ai-` headers. Delete
  scratch checkout/images. Mark plan COMPLETE.
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md
- Verify (HOST): all archetype patches compile + self-test clean, each new spell resolves by
  name; suites green (merc-area, server, client); live game StartedAt byte-identical; docs
  read back accurate.

## Progress log

- 2026-07-23T17:59 plan created (Claude) — one of three Phase 14 candidates the user asked
  to be drafted in executable detail. Safety model chosen: generate-and-download only, human
  deploys; declarative spec (closed template set over proven stock primitives), never
  freeform C; (fun,target) guard extended, never weakened. Key facts verified against
  current source before writing: fun_registry shape (skills_data.c:47-51,156-159), spell
  signature (magic.c:688), TAR_* values (merc.h:1663-1669), validateSkills seam
  (skills.ts:29,66,179), audit exclusion idiom (audit.ts:52).
- 2026-07-24T00:05 step 1 done (Claude) — spell-spec.ts + spell-spec.test.ts (22 tests) +
  index.ts exports. Re-verified reference bodies against actual magic.c before designing
  (plan's Context was directionally right but not exact): spell_magic_missile's scaling is
  a hardcoded per-level array, not a dice formula, so the 'damage' archetype's template
  basis is spell_flamestrike (`dice(base + level/div, size)`, save-halves) and
  spell_acid_blast (pure perLevelDiv case) instead. 'affect' was split into two archetypes,
  not one: buff (spell_armor — is_affected(sn) guard, no save, TAR_CHAR_DEFENSIVE|SELF) and
  debuff (spell_blindness — IS_AFFECTED(bitvector)-or-saves_spell guard, TAR_CHAR_OFFENSIVE,
  bitvector REQUIRED since the guard is bitvector-based unlike buff's sn-based guard).
  Confirmed wear-off messages are never generated C: update.c:708 prints
  skill_table[type].msg_off generically for any expiring affect, so buff/debuff wear-off
  text lives in datDefaults.msgOff (ordinary SkillEntry field), not in the spec's C-facing
  message fields. cure's condition is a closed enum of existing gsn_* globals
  (blindness/poison/plague) since a cure can only strip a condition the engine already
  represents. AFF_*/APPLY_* whitelists deliberately exclude flags needing companion
  side-effects the closed single-AFFECT_DATA template can't provide (sleep, charm, poison,
  plague). Host verify: merc-area suite 111/111 green, `tsc -p tsconfig.json` clean.
- 2026-07-24T00:15 mid-step-1 correction (Claude) — found while grounding step 2's buff
  template in comm.c's act_new (:2619): act()'s $N never resolves to "you" for a self-cast
  (it just loops the room and substitutes the real character name), so spell_armor's
  self/other guard is genuinely two distinct literal strings, not one templated message.
  Split BuffArchetype.alreadyAffectedMsg into alreadyAffectedSelfMsg/alreadyAffectedOtherMsg
  and tightened duration/modifier fields to mutual exclusion (checkDuration/checkModifier
  helpers) so the C template has an unambiguous expression to render. Also added
  ApplyLocation 'none' (APPLY_NONE) for pure-flag buffs/debuffs. Re-ran suite green (111)
  before continuing.
- 2026-07-24T00:30 step 2 done (Claude) — spell-codegen.ts (generateSpellC,
  generateOverlayRow) + spell-codegen.test.ts (11 tests) + 5 golden fixtures under
  __fixtures__/spell-codegen/, byte-exact against the actual template output on the first
  run. Caught and fixed a real bug while writing the buff/debuff templates: deriving the
  APPLY_* C macro name via `` `APPLY_${location.toUpperCase()}` `` would have emitted
  APPLY_SAVES (merc.h:1005, a real but DIFFERENT macro = 20) for the 'saves' key, when
  spell_bless's actual shape uses APPLY_SAVING_SPELL (merc.h:1010, = 24) — a mismatch that
  would have compiled cleanly but silently applied the wrong stat. Renamed the key to
  'saving_spell' and replaced the string-derivation with an explicit APPLY_LOCATION_MACRO
  map (same pattern as AFF_FLAG_MACRO) so no future key/macro-name pair can drift apart
  silently. Confirmed fun_by_name (skills_data.c:152-161) is a linear strcmp scan, not a
  binary search, so fun_registry's alphabetical order is a readability convention, not a
  correctness requirement — the alphabetical-predecessor anchor (over SKILL_SPELL_FUNS,
  confirmed sorted spell_acid_blast..spell_word_of_recall) is best-effort-tidy, with a
  verified-real fallback anchor line for both magic.h and skills_data.c when a name sorts
  before every stock entry. Host verify: merc-area suite 122/122 green, `tsc -p
  tsconfig.json` clean; index.ts exports generateSpellC/generateOverlayRow.
- 2026-07-24T01:00 step 3 done (Claude) — codegen-store.ts (CodegenStore: readSpecs/hash/
  write, no backups since this is regenerable authoring metadata not a game-critical
  overlay — every write is already audited) + routes/codegen.ts (GET open, PUT
  guarded+audited via app.ts's existing global middleware, GET .../patch regenerates
  on-the-fly, 404 unknown funName) + codegen.test.ts (9 tests: empty-GET, 401 gate, 400
  invalid spec, save+audit-line, 409 stale hash, stock-name collision, patch download
  content, unknown-funName 404) + app.ts wiring (skillsStore hoisted to a named var so both
  registerSkillsRoutes and registerCodegenRoutes share one instance — codegen's PUT needs
  the live skills.dat overlay names for collision checks). Confirmed via groups.ts/skills.ts
  that each route module's own `app.use(express.json(...))` is intentional, not redundant —
  route test files mount registerXRoutes alone on a bare express() with no app.ts global
  setup, so each module must be self-sufficient. Reused skills.ts's exported readBaseHash
  as-is (it only reads body.baseHash, indifferent to the specs/skills key). Host verify:
  mud-builder-server suite 93/93 green, `tsc -p tsconfig.json` clean (merc-area rebuilt
  first so its new exports resolved).
- 2026-07-24T02:45 step 5 done (Claude) — CodegenView.tsx (third sub-view beside
  Skills/Groups, GroupsView wiring copied): index-keyed spec list (specs are pre-deploy
  DRAFT data, unlike name-keyed Skill/GroupEntry rows, so index identity is correct here),
  archetype picker with per-archetype fieldsets, LIVE preview via generateSpellC/
  generateOverlayRow called DIRECTLY client-side (no network round trip — merc-area is
  already bundled client-side per the SkillsPage/GroupsView precedent of calling
  validateSkills/emitSkillsFile the same way), skills.dat-shape preview relabeled
  informational-only per the step 4 correction (no "Add to skills.dat" button — there is
  nothing to save until the const.c patch is compiled in). client.ts gained
  codegenSpells/saveCodegenSpells/codegenPatch + a `requestText` helper (the patch route
  answers text/plain, not JSON — the existing `request<T>` always calls res.json(), so
  reusing it verbatim would have silently returned `{}` on a plain-text response). Added
  CodegenView.test.tsx (6 tests: add+preview, archetype switch, stock-name collision
  disables save, save+hash, 409 conflict panel + save-anyway, remove). Host verify:
  mud-builder-client suite 108/108 green, `npx tsc --noEmit` clean.
- 2026-07-24T03:15 mid-step-6 bug found + fixed (Claude) — attempting to actually APPLY a
  generated patch (a "spark bolt" damage spec, one of every archetype's shape) to a scratch
  merc-mud copy surfaced a real bug: const.c's anchor quoted only the predecessor's OPENING
  line (`{"slow",`), and inserting "after" a single line of a MULTI-LINE struct literal
  lands in the middle of that entry, corrupting it. Fixed at the source: RegistryAnchor
  gained `before`/`after` (both optional, exactly one set); const.c now anchors BEFORE the
  alphabetical SUCCESSOR's opening line (a true entry boundary) via a new
  alphabeticalSuccessor() helper, falling back to "after the array's own opening brace"
  only when no successor exists (name sorts after every stock fun). Golden tests updated
  (spell-codegen.test.ts) to assert the corrected before/after split, including the
  genuinely-no-successor fallback case. Re-verified: merc-area 125/125, mud-builder-server
  93/93 (rebuilt), mud-builder-client 108/108 (rebuilt) all green after the fix.
- 2026-07-24T03:45 live E2E (Claude) — user chose a THROWAWAY container first
  (AskUserQuestion): generated a real "spark bolt" damage spec via the actual built
  merc-area package (not hand-written), applied the corrected 4-section patch to a scratch
  merc-mud/2.4 copy, built a throwaway image, booted it on a spare port with disposable
  player files, and proved it end-to-end over live telnet (adapted a prior phase's proven
  reactive driver, found via Explore agent rather than rewritten from scratch): a demo
  character cast "spark bolt" and the game printed "Your spark bolt === OBLITERATES === a
  trainee!", mana deducted exactly 15 as specced, skill persisted through a save/reload
  re-sorted into the stock alphabetical position — full proof skill_lookup resolves the new
  const.c row by name and every generated C section is correct. Live merc-mud2.4's
  StartedAt was confirmed byte-identical throughout (never touched).
- 2026-07-24T04:00 live redeploy (Claude) — user then asked to tear down the throwaway and
  deploy the SAME verified patch to the real engine. Applied it to
  `merc-mud/2.4/src` (magic.h/magic.c/skills_data.c/const.c — diff reviewed clean before
  building, isolated from unrelated pre-existing uncommitted changes already in that
  working tree), rebuilt the real `merc-mud-mercmud24` image (clean compile), and recreated
  the live `merc-mud2.4` container (`docker compose up -d --force-recreate` — brief
  dev-time downtime, pre-approved). Booted clean (`ROM is ready to rock on port 4000`; the
  two Fix_exits BUG lines are pre-existing area-content warnings, identical in the
  throwaway boot, unrelated to this patch). "spark bolt" is now a real castable spell in
  the live game, self-grantable via `set skill <name> 'spark bolt' 100` (an existing
  immortal command — do_sset, act_wiz.c:3104). Docs: added a "New spells: C codegen
  assist (Phase 14a)" section to docs/mud-builder/README.md (states plainly that skills.dat
  is existing-row-only, never new-row). .annotated refreshed for services/merc-area/src
  (spell-spec.ts, spell-codegen.ts + tests). Scratch checkout/images/disposable player dir
  deleted. Plan COMPLETE.
- 2026-07-24T01:30 ARCHITECTURE CORRECTION (Claude) — while starting step 4, re-verified
  the C loader instead of trusting the plan's "skills.dat overlay row is the new-spell
  deployable" premise, and found it's wrong: `load_skills_overlay`
  (skills_data.c:189-199,285-291, `sk_find_skill`) SKIPS any row whose name isn't already
  in the compiled `skill_table[]` — every boot, forever, via a bug()-logged skip, never a
  crash but never applying either. const.c has exactly one reserved placeholder row (row
  0, const.c:791), already excluded per skills-stock.ts's own comment — there is no pool of
  blank slots for new names. So a brand-new spell can NEVER be introduced through
  skills.dat; that mechanism only ever edits DATA on a row that already exists. Original
  step 4 (manifest-aware fun/target downgrade in validateSkills) guarded a pathway that can
  never be reached and is DROPPED, not implemented. The actual fix: `MAX_SKILL` is 150
  (merc.h:121) against ~100 stock rows, so const.c's `skill_table[MAX_SKILL]` initializer
  has ~50 rows of headroom already built in — a new spell's deployable artifact is a
  FOURTH patch section (a new struct literal appended to that initializer), not a
  skills.dat row. Once that patch is compiled and deployed, the spell IS an ordinary stock
  row, editable through the EXISTING Phase 7 Skills page exactly like "armor" or "bless" —
  no new save/conflict pathway is needed for it. Rewrote steps 4 (now: const.c row
  generator, replacing the dropped validation task), 5 (skills.dat-shape preview is
  informational only, not a live save), and 6 (E2E must prove the new row resolves BY NAME,
  not just "table intact") to match. generateOverlayRow/SkillEntry from step 2 is NOT
  wasted work — its field values are exactly what feeds the const.c row builder, and its
  output remains valuable as the "what you'll edit later via Skills" preview. Told the user
  before proceeding (architecture pivot, not a minor nuance); continuing on the corrected
  design since the fix itself was unambiguous, not a judgment call.
- 2026-07-24T02:00 step 4 done (Claude) — extended spell-codegen.ts: `constCRowText()`
  (reuses generateOverlayRow's field values, pgsn always NULL, slot always SLOT(0), msg_obj
  always `""` per spell_armor's own row precedent — verified const.c uses "" not NULL for
  "no message", unlike skills.dat's "@" sentinel), POSITION_MACRO (merc.h:1150-1158) and
  TARGET_MACRO lookup tables, and a `SKILL_NAME_BY_FUN` map (STOCK_SKILLS) so the const.c
  anchor quotes a REAL `{"<skill name>",` opening line (reusing the same
  alphabeticalPredecessor search already computed for the other two anchors — since
  SKILL_SPELL_FUNS only contains real spell funs, the predecessor naturally lands inside
  const.c's "Magic spells" block). patchText is now 4 labeled sections. Added
  __fixtures__/spell-codegen/const-row.c golden fixture + 3 new tests (byte-exact row,
  anchor-quotes-real-skill-name, fallback anchor `skill_table[MAX_SKILL] = {`). Host verify:
  merc-area suite 123/123 green, `tsc -p tsconfig.json` clean; mud-builder-server rebuilt +
  retested (93/93 green) since it consumes merc-area's dist — unaffected, only new fields
  were added to GeneratedSpellC.
- 2026-07-24T18:15 independent review pass (Claude Fable) — re-verified every step against
  the live tree, found the work sound but with three gaps, all fixed in the same pass:
  (1) VERIFICATION GAP: step 6's "all archetype patches compile + self-test clean" had only
  actually been run for the damage archetype (spark bolt); buff/debuff/heal/cure were
  golden-text-tested but never fed to a C compiler. Closed it: generated one spec per
  remaining archetype (granite ward / mind fog / vital surge / purge toxin, plus ember
  lance for damage) via the built merc-area dist, applied all five 4-section patches to a
  fresh scratch checkout of the CURRENT src (anchors held even with spark bolt already
  present), built a throwaway image — compile clean, zero gcc warnings — and booted
  `rom --skills-test` with a baked skills.dat naming all five: "Skills overlay
  'skills.dat': 5 row(s) applied, 0 skipped" + skills_selftest ALL PASS, proving every new
  row resolves by name (sk_find_skill) with its generated fun (fun_by_name) and a proven
  (fun,target) pair. Throwaway image + scratch checkout deleted after.
  (2) INDEX GAP: .annotated entries were missing for codegen-store.ts, routes/codegen.ts(+test),
  CodegenView.tsx(+test), and client.ts/app.ts one-liners lacked the Phase 14a additions —
  all filled.
  (3) DEPLOYMENT GAP: the mud-builder pair at build.shatteredarchive.dev was still running
  images built 2026-07-23 21:31Z — BEFORE any Phase 14a code existed — so the edge answered
  404 on /api/codegen/spells (which also means step 6's "author via the live API at the
  edge" had silently degraded to the local built package). Rebuilt + recreated both
  containers from the experimental compose (project `shatteredarchive`) and re-probed the
  edge. Baseline evidence otherwise: merc-area 125/125, server 93/93, client 108/108,
  builds + client tsc clean; live engine src carries the 4-section spark bolt patch
  (const.c:1968, magic.c:4383, magic.h:117, skills_data.c:144); README Phase 14a section
  reads accurate; live merc-mud2.4 untouched throughout the review (StartedAt
  2026-07-24T22:28:47Z before and after).
