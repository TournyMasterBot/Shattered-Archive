---
type: tech-debt
title: Untested menu items and handlers in MainMenuBar and MainContainer
slug: 2026-11-07_mainmenubar-maincontainer-untested-handlers
created: 2026-11-07
state: proposed
data-classification: internal
---

# Untested menu items and handlers in MainMenuBar and MainContainer

## Where
- `apps/game-client/src/components/MainMenuBar.tsx`: the window-click close handler (`handleWindowClick`, line 66), the File menu toggle (line 81) and its Connect and Account items (lines 86-100), the Game menu toggle (line 109), the Game settings submenu and its Graphics, Audio and Accessibility items (lines 112-123), and the Script Sandbox and Custom Styles items (lines 131-145). The list continues for the remaining items and handlers below line 150.
- `apps/game-client/src/pages/MainContainer.tsx`: the resize and other effects (lines 65, 75, 129-151, 203-268) and the open-modal handlers `handleOpenCustomStyles` through `handleOpenScriptingHelp` (lines 179-193), except the Copilot one.
- Existing tests: `MainContainer.test.tsx` (shell selection, Copilot flag off), `MainContainer.copilot.test.tsx` and `MainMenuBar.copilot.test.tsx` (Copilot only). The shared stubs are in `apps/game-client/src/testing/mainContainerHarness.tsx`.

## Why it is debt
These menu items and handlers have no test that clicks the item and checks what it opens or does. Their coverage comes only from tests written for other features, so they have none of their own. The lines are older than the Copilot work; the git history of both files has the exact origin.

## Cost today
- Every change to either file triggers the completion gate's coverage check, which reports these untaken branches and never-called functions. The Copilot Phase 12 change had to answer it with an `OVERRIDE coverage` marker (the third and last block of the gate) instead of a clean pass.
- A regression in one menu item (wrong modal opened, handler no longer wired) would not be caught by any test.

## Risk if left
- Each later feature that adds a menu item or modal to these two files will meet the same gate block, and each will need another override.
- Wiring changes (for example the HUD theme shells or a menu reshuffle) can silently break an item.

## To investigate
- Which of the listed handlers are really unreached (the gate output cites lines, but the file has changed since), and which are reached only through the real child components that the harness stubs.
- Whether the harness stubs can stay as they are for per-item tests (click the item, assert the modal's stub renders or the store call is made), or whether a few items need the real modal.
- Whether the window-click close and the resize effects can be tested without fake timers or layout, which jsdom does not provide.
- Whether any handler is dead code, to be removed rather than tested.

## Revisit when
The next feature adds a menu item or modal to `MainMenuBar.tsx` or `MainContainer.tsx`, or the HUD shell or menu structure is reworked.

## Where it was found
While implementing Copilot Phase 12 (`.ai-plans/active/2026-11-05_copilot-ai-training-sibling-to-autopilot`). The Copilot lines in both files are covered; the gate also cited the older code around them.
