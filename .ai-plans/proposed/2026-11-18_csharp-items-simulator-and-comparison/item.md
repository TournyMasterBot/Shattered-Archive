---
type: proposal
title: C# web service: item list categories, item search filters, character simulator and an item comparison tool
slug: 2026-11-18_csharp-items-simulator-and-comparison
created: 2026-11-18
state: proposed
data-classification: internal
---

# C# web service: item list categories, item search filters, character simulator and an item comparison tool

## Problem or opportunity

The owner listed these changes for the C# web service (Shattered Archive site). Their words, numbered as they gave them:

1. The item list does not show the item category, for example a sword or an axe. In filters this would be the weapon or armor type; on the all-items page it is the same thing as the category the item is grouped under. From the all-items page it is easy to tell what something is, but when filters are applied it is not clear what the category is supposed to be.
2. For the character simulator: reclasses start when a user reclasses from their base level. The earliest eligible time is 10; the most common times are 11 or 51 (the level is halved, rounded down, so an odd level gives bonuses).
3. Users should be able to manually set the assumed HP / MP even if not known. If the mana is known, the defaults should be set and estimated.
4. Mages have a chance to get double gains. The owner observed this while levelling mage attempts and did not experience it until levelling as a female; it is not known whether that is a requirement to trigger them. Evidence: the owner's mage-attempts levelling log among the supporting logs of their story notes in the DSL repo's Books folder; other mage levelling logs should exist and may or may not support it.
5. On the item search page the filters are difficult to process mentally: the groupings are poor, they are laid out poorly, and similar searches are not close together. Group all filters under a single tab for expansion and rework the layout to make more sense from a human perspective. Users typically go in thinking about what they want: things related to weapons, things related to armor (often by item type or armor level such as cloth, leather, plate), or some specific goal.
6. There is a minimum hit dice filter but no maximum hit dice filter.
7. A new tool, **item comparison**: select one or more items of the same type (primarily weapons and armor, things that share similar stat comparison points) and compare several head-to-head: weapon damage, armor (physical versus magical protection) and abilities.

## Proposed work

All seven, as stated. Items 1, 5 and 6 are item-search page work and probably share a plan; 2, 3 and 4 are character-simulator work; 7 is a new tool.

## Who benefits

Players choosing gear and planning characters on the Shattered Archive site.

## Constraints and known unknowns

- Item 4 needs log evidence before any simulator rule is changed (look for the double-gain lines in the mage levelling logs; check whether the character's sex matters).
- Item 2: how the simulator models a reclass today, and the rule "the level is halved, rounded down, so an odd level gives bonuses", need checking against the class pages and the owner's logs.
- Item 7: which stats are comparable across weapons and armor, and how abilities are shown, are open.
- Game questions are answered from the Archive data (`archive_ask`), not from scraping.

## Related

- The item search page, all-items page and character simulator in the DSL repo's `Server.Web.Public`
- `.ai-plans/proposed/2026-11-18_world-map-extensions-round-2` and the other tickets from the same list
