---
type: proposal
title: Review four plan groups: the SDK 58 upgrade, the Simulacrum admin panel, editable autopilot targets, and the closed-incomplete plans
slug: 2026-11-18_active-and-closed-plan-reviews
created: 2026-11-18
state: active
data-classification: restricted
---

# Review four plan groups: the SDK 58 upgrade, the Simulacrum admin panel, editable autopilot targets, and the closed-incomplete plans

## Problem or opportunity

The owner wants four reviews of work that may be done but is not closed out. Their words, numbered as they gave them:

1. Review the implementation of the SDK 52 to SDK 58 upgrade (`.ai-plans/active/2026-11-01_mobile-expo-sdk-upgrade`). The owner believes this work is done: if any items beyond testing are still open, say so; otherwise close it out as complete, since testing went well.
2. Review the implementation of the Simulacrum admin panel (`.ai-plans/active/2026-11-07_simulacrum-admin-panel`) and advise what, if anything, is still open. (Its plan shows 15 of 15 phases done and waiting for sign-off.)
3. Review the implementation of editable autopilot targets (`.ai-plans/active/2026-11-13_editable-autopilot-targets-synced`) and advise what, if anything, is still open. (Its plan shows 6 of 12 phases done; the next is Phase 6b, the authenticated round trip.)
4. Review the implementation of the closed-incomplete plans (`.ai-plans-completed/closed-incomplete`). The owner thinks many were implemented but not fully marked as tested, and that they were tested; see whether they need to move to completed instead.

## Proposed work

For each group: read the plan and compare it with the code and the test results, and report what is still open. Item 1: close the plan as complete when nothing but testing is open. Item 4: for each closed-incomplete plan, say whether it was implemented and verified (move it to completed) or has real work left (say what). Moving or closing a plan is only done on the owner's word for each, since sign-off is theirs.

## Who benefits

The owner, who wants the active list to be true.

## Constraints and known unknowns

- Sign-off and the move to `.ai-plans-completed` are the owner's (`/implement-plan` step 3); the review reports, it does not sign off.
- Known unknown: how many plans are in `closed-incomplete` and how much of each is verified; a plan folder may lack `test-results.md`, in which case "implemented and tested" needs another source (git history, the code and its tests).

## Related

- `.ai-plans/active/2026-11-01_mobile-expo-sdk-upgrade`, `.ai-plans/active/2026-11-07_simulacrum-admin-panel`, `.ai-plans/active/2026-11-13_editable-autopilot-targets-synced`, `.ai-plans-completed/closed-incomplete/`
- `docs/claude/work-item-workflow.md`
