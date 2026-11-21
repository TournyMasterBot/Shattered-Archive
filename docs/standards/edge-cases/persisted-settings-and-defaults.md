---
topic: "Persisted settings merged with defaults: saving, equality, live state, write routes, migrations"
prefix: SETTINGS
applies-when: "saved settings, user config, defaults merged with stored values, localStorage, AsyncStorage, cloud-synced settings, import/export of settings, data migrations, plugin configuration"
---

### SETTINGS-01 Persisting a defaults-merged object freezes the defaults
- Applies when: code saves a settings object that was built as `{...defaults, ...saved}`, or a draft seeded from one.
- Edge case: untouched defaults are stored as if the user chose them, so later changes to the shipped defaults never reach that user.
- Required behaviour: persist only the values that differ from the defaults; keys the user left alone stay absent and follow future defaults.
- Verify: a test that saving with no edits stores nothing; after the default changes and a reload the new default is read, and an edited
  key keeps the user's value.
- Origin: 2026-10-17_plugin-config-save-freezes-defaults

### SETTINGS-02 "Same as default" is decided by strict structural equality
- Applies when: code decides whether a stored value equals its default.
- Edge case: coerced equality (`"5"` vs `5`), key-order-sensitive object comparison or reference equality wrongly keeps or drops values.
- Required behaviour: compare strictly and structurally: no type coercion, arrays by order, objects by key regardless of order; anything
  not strictly equal stays stored.
- Verify: unit tests for string-vs-number, reordered object keys, reordered array, a nested table, `null` vs missing.
- Origin: 2026-10-17_plugin-config-save-freezes-defaults

### SETTINGS-03 Dropping a stored key leaves the live runtime value stale
- Applies when: a running component keeps its own copy of settings and updates it by merge or patch (`Object.assign`, spread).
- Edge case: after a key leaves storage (pruned save, reset) the running copy keeps the old value until reload, because a merge cannot
  remove keys.
- Required behaviour: replace the running copy with `{...defaults, ...stored}` so live state equals what a reload would produce.
- Verify: a test that changes a setting while running, saves or resets, and asserts the running config equals the defaults with no reload.
- Origin: 2026-10-17_plugin-config-save-freezes-defaults

### SETTINGS-04 A write route bypasses the normalization
- Applies when: stored settings can arrive by more than one route: the editor, cloud load, file import, a component patching itself, an
  older client.
- Edge case: the fix lands in the editor only, so the other routes keep writing the old shape.
- Required behaviour: normalize in the one function every route writes through, or have each route call the same helper; the plan lists
  the routes.
- Verify: a test per route that writes the old shape and asserts the stored result is normalized.
- Origin: 2026-10-17_plugin-config-save-freezes-defaults

### SETTINGS-05 A data-rewriting migration is not one-shot and non-destructive
- Applies when: code rewrites existing stored data on startup or load.
- Edge case: it runs on every launch and rewrites unchanged data, mutates shared or frozen input, or throws into startup and loses data.
- Required behaviour: idempotent (a marker, or no write when nothing changed); builds new objects and never mutates its input; on failure
  leaves stored data untouched and the app running.
- Verify: run it twice and assert the second run writes nothing; run it on a frozen input; run it against throwing storage and assert the
  data is unchanged and the app continues.
- Origin: 2026-10-17_plugin-config-save-freezes-defaults

### SETTINGS-06 "Never set" and "deliberately emptied" look the same
- Applies when: code seeds defaults into a stored list or overlay when it reads as empty.
- Edge case: the user deletes every row on purpose, and the next load seeds the defaults again.
- Required behaviour: read distinguishes "no record" from "an empty record"; only "no record" seeds, and seeded rows are not stored until the user edits.
- Verify: a test that an absent record seeds, an empty stored record stays empty, and a seeded-but-untouched list writes nothing.
- Origin: 2026-11-13_editable-autopilot-targets-synced

### SETTINGS-07 A function that rebuilds a stored row from named fields drops the fields added later
- Applies when: code rebuilds a stored or draft row from a list of named fields (a mode switch, a "reset to X") instead of copying the row.
- Edge case: `setBuffGate` in the autopilot Combat step rebuilds a buff row from `label`, `cmd` and a short `keep` list, so `vitalsGate` and `onceKey` (which belong to every gate mode) are lost when the mode changes, and every field added later is lost the same way.
- Required behaviour: rebuild by spreading the existing row and removing only the fields that belong to the old mode alone; a new field is carried by default.
- Verify: a test per row field that switches every mode (and back) and asserts the field survives; adding a field to the row type makes the test list fail until the field is listed.
- Origin: 2026-11-18_autopilot-live-test-findings
