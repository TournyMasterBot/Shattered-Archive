# Plugin Configure → Save freezes every default into the saved config

- **Reported:** 2026-10-17, found by the PR #160 deep review (finding CFG-3) — `.ai-code-review/20261017-1350-pr160-crafting-helper/`
- **Severity:** Medium (design-level, affects every plugin; High for plugins that ship large default data)
- **Status:** OPEN. A plugin-only mitigation for Crafting Helper shipped with PR #160's fixes; the root cause below is not fixed.

## Symptom
After a user opens **Configure** on a plugin and clicks **Save** once (even changing nothing), every default value for that plugin is stored in their `userConfig`. Defaults the plugin later ships — corrected recipe rows, new keyword lists, changed timeouts — never reach that user, because `{...defaults, ...userConfig}` lets the stale stored copy win.

## Where
- `apps/game-client/src/components/PluginConfigModal.tsx` — `initialCfg = { ...defaults, ...initialUserConfig }` seeds the draft; `save()` persists **every** key of the draft (`Object.entries(draft).filter(v !== undefined)`).
- `apps/game-client/src/features/plugins/pluginHost.ts` — `enable()` / `syncInstalled()` merge `{ ...defaults, ...userConfig }`, so stored values always override.
- Worst case today: Crafting Helper's `tierTable` (~100 rows) and `craftTypes` drive irreversible vault `get` / `craft` commands. Its own regression test ("pre-multi-component saved config") records this already having broken once.

## Reproduce
1. Enable a plugin with defaults (e.g. Crafting Helper), open Configure, click Save.
2. Inspect the install record: `userConfig` now contains every field, including the full default tables.
3. Ship a new default for one of those fields; reload. The user still gets the old value.

## Mitigation already in place (plugin-only)
`crafting-helper.plugin.ts`: a saved table whose normalized text equals the current default (or a fingerprint listed in `LEGACY_DEFAULT_TABLE_FINGERPRINTS`) is replaced by the current default. This only helps if the maintainer remembers to register the old table's fingerprint when changing a default.

## Proposed fix (larger scale — needs its own PR and review)
Make Save persist **only keys that differ from the plugin's defaults**:
1. In `PluginConfigModal.save()`, drop keys whose value deep-equals `defaults[key]` before calling `onSave`.
2. Leave the host merge as is — it already re-applies defaults on read, so omitted keys follow future default changes.
3. Migration: existing installs keep their frozen copies. Offer a per-plugin "Reset to defaults" in the modal, and/or on first load after the change prune keys equal to the *current* default.
4. Decide the semantics of "pinning": a user who deliberately sets a value equal to today's default will start following future default changes. Acceptable for most plugins; if some need pinning, add an opt-out flag in the field schema.

## Side effects to review before shipping
- Every core plugin (config shape stored changes); cloud-synced installs written by older clients.
- Number/boolean fields where "equal to default" and "explicitly set" mean different things to a plugin (grep `userConfig` consumers and `getConfig()` callers for `=== undefined` checks).
- `usePlugins.updatePluginConfig` replaces `userConfig` wholesale — confirm omitted keys are not read back as `undefined` anywhere.

## Tests to add
- Modal: Save with no edits persists `{}`; Save after editing one field persists only that field; editing back to the default persists nothing.
- Host: `syncInstalled` after a default change picks up the new default for an unedited key and keeps an edited one.
- One regression per plugin that ships large default data (Crafting Helper tables).
