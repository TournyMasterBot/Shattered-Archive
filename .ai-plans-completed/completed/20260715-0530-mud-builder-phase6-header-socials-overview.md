# Plan: MUD Builder — Phase 6 (area header editor + socials + world overview)

Created: 2026-07-15T05:30:00Z · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Close the last authoring gaps that need no C work — edit the #AREA header from a form, give #SOCIALS a dedicated editor, and add a world overview dashboard surfacing cross-area links/warnings across every file.

## Goal
A builder can rename an area, change its credits, and (safely) grow its vnum range from a form; edit socials in social.are with per-field message forms; and see one dashboard listing every area with its range, entity counts, and outstanding cross-area warnings. Done when all three ship deployed with suites green and an E2E pass. (Skills/spells/songs codegen — the only remaining .are-external authoring — stays a later phase.)

## Constraints
- STABILITY IS KING; MUD never goes offline. Header edits change boot-critical data: SHRINKING a vnum range that still contains entities must be blocked (client + server 400); growing must re-check overlap against area.lst exactly like createArea.
- Compact layout standard (mb-field/mb-fieldset idiom, memory: mud-builder-ui-layout).
- Socials preservation: nameComment junk, `$`-unset fields, and early-terminated entries must round-trip untouched (the parse/emit layer already guarantees this — the editor must not normalize).
- qwen (container) must NOT run pnpm install|build|test; JS verification is a host job.

## Context
- Phase 5 COMPLETE (.ai-plans/20260715-0230-*): shops/specials forms + new-area creation; everything in a .are file is authorable; deployed at build.shatteredarchive.dev.
- Header model: /workspace/shattered-archive/services/merc-area/src/types.ts (AreaHeaderSection: fileName/name/credits/minVnum/maxVnum). No form edits it today — only manual edit can.
- Range validation prior art: createArea overlap check in /workspace/shattered-archive/apps/mud-builder-server/src/area-store.ts; usedVnums in apps/mud-builder-client/src/features/areas/model-ops.ts.
- Socials model: types.ts Social/SocialsSection (8 nullable message fields, nameComment preserved); social.are is the only stock file using it.
- Warnings source: validateRefs warnings already computed per file (server preview + refs); a dashboard can GET each area and aggregate client-side, or a new GET /api/world endpoint can do one pass server-side (prefer server — one request, no N fetches).
- UI slots: App.tsx BuilderSection/SECTIONS tabs; AreaSidebar hosts per-area chrome.
- CHECK FIRST in step 2/4: whether area_reload.c commits #SOCIALS changes on hot reload (socials live in the global social_table, not per-area prototypes) — if not, socials edits are copyover-only like new files; document whichever holds and make the UI say so.

## Steps
### [x] 1. (CLAUDE) Area header editor (form + server range guards)
- Do: AreasPage gains an "Area header" fieldset (name, credits, min/max vnum) editing the AreaHeaderSection; merc-area or server-side check: PUT 400s when the new range excludes any vnum defined in the file (shrink guard) — overlap-vs-other-areas checked server-side like createArea (server-only: needs area.lst).
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/areas/AreasPage.tsx (+test), apps/mud-builder-server/src/routes/areas.ts + area-store.ts (+tests)
- Verify: host suites green — shrink-below-used-vnum 400s naming the vnum; rename round-trips; overlap-on-grow 400s.

### [x] 2. (CLAUDE) Socials editor tab
- Do: features/socials/SocialsPage on the workbench hook — social list + per-social form (name read-mostly, 8 labeled message fields with "(unset)" toggles mapping to null/`$`), add/delete social; App tab. Manual pane included for free.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/socials/* (new), src/App.tsx (+tests)
- Verify: host client tests green — edit a field → emit matches; unset (null) fields stay `$`; early-terminated stock socials survive save byte-identically (corpus: social.are round trip).

### [x] 3. (CLAUDE) World overview dashboard (GET /api/world)
- Do: server endpoint aggregating every listed area (header, entity counts, refs warnings count, parse errors) in one pass; client "World" tab rendering a compact table with per-area warning drill-down (details expander). Read-only — no writes.
- Files: /workspace/shattered-archive/apps/mud-builder-server/src/routes/areas.ts or new world.ts (+tests), apps/mud-builder-client/src/features/world/* (new), src/App.tsx (+tests)
- Verify: host suites green — endpoint returns one entry per area.lst line incl. error entries; client renders counts; stock corpus shows the known cross-area warnings (draconia/hitower keys), zero errors.

### [x] 4. (CLAUDE) Deploy + E2E + docs + sign-off
- Do: rebuild/redeploy the pair; E2E driver: rename school's header + grow range → save → hot reload → telnet MOTD/area sanity; socials: add a test social to social.are → save → hot reload → telnet uses it → restore; World tab endpoint spot-check via edge. Update docs/mud-builder README; refresh .annotated; mark plan COMPLETE; draft Phase 7 (skills/spells/songs codegen — C tables).
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md
- Verify: all driver checks pass; suites green; MUD never dropped a connection.

## Progress log

- 2026-07-15T05:30:00Z plan created (successor to Phase 5, which is COMPLETE)
- 2026-07-15T08:15:00Z step 4 done + plan COMPLETE: builder pair rebuilt/redeployed; E2E ALL 26 CHECKS PASS on the live stack — header shrink 400 (naming vnums) + overlap-on-grow 400 (naming haon.are) with school.are disk untouched; rename+credits saved, HOT reload applied it live (telnet 'areas' showed "Mud School P6" — NOTE: do_areas prints the CREDITS column, not area name, so the E2E renames both; first run failed on a name-only rename until this was spotted), school restored; social 'p6wiggle' added to social.are (244 stock socials), COPYOVER loaded it (boot-only, as the C check predicted), telnet fired it ("You wiggle phase-six-ishly."), social.are restored + cleanup copyover, game alive throughout; /api/world live: 53 areas, 0 parse errors, 0 ref errors, 350 stock cross-area warnings surfaced. Suites: merc-area 34/34, server 20/20, client 43/43, both tsc clean. Docs README updated (Phase 6 section + Scope rewrite); .annotated refreshed (areas/socials/world/routes/api/src-root/server-root/merc-area). Phase 7 plan drafted (skills/spells data-driven authoring)
- 2026-07-15T07:10:00Z steps 2+3 done: SocialsPage tab on the workbench hook (per-field message forms, blank⇔`$` unset because empty strings are unrepresentable in the format, early-terminated socials keep their short field list unless "+ Add message line" is clicked, copyover-only note — C CHECK CONFIRMED: area_reload.c stage_socials SKIPS #SOCIALS on hot reload ("[helps/socials skipped]"), socials load at boot only; BUT commit_stage line 2015 DOES commit header name/credits on hot reload, so renames are live) + model-ops socialsOf/newSocialTemplate/upsertSocial/removeSocial (#SOCIALS created before #SCRIPTS); World tab + GET /api/world (routes/world.ts single-pass aggregate: header, 9 entity counts, refs errors/warnings, parseError entries still listed) + api.world + read-only table with details expander. client 43/43, server 20/20, both tsc clean
- 2026-07-15T06:20:00Z step 1 done: AreaHeaderEditor fieldset on AreasPage (name/credits/min/max + inline shrink warning) + merc-area vnumsOutsideRange + AreaStore.assertHeaderChangeSafe (enforced on preview AND PUT, ONLY when the range differs from the on-disk header so untouched stock files keep saving; shrink-below-used-vnum 400 naming the vnums, overlap-on-grow 400 vs area.lst excluding self, 0/0 no-range allowed). merc-area 34/34, server 19/19, client 38/38
