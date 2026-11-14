---
topic: "Bundled fallback snapshots served in place of live upstream data"
prefix: FALLBACK
applies-when: "offline snapshot, fallback data, upstream fetch, X-Maps-Source, cached catalog, web-server proxy, SHATTEREDARCHIVE_BASE"
---

### FALLBACK-01 A fallback snapshot silently replaces live data
- Applies when: a service serves a bundled snapshot when its upstream call fails.
- Edge case: the container's upstream address was wrong (`localhost` inside a container), so every request got the 2026-09-19 snapshot (31 of 48 classes) and nothing flagged it.
- Required behaviour: the upstream address is checked against how the service is deployed; serving a fallback is visible (a response header and one warning per process, not per request), and the snapshot is regenerated when the live catalog changes shape.
- Verify: a test that a failed upstream call returns the fallback with its source header set; a deployed-container check that the header reads `upstream`.
- Origin: 2026-11-13_editable-autopilot-targets-synced
