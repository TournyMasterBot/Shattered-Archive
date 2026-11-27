---
topic: "Cloud-synced per-account user content: record kinds, whole-collection saves, edits keyed to server-owned ids"
prefix: CLOUDSYNC
applies-when: "cloud sync, Save to cloud, Load from cloud, /api/user-content, UserRecord, record kinds, whole-collection PUT, import/export of user data, web and mobile sharing stored data, personal overrides"
---

### CLOUDSYNC-01 The client stores a record kind the server does not accept
- Applies when: the client exports local records to a server that validates a fixed list of kinds, or either list changes.
- Edge case: the client has 6 kinds, the server accepts 5 (`abilityTiming` is stored and exported but rejected), so the whole upload fails with a 400 and nothing syncs.
- Required behaviour: every kind the client can export is accepted by the server, or is filtered out before upload on purpose; a new kind lands in both in the same change.
- Verify: a test that lists the client's kinds and asserts each one is in the server's list or in the client's explicit not-synced list; a real PUT of one record per kind returns 200.
- Origin: 2026-11-13_editable-autopilot-targets-synced

### CLOUDSYNC-02 A whole-collection save from a device that never loaded overwrites the other device
- Applies when: the server stores one blob per account and a PUT replaces it, with merging done only on the client at load time.
- Edge case: the phone saves its local records without loading first and wipes edits made on the web.
- Required behaviour: a save either loads and merges first (newest `updatedAt` wins per record) or tells the user it will replace the cloud copy.
- Verify: a two-store test: store A saves record 1, store B (never loaded) saves record 2; assert the cloud copy still contains record 1, or that the save was refused or warned.
- Origin: 2026-11-13_editable-autopilot-targets-synced

### CLOUDSYNC-03 A user's edit is keyed to an id the server owns and later changes
- Applies when: a personal override or note is attached to server-supplied content (area, target, item) by its name or id.
- Edge case: the server renames or removes the item; the edit silently stops applying or is deleted.
- Required behaviour: the unmatched edit is kept, not applied, and shown as unmatched; it re-attaches if the key returns; deleting it is the user's action.
- Verify: a test with an override whose key is absent from the served list: it is not applied, still stored, still exported, and reapplies when the key reappears.
- Origin: 2026-11-13_editable-autopilot-targets-synced
