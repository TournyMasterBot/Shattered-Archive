# Plan: Deep Review -- classify DSL's capabilities from historical game-log output

Created: 2026-07-23T21:16:00Z · Workspace: /workspace/dsl · Status: ACTIVE
Task: Build and iteratively refine a repeatable pipeline that mines every DSL GameLogs
format for distinct output "shapes" and classifies them (Communication, Combat, Magic,
Skills, Movement, Room/Environment, Objects/Economy, Status/HUD, Progression, System),
so the MUD's real capabilities are mapped from years of actual play rather than guessed.

## Goal

A reproducible `node scripts/classify-logs.js` run over `GameLogs/` that extracts every
distinct player-visible output line across all known historical log formats, collapses
near-duplicates (numbers/names vary, wording doesn't) to one template each, classifies
each template into category/subcategory via an editable `rules.json`, and reports the
result in `reports/` (summary + triage list + full machine-readable record). Done when
the Unclassified share stops moving meaningfully per iteration, or the user is satisfied
with coverage -- there is no hard 100% target, this is an exploratory capability map.

## Constraints

- No npm dependencies in the script -- Node built-ins only (repo has no consistent
  package-manager setup; a stray accidental `npm install` was found and excluded, see
  Context).
- Never re-derive ground truth by guessing when an authoritative source exists --
  `@reference-data/CapturedPatterns_Reference.txt` (community-curated DSL trigger source,
  lives in the **ShatteredArchive** repo, not this one) is the primary source for new
  rules going forward, not regex guesswork from raw output alone.
- Full corpus is ~46.9M extracted records / ~1.06M unique templates across 1012 files --
  `templates.jsonl` (the uncapped machine-readable report) needs chunked writes (not
  `Array.join`) and the run needs `--max-old-space-size=16384`; both already handled in
  the script, don't regress them.

## Context

- /workspace/dsl/Deep Review/PLAN.md -- the detailed technical design doc: exact format
  notes for all 5 historical log shapes, explicit scope exclusions and why, the
  `dsl-web-log` JSON-envelope unwrapping design (payload vs envelope, preset
  classification bypass), and a running "known gaps" list. Read this first, it is the
  source of truth for *how* the pipeline works -- this plan doc tracks *status*, not
  mechanics.
- /workspace/dsl/Deep Review/scripts/classify-logs.js -- the extraction/normalization/
  classification engine. Handles 4 real log formats (¤-delimited, JSONL envelope, gzipped
  HTML, plain `[BEGIN LOG]` text) plus a Mudlet timestamp-prefixed plain variant.
- /workspace/dsl/Deep Review/scripts/rules.json -- the editable category/subcategory/
  regex taxonomy. This is the file to extend for future iterations; it is where nearly
  all of this plan's remaining work happens.
- /workspace/dsl/Deep Review/reports/{summary.md, unclassified.md, templates.jsonl,
  run-stats.json} -- fully regenerated each run, safe to delete. `unclassified.md` is the
  triage list (most-frequent unclassified templates first) -- always start there.
- /workspace/shattered-archive/@reference-data/CapturedPatterns_Reference.txt -- 780-line
  community-curated reference (DSL2's own Mudlet `.lua` triggers + native XML + the
  vendored PNP package + sibling profiles). Sections marked **[ACTIVE]** are highest
  confidence; **[NATIVE ONLY]** and **[UNCONFIRMED]** sections are real DSL text but
  lower-confidence/not yet cross-checked -- these are NOT yet mined into rules.json.
- Results so far, same 46,925,304-record corpus, verified via `run-stats.json` after
  each change (not estimated): Unclassified share 60.3% -> 50.8% (JSON envelope
  unwrapping) -> 40.0% (reference batch 1: weapon procs, ~90 spell onset/wear-off pairs,
  new Skills + Progression/Rewards categories) -> **31.0%** (reference batch 2: fixed a
  real bug -- a stray "&" in the "big nasty wounds" condition pattern that made it never
  match -- plus critical-hit patterns without pronoun objects, group/roster status lines,
  food/drink, generic command feedback).
- Two categories of remaining Unclassified content are diagnosed and accepted, not bugs:
  (1) genuine unique room-description prose (each room's text really is different, one
  physical terminal line per Unclassified template -- there is no repeat to collapse);
  (2) the old plain-text `[BEGIN LOG]` format has no message-boundary delimiter the way
  the ¤-delimited and JSONL formats do, so occasional lines glue together without a
  newline (same bug class fixed twice for the other two formats, not fixable here without
  a fragile heuristic) -- e.g. `"Melchaleve An Uneven, Hot Corridor"` (a player name fused
  onto the next room title), 68,904x, confirmed via `templates.jsonl`. Both documented in
  Deep Review/PLAN.md's "Known gaps" section.

## Steps

### [x] 1. Build the extraction/classification pipeline
- Do: `classify-logs.js` (walk, format-sniff, ANSI/HTML strip, template normalization,
  rules.json classification, chunked report writers) + seed `rules.json` + `PLAN.md`.
- Files: scripts/classify-logs.js, scripts/rules.json, PLAN.md
- Verify: done -- full corpus run completes without error, reports generated.

### [x] 2. Fix scope and memory bugs found during the first full run
- Do: exclude `GameLogs/Rooms/**` (mapper room-name cache, not narrative output --
  ~850K near-zero-value templates from <1MB of data); raise Node heap
  (`--max-old-space-size=16384`); switch `templates.jsonl` to chunked writes (a plain
  `Array.join` on ~1.86M entries exceeded V8's max string length); cap `summary.md` at
  1000 templates/subcategory.
- Files: scripts/classify-logs.js, PLAN.md
- Verify: done -- full run completes clean, `run-stats.json` produced.

### [x] 3. Unwrap `dsl-web-log`'s JSON envelope format
- Do: recognize the `{"type","subtype","payload"}` JSONL envelope (distinct from the
  ¤-delimited format despite the shared `raw.log` filename); unwrap `payload` as the
  classification target instead of templating the whole envelope string; route
  `dsl-message`/`notification` through the normal text pipeline, preset `speech`/`gmcp`/
  `damage.round`/`mob.death`/`room.setroom`/`inventory` directly from their known
  type/subtype (more reliable than regex-guessing what the client already told us);
  exclude `dsl-input` (player input, not output) but count it.
- Files: scripts/classify-logs.js, PLAN.md
- Verify: done -- top Unclassified entry (the empty `raw-buffer` envelope shell, 1M+
  occurrences) gone; `GMCP Protocol Data` and structured `Combat`/`Communication` records
  now populate correctly from `dsl-web-log`.

### [x] 4. Cross-reference `CapturedPatterns_Reference.txt`, two rules-expansion batches
- Do: read the full reference doc; add weapon-flag procs, the ~90-entry spell
  onset/wear-off table, condition tiers, chat-channel anchors, position changes, new
  `Skills` and `Progression / Rewards` categories (batch 1); then re-triage
  `unclassified.md`'s new top entries and add blocked-exit, food/drink, follow, generic
  command feedback, critical-hit patterns without pronoun objects, group/roster status
  lines, spellup-automation feedback, and fix the "big nasty wounds" ampersand bug
  (batch 2).
- Files: scripts/rules.json, PLAN.md
- Verify: done -- `run-stats.json` confirms Unclassified 50.8% -> 40.0% -> 31.0%; spot
  checks in `unclassified.md` confirm each targeted phrase moved out.

### [ ] 5. Mine the reference doc's `[NATIVE ONLY]` / `[UNCONFIRMED]` tail
- Do: sections not yet used for rules -- the "Combat Sounds" leftover bucket (breath
  weapon/fear group, pet/charmed-follower dialogue), Weapon Nouns taxonomy (could
  sub-classify Combat's damage bucket by damage type: slash/pierce/bash/energy/fire/
  negative/holy), CreatureLore block fields, Equipment body-line parser, quest-item
  pickup lines, kingdom-specific/immortal channels (thaxanos/shalonesti/conclave/imm/
  pray), parenthesis-quoted speech variant. Lower confidence/frequency than what's
  already mined -- expect smaller, more scattered gains than steps 3-4's.
- Files: scripts/rules.json
- Verify: `node scripts/classify-logs.js`, then `run-stats.json`'s Unclassified share
  vs. 31.0% baseline; spot-check `unclassified.md` for the specific phrases targeted.

### [ ] 6. Decide how to handle the room-description-prose tail
- Do: this is a judgment call, not mechanical -- current behavior (one Unclassified
  template per physical description line, correctly not collapsing since the text is
  genuinely unique per room) is arguably *correct* for a capability map, since a room's
  specific prose isn't itself a distinct "capability". Options: leave as-is (do nothing,
  it's honest); add a heuristic "this looks like room-description prose" bucket so it's
  visibly separated from truly-unclassified content in reports without pretending it's
  categorized; or explicitly filter it out of `unclassified.md`'s triage list (not
  `templates.jsonl`) so the triage list stays focused on things worth a new rule.
- Files: scripts/classify-logs.js (if a filter/bucket is chosen), PLAN.md
- Verify: N/A until a direction is chosen -- discuss with the user first, this is
  explicitly flagged as a decision point, not a default-yes step.

## Progress log

- 2026-07-23T21:16:00Z plan created, retroactively documenting steps 1-4 (already
  complete and verified this session) plus steps 5-6 (proposed next work, not started).
  User confirmation: "This is a fine stopping point for now" -- plan left ACTIVE with
  steps 5-6 unchecked for a future session to pick up, not meant to be worked
  immediately.
- 2026-08-02 step 5 NOT checked off, but a large part of its input is now settled.
  Working from the text-to-speech side, the whole of `CapturedPatterns_Reference.txt`
  was verified against the full corpus (2,478 files / 2.85 GB: GameLogs/*.txt,
  ShatteredArchive/Docker/**/*.jsonl, AGL, Books, raw.log). Two of the exact buckets
  step 5 targets are resolved: the breath-weapon leftover group is INVENTORY
  DESTRUCTION (bubbles and boils / blackens and crisps / sparks and sputters, 1,140
  hits), and the pet/charmed-follower dialogue is 1-of-3 real ("What?  And leave your
  beloved master?", 224). Also settled: the affect table end to end (66/92 spells
  confirmed, 8 never occur, SIX wordings wrong as written), plus retractions of four
  earlier corpus-absent calls -- the Unholy proc alone has 96,825 hits.
  METHOD NOTE FOR WHOEVER RESUMES THIS: naive literal search of these logs yields
  FALSE NEGATIVES three ways -- the reference doc's quotes are its own not the game's,
  ANSI colour sits INSIDE phrases, and half the corpus stores text as escaped JSON.
  See the "HOW TO SEARCH THIS CORPUS" block now at the top of the reference doc.
  Step 5's own deliverable (`scripts/rules.json` + a `classify-logs.js` run measured
  against the 31.0% Unclassified baseline) was NOT touched, hence still unchecked --
  but the pattern research it depends on is done and the corrected wordings are
  ready to fold into rules.json.
