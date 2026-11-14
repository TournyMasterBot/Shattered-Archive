---
topic: "Pointer interaction on a draggable, zoomable surface: pan, zoom, drag, click targets inside it"
prefix: POINTER
applies-when: "pan, zoom, drag, drag to move, resize handle, pointer events, setPointerCapture, wheel, canvas or SVG viewer, map viewer, clickable elements inside a draggable surface, floating window"
---

### POINTER-01 Capturing the pointer on press makes the click go to the surface instead of the element that was clicked
- Applies when: a surface (map, canvas, image viewer, floating window body) both pans on drag and has clickable children (rooms, markers, links, buttons drawn inside it).
- Edge case: `setPointerCapture` is called in the pointer-down handler. In a real browser the click that ends a plain press is then retargeted to the capturing element, so `event.target.closest(...)` never finds the child that was clicked and every click on a child does nothing. jsdom has no pointer capture, so unit tests that fire clicks on the children pass.
- Required behaviour: the pointer is captured only once the press becomes a drag (past a small slop of a few pixels), and released only if it was captured. A plain press and release leaves the click on the element under the pointer. The click that ends a drag is swallowed once, and a new press clears that guard, so a drag that ended without a click cannot swallow the next real one.
- Verify: a unit test that the capture call is not made for a press under the slop and is made once for a drag, and one where a drag ends with no click followed by a plain click that is handled; plus a real-browser run (Playwright) that clicks a child of the surface after a drag and after a plain press and sees the child's action happen.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot (the map window, Phase 28).

### POINTER-02 A drag delta is read inside a state updater that runs after the position has moved on
- Applies when: a pointer-move handler updates view state with a functional updater (`setPose((p) => pan(p, event.clientX - last.x, ...))`) and then stores the new last position.
- Edge case: the updater runs later, during render, after `last` was overwritten, so the delta is zero and the surface does not move at all (or moves one step behind).
- Required behaviour: the delta is computed into local constants before the last position is stored and before the updater is created; the updater closes over the constants.
- Verify: a test that drags by a known distance and asserts the exact resulting offset (not only that something changed).
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot (the map window, Phase 28).

### POINTER-03 The wheel handler cannot stop the page from scrolling
- Applies when: a surface zooms or scrolls with the mouse wheel inside a page that scrolls.
- Edge case: React's `onWheel` is registered as a passive listener, so `preventDefault()` does nothing (and warns): the wheel both zooms the surface and scrolls the page behind it.
- Required behaviour: the wheel listener is added with `addEventListener('wheel', handler, { passive: false })` on the surface and removed on unmount; it zooms around the pointer, so the point under the pointer stays under it. Overlay controls that sit outside the surface do not receive the wheel and need no handling.
- Verify: a test that dispatches a wheel event on the surface and asserts the zoom changed and the point under the pointer did not move; in a real browser, a wheel over the surface does not scroll the page.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot (the map window, Phase 28).
