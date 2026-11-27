---
type: proposal
title: Port the Crafting Helper to mobile, with selectable display modes and edge icon docks
slug: 2026-11-26_mobile-crafting-helper-port-and-hud-docks
created: 2026-11-26
state: active
data-classification: personal
---

# Port the Crafting Helper to mobile, with selectable display modes and edge icon docks

## Problem or opportunity

The Crafting Helper plugin exists only in the web game client; the mobile client has no equivalent.

Screen space on mobile is limited. The user wants to decide how automation status and panels are shown, and to be able
to fold options and menus away.

## Proposed work

1. **Port** the web Crafting Helper to the mobile client. It is a port, not a move: the web version stays.
2. **Display modes.** In the user's words: "We should add a docked option, floating option, and text-only option similar
   to autopilot, where we can allow the user to decide how they want to see things."
3. **Edge docks.** "It would also be nice if we could support left or right bound pill docks - kind of like a collapsed
   tray nav - that allows users to fold out more options or show/hide menus so that the limited screen real estate can be
   optimally managed."
4. **Applies to** autopilot, crafting and equipment: "This applies to both autopilot and crafting, and we should also
   make it apply to equipment."

### Reference for the edge dock

The user sent a screenshot of the VS Code window with the **activity bar** circled: the narrow vertical strip of icons
on the left edge, each icon opening or closing a side panel, with account and settings icons at the bottom of the strip.
The image was shared in chat only and is not saved in this folder.

Clarified during scoping (2026-11-26): the third display mode is the minimum information needed to convey the meaning
(buttons where they fit, text where information must be shown); there are two docks (left and right) holding all
show/hide controls; using the docks at all is a settings option. Details in `scope.md`.

## Who benefits

Players using the mobile client.

## Constraints and known unknowns

- Process asked for: propose, scope, tech plan, the user reviews, then implement. No code before that review.
- The web Crafting Helper stays as it is.
- Found while checking feasibility (2026-11-26), to be confirmed in scoping:
  - the mobile plugin host does not deliver the character-login or connection-closed events that the web plugin uses to
    abandon a run (`dsl-client/features/scripts/script-engine.ts`, `dsl-client/features/connection/connection-manager.ts`);
  - the character identity global the web plugin reads does not exist on mobile;
  - mobile storage (AsyncStorage) is asynchronous, the web plugin's storage is synchronous;
  - the mobile plugin API has no HUD widget support.
- Known unknowns:
  - whether a run keeps going while the app is in the background;
  - which of docked, floating and text-only each of the three features supports today;
  - what else, besides these three features, the edge dock should hold;
  - whether the dock work should be split into its own item.

## Related

- `.ai-plans/active/2026-09-12_autoleveling-mobile-port/` (autopilot on mobile; all phases done, awaiting sign-off)
- `.ai-plans/active/2026-11-18_autopilot-live-test-findings/`
- `.ai-plans-completed/2026-10-17_plugin-config-save-freezes-defaults/`

## Added by the user (2026-11-26, after planning began)

- Fix: the web client's timers keep running when the game connection is lost; timers should be skipped or paused when it drops.
  Extended to mobile by the user's answer.
- The mobile compass bar can be docked elsewhere or floated.
- The mobile input bar can be placed at the top or bottom, or hidden.
- A setting resets the screen layout to defaults, for a player who can no longer find things.
