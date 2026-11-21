---
type: proposal
title: A world and continent map that feels like the real one (silhouettes, real positions, arrows kept); areas and subzones stay grids
slug: 2026-11-19_realistic-world-and-continent-maps
created: 2026-11-19
state: active
data-classification: public
---

# A world and continent map that feels like the real one

## Problem or opportunity

The continent picture of the Maps viewer (`/maps/world-v2`) lays the area boxes out as a loose diamond whatever the real landmass looks like, and
there is no world picture at all, only a continent drop-down. The owner wants the **world and continent levels to feel real**, directionally: the
continents where they lie on the world picture (`shatteredarchive.com/img/world.webp`, the legacy `dsl-mud.org/algoron/maps_legacy.asp`
maps), each continent in the shape of its landmass, areas inside it in their real relative positions. **Areas, subzones and rooms stay grids.**
The lines with arrowheads between areas (the exits between them) must stay readable: a first pass that filled the silhouette lost them
(82 of 99 Arkane arrows drawn faint, linked areas far apart).

## Proposal

1. A continent's silhouette (polygon) and optional per-area position hints steer the layout (done: `outline`, `hints` on the layout spec).
2. The layout keeps linked areas close while filling the silhouette, so the arrows stay short and visible.
3. The silhouette is part of the map data and is drawn behind the boxes as the landmass.
4. A world level shows the continents as landmasses where they lie on the world picture, each opening its continent.
5. Documentation and showcase screenshots.

## Who benefits

Players and the owner reading the map: a place is where it is on the world, the continent looks like the continent.

## Constraints and known unknowns

- The owner's Google sheet of positions was not readable (it needs a Drive sign-in); `hints` for single areas wait for it.
- The served layout is the owner's: nothing is published until the owner says so (`publish-audited.mjs`).
- Limbo, Oceans and Unsorted have no landmass on the world picture.
- Other viewers (game-client window, Mapper, phone) share the renderer; a renderer change reaches them through `scripts/publish-map-renderer.mjs`.
- Traced outlines are rough on purpose ("directionally, it does not have to be perfect").
