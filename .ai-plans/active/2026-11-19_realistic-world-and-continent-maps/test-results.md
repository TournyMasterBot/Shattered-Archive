# Test results

## Phase 1 — The layout can be given a silhouette and hints

- `pnpm --filter @shatteredarchive/shattered-maps-core test`: 31 suites, 599 tests pass. New: outline containment, hint beats relation, squeezed source order, ignored-input warnings, fallback outside the outline, `autoSpec` carry-through, `readSpec` validation.
- `node --test scripts/layout-continent.test.mjs scripts/layout-auto.test.mjs`: 11 pass.
- Real map (`audited-map.relayout.json`, gap 3, 0.7 cells per room): 5 continents laid out, 0 overlapping pairs, 0 areas outside.
- Screenshots (incremental): `phase-01_*`. They show the first pass, where the arrows were all drawn but mostly faint (Arkane 82 of 99).

## Phase 2 — The layout keeps linked areas close, so the arrows stay visible

- Core: 31 suites, 601 tests pass; coverage of `continentLayout.ts`, `autoLayout.ts` and `render.ts` is 100% (statements, branches, functions, lines). Scripts: 11 pass. ESLint clean on `src` and `scripts`.
- New tests: the link pull brings a linked pair closer and is deterministic, the silhouette is returned in cells, degenerate cases (a column, two hints on one spot, a silhouette thinner than a box), the fade rule scales with the picture.
- Arrow figures, real renderer, 5 continents (faint = over 150 px or over 15% of the picture):

| Continent | Before the outline | Phase 2 |
|---|---|---|
| Arkane (88 areas, 99 links) | 32 faint | 35 |
| Tropica (31, 36) | 12 | 15 |
| Althainia (131, 154) | 47 | 32 |
| Shokono (24, 25) | 13 | 6 |
| Icewall (63, 65) | 13 | 27 |
| Total | 117 | 115 |

- Median arrow length (px): Arkane 288 to 240, Althainia 240 to 218, Shokono 176 to 163, Tropica 138 to 144, Icewall 176 to 208 (worse). Icewall is the weak one.
- Screenshots (incremental): `phase-02_*` (the outlines traced from the sheet, and each of the five continents with the real renderer, arrows included).
- Not run: the site page itself. The shaped layout is not published and nothing under `wwwroot` was touched.

## Phase 3 (re-planned) — The owner can place the world and the continents

- `node --test scripts/placement-tool.test.mjs scripts/layout-continent.test.mjs scripts/layout-auto.test.mjs` in `services/shattered-maps-core`: 15 pass (4 new: arguments, the world tokens and exits, a continent's tokens and frame, the embedding that cannot end the script block). ESLint clean on `scripts`.
- Real map (`audited-map.relayout.json`): six pages generated into the private `world-map/training/` folder: World 37 places (12 starting guesses, 68 linked pairs), Arkane 88 (22 guesses, 99 pairs), Althainia 131, Icewall 63, Tropica 31, Shokono 24.
- Browser check, `evidence/verify-tool.mjs`, on the World and Arkane pages: places start on the map and in the list; dragging a token moves it and confirms it (Arkane 11,0 to 14.8,2.6 rooms); a place dragged in from the list is placed and leaves the list; selecting a token lists its exits; the placement is autosaved in the browser. All checks pass.
- Screenshots (incremental): `phase-04_placement-tool-*.png`, and `phase-03_arkania-atlas-v3-coordinate-grid-and-zone-footprints.png` for the coordinate overlay.
- Not run: the "Save to file..." picker (it needs a person at the keyboard), and any use of the saved file (Phase 4).

## Owner feedback on the starting guesses (2026-11-19)

- The owner looked at `screenshots/incremental/phase-04_placement-tool-arkane-start.png` (Arkane, starting guesses): "a pretty reasonable starting point". The layout is not wildly off in relative terms; the spacing does not quite fit the real continent. This is a review of the guesses, not a placement: nothing is confirmed, so Phase 4 still waits for the owner's saved `placements-*.json`.
