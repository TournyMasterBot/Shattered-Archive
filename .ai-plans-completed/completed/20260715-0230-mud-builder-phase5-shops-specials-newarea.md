# Plan: MUD Builder — Phase 5 (shops/specials forms + new area files)

Created: 2026-07-15T02:30:00Z · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Give the last two data sections dedicated forms (shops, specials) and let builders create a brand-new area file (header + area.lst registration) — after this, everything a .are file holds is authorable in the UI.

## Goal
A builder can attach/edit/remove a shop on any mob and a spec_fun on any mob from the UI, and can create a new empty area file (name, credits, vnum range) that registers in area.lst, boots in the game, and is immediately editable in every tab. Done when a new area authored entirely in the UI (area → room → mob → reset → shop) hot-loads into the running game and all suites stay green.

## Constraints
- STABILITY IS KING; MUD never goes offline. New-file creation writes area.lst — that file is boot-critical, so writes must be atomic with a backup, the new file must be emitted/validated BEFORE area.lst gains the line, and hot reload of a brand-new file must be verified (area_reload may assume the area already exists — check the C side first; copyover is the acceptable fallback for first load, document whichever holds).
- Every new screen follows the compact layout standard (mb-field/mb-fieldset idiom, memory: mud-builder-ui-layout).
- Same preservation rules as always: verbatim words, unlisted bits, unknown spec_funs kept as written (warn, don't coerce — the C spec_lookup is the authority; unknown = boot error, so validate against a checked-in list mirrored from const.c spec_table).
- Vnum ranges of new areas must not overlap any range declared in area.lst files (validate server-side, 400 on overlap).
- qwen (container) must NOT run pnpm install|build|test; JS verification is a host job.

## Context
- Phase 4 COMPLETE (.ai-plans/20260714-1330-*): create/delete + validateRefs + Resets tab + manual-edit-everywhere; deployed at build.shatteredarchive.dev.
- Shop/Special models already parse/emit/round-trip: /workspace/shattered-archive/services/merc-area/src/types.ts (Shop, Special; ShopsSection/SpecialsSection). Shops reference keeper mob vnums; specials reference mob vnum + spec_fun word.
- validateRefs already covers shop keepers + special mobs (validate.ts); referencesTo blocks deleting mobs they name.
- spec_fun vocabulary lives in merc-mud/2.4/src/special.c spec_table (C authority) — mirror the names into a client/lib list like SCRIPT_TRIGGERS was.
- Area store (list/read/write, backups, area.lst) : /workspace/shattered-archive/apps/mud-builder-server/src/area-store.ts; routes in routes/areas.ts.
- Hot reload C side: merc-mud/2.4/src/area_reload.c (check: does it handle a file not seen at boot? load path keys off area.lst).
- UI: shops/specials could live on the Mobs tab (a mob-centric drawer: "Shop" and "Special" sections on the mob editor) rather than separate tabs — decide by what reads cleanest in the compact standard; resets showed per-row forms work well.

## Steps
### [x] 1. (CLAUDE) spec_fun table + shop/special validation in merc-area
- Do: add SPEC_FUNS (mirrored from special.c spec_table) to types.ts; extend validateRefs or a new validateWorld with: shop keeper must be a mob (already), duplicate shop per keeper = error, special with unknown spec_fun = error (matches db.c boot behavior), duplicate special per mob = warning. Tests incl. corpus sweep (stock files must stay clean).
- Files: /workspace/shattered-archive/services/merc-area/src/types.ts, src/validate.ts, src/refs.test.ts (extend), src/index.ts
- Verify: host `pnpm --filter @shatteredarchive/merc-area test` green; corpus sweep reports 0 errors.

### [x] 2. (CLAUDE) Mobs tab: shop + special editors on the mob form
- Do: MobEditor gains two collapsed fieldsets — "Shopkeeper" (attach/remove shop: profit buy/sell, hours, five buy-type words) and "Special function" (spec_fun picker from SPEC_FUNS, verbatim fallback) — editing the area's shops/specials sections keyed by the mob's vnum; deleting guarded like everything else.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/mobs/MobEditor.tsx, MobsPage.tsx, src/data/flags.ts (buy-type item words), tests
- Verify: host client tests green — attach shop → emit contains the #SHOPS line; unknown spec_fun blocks preview with the validation message.

### [x] 3. (CLAUDE) Server + C check: create a new area file end to end
- Do: POST /api/areas (name, fileName, credits, minVnum, maxVnum) — validate range overlap against every listed area, emit a minimal #AREA-only file, atomic write + area.lst append (backup both). FIRST check area_reload.c handles a not-at-boot file; if not, the create response says "copyover required for first load" and the UI surfaces it. Client: "+ New area" in the sidebar (compact modal/form).
- Files: /workspace/shattered-archive/apps/mud-builder-server/src/area-store.ts, routes/areas.ts (+tests), apps/mud-builder-client/src/features/areas/workbench.tsx + AreasPage.tsx (+tests), merc-mud/2.4/src/area_reload.c (read; patch only if a small safe change makes first-load hot work)
- Verify: host server tests green — created file parses, area.lst updated with backup, overlap 400s; C behavior for new-file load documented in the code comment.

### [x] 4. (CLAUDE) E2E on the deployed stack + docs + sign-off
- Do: driver via build. edge: create area (fresh vnum range) → add room+mob+reset+shop in the UI flows (API) → save → load into the game (hot or copyover per step 3's finding) → telnet: goto the new zone, buy from the shopkeeper → delete the whole experiment (restore area.lst, remove file) → verify game clean. Update docs/mud-builder README + commands.md; refresh .annotated; mark plan COMPLETE; draft Phase 6 (candidates: skills/spells codegen, socials editor, multi-file zone dashboards).
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md, commands.md
- Verify: all driver checks pass; suites green; MUD never dropped a connection.

## Progress log

- 2026-07-15T02:30:00Z plan created (successor to Phase 4, which is COMPLETE)
- 2026-07-15T05:10:00Z step 4 done + plan COMPLETE: builder pair rebuilt/redeployed; E2E driver ALL 22 checks PASS on the live stack — created p5zone.are (25000-25099) via POST /api/areas (overlap attempt 400ed naming school.are; unknown spec_fun PUT 400ed), authored a full zone through the API (shop room + SENTINEL shopkeeper + trinket + ITEM_MONEY pile + M/G/O resets + #SHOPS + #SPECIALS spec_guard), linked it off school 3700 (cross-area exit previewed as a WARNING as designed), copyover loaded the new file, fresh telnet character walked in, got the coins, LISTed and BOUGHT the trinket ("You buy a phase five trinket for 1 silver"), then full cleanup (school restored + hot reload, area.lst de-registered BEFORE file delete, cleanup copyover, game "ready to rock", school.are disk-clean). Suites: merc-area 34/34, server 18/18, client 37/37. Docs updated (README: Shops and specials, Creating a new area file, Scope rewrite). Phase 6 plan drafted. C check confirmed hot reload REFUSES not-at-boot files (area_reload.c:2050 "'%s' is not a booted area (new areas need a reboot/copyover)") — copyover is the designed first-load path, no C patch; AreaStore.createArea (write-gated, range/overlap/duplicate validation, .are written+validated BEFORE area.lst gains the line, both backed up, atomic) + POST /api/areas (201, requiresCopyover) + client api.createArea + NewAreaForm (plain-props, hosted by BOTH the shared AreaSidebar and AreasPage's bespoke sidebar); server 18/18, client 37/37, both tsc-clean
- 2026-07-15T03:40:00Z step 2 done: MobExtras.tsx (Shopkeeper + Special function fieldsets on the mob form, compact standard; unlisted buy types + unknown spec_funs preserved verbatim '(as written)') + model-ops getShop/upsertShop/removeShop/getSpecial/setSpecial/removeSpecial (section-creating, #SHOPS before #SPECIALS before socials/scripts) + ITEM_TYPES in data/flags.ts; client 32/32
- 2026-07-15T03:10:00Z step 1 done: SPEC_FUNS (22 names mirrored from special.c spec_table) + isKnownSpecFun (prefix-match like spec_lookup) in types/validate; validateRefs extended — duplicate shop per keeper = error, unknown spec_fun = error (boot-fatal: load_specials bug+exit), duplicate special per mob = warning; merc-area 34/34 incl. corpus sweep clean; dist rebuilt
