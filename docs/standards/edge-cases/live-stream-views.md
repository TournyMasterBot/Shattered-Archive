---
topic: "Views that capture a live stream (GMCP, logs, socket output) in memory"
prefix: LIVESTRM
applies-when: "live stream, GMCP debug view, packet log, socket output, raw message view, event listener that collects messages, rolling buffer"
---

### LIVESTRM-01 An in-memory capture of a live stream has no cap and keeps listening after the view closes
- Applies when: a view collects messages from a stream that never ends (GMCP, raw socket text, a tailed log) into component or module state.
- Edge case: the buffer grows for as long as the page lives, each new message re-renders a long list, and the listener keeps collecting after the view is hidden or closed.
- Required behaviour: the buffer has a fixed maximum length that drops the oldest entries, rendering is bounded (windowed or capped), and the listener is removed when the view unmounts or the capture is stopped.
- Verify: a test pushes more than the cap and asserts the length equals the cap and the oldest entries are gone; after unmount no further message is stored and no listener remains.
- Origin: 2026-11-07_simulacrum-admin-panel
