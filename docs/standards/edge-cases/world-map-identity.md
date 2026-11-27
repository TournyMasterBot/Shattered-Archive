---
topic: "Building a room, area and world map from observations: identity, fixtures and transient contents"
prefix: MAPID
applies-when: "world map, room identity, room graph, fixtures, transient contents, baseline, subzone, area, mapper, Shattered-Maps, observations, off-page link"
---

### MAPID-01 Transient presence is baselined as a fixture, or two places are merged on a repeated title
- Applies when: observed rooms or room contents become map facts.
- Edge case: a player, charmed creature or dropped item seen once becomes "what is in the room"; two rooms with the same title and exits merge; one room with a newly found hidden exit splits in two.
- Required behaviour: contents become fixtures only after repeated, consistent sightings across separate visits, and anything below that stays transient; merges and splits follow a stated confidence rule and always keep the prior baseline ("what was there before"), so a wrong decision can be reversed.
- Verify: tests with a one-off sighting, a fixture that vanishes for N visits, a repeated title in two areas, and a hidden exit appearing; each asserts the baseline and the history kept.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot
