---
type: proposal
title: Editable pre-loaded autopilot mob targets, personal to the user and synced web and mobile
slug: 2026-11-13_editable-autopilot-targets-synced
created: 2026-11-13
state: active
data-classification: personal
---

# Editable pre-loaded autopilot mob targets, personal to the user and synced web and mobile

## Problem or opportunity

The mob targets that come pre-loaded for an autopilot area (the server's `recommendedTargets`) cannot be corrected by the
player. In the wizard's targets step the pre-loaded ones can only be switched on or off for the current draft; only
targets the player adds themselves ("custom") can be added or removed, and nothing can be edited. When a pre-loaded
target's room name or `kill` keyword is wrong or missing, autopilot never engages that mob and the player has to fix the
targets by hand. This was seen in a live session on 2026-11-13, where mobs that were listed in the room (for example a
large bird) were never engaged because they were not in the target list.

The player's own corrections should be theirs: personal preferences, kept across sessions, and carried between the web
client and the mobile app when they are logged in to Shattered Archive. The mobile app has no autopilot today (no engine,
no wizard, no autoleveling cloud sync), so that half does not exist yet.

## Proposed work

Owner decisions, 2026-11-13:

1. **Per-user override layer.** The server's pre-loaded list stays untouched. A player's edits (change a target's room
   name or kill keyword, or hide a target) are saved as their own override, keyed to that area target. Each edited
   target has a "Reset to default" control. Server list updates still reach every target the player has not edited.
2. **Sync with the existing manual buttons.** When logged in, overrides travel through the existing Save/Load to cloud
   buttons in the account modal and the existing autoleveling user-content endpoint, last writer wins per record. No
   automatic sync. Overrides must be part of that existing export and import.
3. **Mobile is in this item.** Port autopilot to the mobile app, including cloud sync of the autoleveling user data, so
   overrides round-trip between web and mobile.
4. **Order of work.** The web side (override layer, editor UI, sync round trip) is finished and verified first; the
   mobile phases come after it.
5. **Complete class list (added 2026-11-13).** The autopilot class selection should offer every playable class, not the
   subset it shows today.
6. **Pre-populated abilities (added 2026-11-13).** If possible, pre-populate the combat and buff abilities for the chosen
   class from the DSL main-site data imported earlier, which should generally document them.

## Who benefits

Players who use autopilot on web and, once ported, on mobile; anyone whose area has a wrong or incomplete pre-loaded
target list. The owner, who currently has to correct targets by hand during a run.

## Constraints and known unknowns

- Web is finished before mobile (the owner's standing rule), even though both are in this one item.
- Sync stays manual and rides the existing autoleveling user-content endpoint and record format (last writer wins).
- Unknown: whether the server's `/api/user-content/autoleveling` endpoint already stores any record kind, or only the
  kinds it knows today, which decides whether a new override record kind needs server work.
- Unknown: how mobile hosts the autopilot engine, since the engine depends on the game client's event bus and plugin
  system, which mobile does not share.
- Unknown: how an override is matched to a pre-loaded target when the server later renames or removes that target.
- Unknown: the data class of the stored overrides. They are per-account preferences (mob names and keywords), so scope
  should confirm Internal versus Personal. This document holds no personal values.
- Unknown: whether a player can also edit the keyword list, not only the single kill keyword, and whether "hide" applies
  to custom targets.

## Related

- `.ai-plans/proposed/2026-09-12_autoleveling-mobile-port/` — the existing, never-scoped mobile port plan; this item
  depends on it for the mobile phases rather than duplicating it.
- `.ai-plans/active/2026-11-05_copilot-ai-training-sibling-to-autopilot/` — Copilot sits beside autopilot and reads the
  same target data.
- Code areas named by the owner: `apps/game-client/src/features/autoleveling/autoleveling-user-data.ts`
  (`exportAll`, `importRecords`), `apps/game-client/src/components/wizard/TargetsStep.tsx`,
  `apps/game-client/src/features/auth/cloudSync.ts`.
