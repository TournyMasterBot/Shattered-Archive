---
type: proposal
title: Buff plugin with predefined per-class buff sets and buff<class> commands
slug: 2026-11-26_class-buff-plugin-with-buff-commands
created: 2026-11-26
state: proposed
data-classification: personal
---

# Buff plugin with predefined per-class buff sets and buff<class> commands

## Problem or opportunity

Re-applying buffs without recasting the ones already active currently takes hand-written user scripts: a Globals
JavaScript block holding a buff list per class, one alias per class, and a trigger on the affects list. Each player has
to write and wire these up, and to keep the affect names and cast commands right themselves.

## Proposed work

A buff plugin in the game client that formalizes that setup and automates it.

- All the known buffs for each class are set up as predefined items.
- A simple command, `buff{three-letter class acronym}` (for example `buffskn`, `buffmag`, `buffcle`), triggers that
  class's buffs, skipping the ones already active.
- The configuration allows each buff to be toggled enabled or disabled by default.
- The user can add custom buffs on the configuration screen (for example for a race or another special feature).
- The appropriate alias and scripts are generated for the user automatically.

## Who benefits

Players who keep a set of buffs up, in particular those who do not want to write scripts to do it.

## Constraints and known unknowns

What the hand-written version showed (2026-11-26):

- Active buffs are known from the affects list, requested with `a`. The names it reports differ from the shortened cast
  commands (`detect hidden` for `c 'detect hid'`).
- Some buffs leave no affect on the character (Sanctify acts on equipment), so they cannot be detected as active.
- The affects list usually returns in about 0.2 s, but 14 of 293 sampled requests took over 1 s. A fixed 1 s wait can
  therefore act on the previous list.
- A buff still on the list counts as active even on its last tick.
- A global script cannot receive game events; the list had to be passed in by a trigger.

Known unknowns:

- Where the predefined buff list for each class comes from, and how it stays current.
- The three-letter acronym for each class.
- Which predefined buffs are enabled by default.
- Whether "generate the alias/scripts" means user scripts the player can see and edit, or commands the plugin handles
  itself.
- How a custom buff that has no affect should behave.
- Whether the mobile client is in scope.

## Related

- `apps/game-client/src/features/plugins/core-plugins/respell.plugin.ts`: the existing Auto Respell plugin, which
  recasts a configured spell when it drops. This proposal casts on demand.
- `apps/game-client/src/features/autoleveling/autoleveling-buff-catalog.ts`: an existing buff catalog (label, command,
  affect name).
- `.claude/skills/shattered-plugin`: the house pattern for a game-client plugin.
