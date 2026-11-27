# Scope: a world and continent map that feels like the real one

(Facts for a human to size; no estimates.)

## What it touches

| Area | Where | Count / notes |
|---|---|---|
| Layout | `services/shattered-maps-core/src/continentLayout.ts`, `autoLayout.ts`, `scripts/layout-continent.mjs`, `scripts/layout-auto.mjs` | spec gains `outline`, `hints`, `outlineFill` (done) |
| Map data | `schema.ts`, `validate.ts`, `docs/shattered-maps/schema.md` (a new field needs all three) | continent silhouette in cells; world position of a continent |
| Slices and publish | `hierarchy.ts` (`MapSlice`), `publish/audited.ts` (manifest continents) | the page builds its continent slice from the manifest |
| Renderer | `render.ts` (`continentSvg`, a new world picture), `scripts/publish-map-renderer.mjs` regenerates `worldmap2.js` for the site and the phone | one renderer, five viewers |
| Site page | DSL repo `Views/Maps/WorldMapV2.cshtml`, `wwwroot/js/maps/worldmap2-page.js` | continent drop-down today, no world level |
| Other viewers | Mapper `apps/shattered-maps-client` SliceView, game-client `WorldMapWindow`, mobile screen | legends and picture must agree |
| Owner data | private `world-map/layout-shaped/*.json`, `audited-build/audited-map.shaped.json` | 5 continents with outlines traced from `world.webp` |

## Stakeholders

Players reading the map; the owner (publishes, owns the geography); Copilot (reads the same map file).

## Data touched

Public game geography only (area ids and names, room counts, polygons). No personal data. Classification: public.

## Dependencies

- `world.webp` (600 x 480) as the reference for continent shapes and positions; the legacy maps page for area positions.
- Core build before any script; renderer republish before the site and phone see a renderer change.
- The local site at `localhost:5000` and the owner's running stack for screenshots; no dev server is started.

## Unknowns and open questions

1. Per-area positions (the owner's Google sheet) are unavailable until the Drive connector is authorised.
2. Where continents without a landmass (Limbo, Oceans) sit on a world level.
3. Whether the area-link arrows should fade by pixel length (today 150 px) or by what the layout says is near.
4. Whether the other viewers get the landmass and the world level in this item or after.
5. Inter-continent exits (ports, portals): drawn on the world level or not.
