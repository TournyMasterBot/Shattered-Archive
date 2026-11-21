---
type: proposal
title: World map extensions, round 2 (publishing, verticality, off-zone links, doors, red dot, room history and more)
slug: 2026-11-18_world-map-extensions-round-2
created: 2026-11-18
state: proposed
data-classification: internal
---

# World map extensions, round 2 (publishing, verticality, off-zone links, doors, red dot, room history and more)

## Problem or opportunity

The owner reviewed the map as it stands after the Shattered-Maps / Copilot plan (A56 and its follow-ups) and listed what they want changed. Their words, numbered as they gave them:

1. The production instance is not currently getting published. Review the docker container / mount points to make sure we are properly wiring the map up. *(first seen as "my world map does not appear to be published when deployed with prod"; this is the work that was in progress when the list arrived)*
2. Verticality on the map has issues: when navigating from the ground floor up to the next floor the room properly changes on the map from a selection point of view, but the view does not automatically shift to the other (up, down) floor; the correct floor has to be clicked by hand in the left-hand buttons when it should be automatic.
3. The off-zone map links should keep the arrow, but go to a visually distinct / inactivated tile that gives some insight into what that zone might be: instead of only the room name, list the zone / area / continent being linked to, styled differently so it is clear which text is a room name and which is a zone / area / continent name. The arrow should look the same but point in the correct compass direction (instead of always facing right), as transforms or statically, whichever is easier and does not cause a performance issue.
4. The map starts a bit too zoomed in: make the default zoom a bit wider, not so wide that things look incredibly small, just enough for a decent overview of the area.
5. Umbrus Caelum does not appear to be mapped: ensure that it is mapped, using the owner's game logs and potentially the legacy DSL map (unsure whether it was mapped with that tool).
6. Add an icon near the other tools in the bottom right to indicate the map legend.
7. For loopback maze rooms, make the loop a little larger so that it can be clearly seen on the map.
8. When the user first enters a map with maze tangle points, show a tutorial help card saying they can click on the tile and see where the exit leads to. Save that the user interacted with the tutorial in this way and do not show it again. Offer a tutorial reset as well.
9. Add the help / info indicator, similar to the one in the game client for map help.
10. Add a nicer border around the map.
11. Make the map work better with the grey-dark themed container that Shattered Archive and the game client use by default; the scroll bar needs to be explicitly checked as well because it always gets missed.
12. For links between zones, render a few tiles into the next area to visually pad "you will end up here if you go this way", without being overbearing. This matters particularly when a maze technically also warps you to another zone: it should be visible in some way.
13. Clicking a tile once highlights it; a second click should disable the highlight (toggle on, toggle off).
14. The room's description should pop up in a modal from both the game client and Shattered Archive. It should look like the Shattered Archive terminal window for the room, and if the room contains ANSI colour codes the colours should be rendered.
15. The game client shows vertical rooms well with the shadowed tiles, but this does not seem to work on the C# app.
16. The game client has no way to jump to other zone / area / continent maps, so a user cannot explore the game world from the game client.
17. The continent and area selection lists need to be alphabetized.
18. Include a zone selection tool to help users jump to zones.
19. The Shattered Archive directions page should be able to carry a drop-in link that gives the user the ability to look at the map, visible only when the area actually exists. This information should be built statically (it does not change between app builds), not calculated every time. This applies to the C# application and the mobile application.
20. When known, closed doors should be indicated with a door icon on the map between the two tiles; a known locked door with a lock icon instead. The original DSL map service has an example to use as a general guide.
21. The user's red dot should be smaller within the tile; make sure it does not negatively impact the up/down chevrons for stairs.
22. When the map is not actively loaded it should not be processing movements, which should help performance.
23. Do a better job of identifying which room the player is in for the red dot: right now it lights up all rooms of the same name, but there are often directional cues (the room just come in from, how the player is moving through the zone). Giving the same-named rooms internal identities to help track movement through them will improve the navigating experience.

A final step the owner asked for: a phase that audits every single room against the game logs for updates / changes, newest entry wins. For the **local implementation only**, log the history of the rooms so the owner can tell changes over time when they can be identified. Only room **descriptions** are of interest for the history, not exits, mobs, items and so on. The history should be surfaced through the game client and the C# map, again only for the local deployment. It can be treated as a data-mount amendment or similar (see the Copilot work for options), or the planner can make its own proposal.

## Proposed work

All of the above, as the owner listed it, as an extension of the active mapping plan (`.ai-plans/active/2026-11-05_copilot-ai-training-sibling-to-autopilot`). Item 1 is in progress now as the interrupted work: the production site's wiring of the audited map (the local compose file mounts the audited folder and sets `WORLD_MAP_DIR`; the production compose file deliberately sets neither, so production serves only what is published into `wwwroot/data/world-map`).

## Who benefits

Players using the map on the website, in the game client and on the phone; the owner, who curates the map and wants room-description history locally.

## Constraints and known unknowns

- Production wiring: the audited layer, the production publish and the production deploy are the owner's steps; production must never carry the candidate layer, the Simulacrum world or the local-only history (`verify-prod-output.mjs` keeps checking that).
- The room-description history is **local only**; it must not reach the production build, the production compose file or the public API.
- Known unknowns: where Umbrus Caelum is in the owner's logs and in the legacy DSL map; whether a door / lock state is recorded anywhere in the data today (exits in the logs may say "closed" / "locked" in text or in the room's exit flags); how same-named rooms are told apart (item 23); what the original DSL map service drew for doors; the zone-selection tool's shape (item 18); how to build the "area exists" list statically for the directions page (item 19).
- Items 2, 15 and 16 touch more than one surface (game client, C# site, phone): the shared renderer is the common part.

## Related

- `.ai-plans/active/2026-11-05_copilot-ai-training-sibling-to-autopilot` (the mapping plan: amendment A56 and Phase 39, the deferred verification list)
- `docs/shattered-maps/` (world-map-api.md, user-guide.md, surfaces.md), `Server/docker-compose.yml` and `Server/docker-compose-prod.yml` in the DSL repo
- `.ai-plans/proposed/2026-11-18_autopilot-live-test-findings`, `.ai-plans/proposed/2026-11-18_csharp-items-simulator-and-comparison`, `.ai-plans/proposed/2026-11-18_active-and-closed-plan-reviews` (other tickets from the same list)
