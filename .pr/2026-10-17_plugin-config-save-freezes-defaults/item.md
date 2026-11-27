---
type: bug
title: Plugin Configure → Save freezes every default into the saved config
slug: 2026-10-17_plugin-config-save-freezes-defaults
created: 2026-10-17
state: completed
data-classification: internal
---

# Plugin Configure → Save freezes every default into the saved config

Moved here on 2026-10-31 from `.ai-bug/20261017-1500-plugin-config-save-freezes-defaults.md` (history kept). Original report 2026-10-17,
found by the PR #160 deep review (finding CFG-3); the review's scratch notes are in the local, git-ignored
`.ai-code-review/20261017-1350-pr160-crafting-helper/`.

**Status check 2026-10-31: still open.** Re-read against the current code (not reproduced by running it): the modal still seeds the draft
with the defaults and `save()` still persists every key; both callers pass the config straight through; the host merge is unchanged.
Commit `0ca5960` (allocation hunt) touched `pluginHost.ts` for `getConfig()` memoization only. The plugin-only mitigation below is still
present.

## What happens / what should happen
**Happens:** after a user opens **Configure** on a plugin and clicks **Save** once (even changing nothing), every default value for that
plugin is stored in their `userConfig`. Defaults the plugin later ships (corrected recipe rows, new keyword lists, changed timeouts) never
reach that user, because `{...defaults, ...userConfig}` lets the stale stored copy win.
**Should happen:** Save stores only what the user changed, so unedited settings keep following the plugin's shipped defaults.

## Steps to reproduce
1. Enable a plugin with defaults (e.g. Crafting Helper), open Configure, click Save.
2. Inspect the install record: `userConfig` now contains every field, including the full default tables.
3. Ship a new default for one of those fields; reload. The user still gets the old value.

## Where (line numbers as of 2026-10-31)
- `apps/game-client/src/components/PluginConfigModal.tsx:62-66`: `initialCfg = { ...defaults, ...initialUserConfig }` seeds the draft.
  `:89-97` `save()` persists **every** key of the draft (`Object.entries(draft).filter(v !== undefined)`) and calls `onSave`.
  `:296-299` the plugin action buttons build the same unfiltered draft for `pluginHost.updateEnabledPluginConfig` (runtime config, not stored).
- `apps/game-client/src/features/plugins/pluginHost.ts:298` (`enable()`) and `:398` (`syncInstalled()`) merge `{ ...defaults, ...userConfig }`,
  so stored values always override.
- `apps/game-client/src/hooks/usePlugins.ts:352-360`: `updatePluginConfig` replaces `userConfig` wholesale.
- Callers of the modal's `onSave`: `PluginsPage.tsx:113`, `PluginsModal.tsx:197`; neither filters.

## Evidence
- PR #160 deep review finding CFG-3 (see above).
- Crafting Helper's own regression test ("pre-multi-component saved config") records this having already broken once.

## Impact
Reporter's assessment: Medium (design-level, affects every plugin; High for plugins that ship large default data). Worst case today:
Crafting Helper's `tierTable` (~100 rows) and `craftTypes` drive irreversible vault `get` / `craft` commands.

## Mitigation already in place (plugin-only)
`crafting-helper.plugin.ts` (`LEGACY_DEFAULT_TABLE_FINGERPRINTS`, ~line 257): a saved table whose normalized text equals the current default
(or a fingerprint listed there) is replaced by the current default. This only helps if the maintainer remembers to register the old
table's fingerprint when changing a default. Its code comment points back to this item.

## Notes carried over from the original report (unverified; input for /scope-work and /tech-plan, not a plan)
**Proposed fix (larger scale, needs its own PR and review):** make Save persist only keys that differ from the plugin's defaults.
1. In `PluginConfigModal.save()`, drop keys whose value deep-equals `defaults[key]` before calling `onSave`.
2. Leave the host merge as is: it already re-applies defaults on read, so omitted keys follow future default changes.
3. Migration: existing installs keep their frozen copies. Offer a per-plugin "Reset to defaults" in the modal, and/or on first load after
   the change prune keys equal to the *current* default.
4. Decide the semantics of "pinning": a user who deliberately sets a value equal to today's default will start following future default
   changes. Acceptable for most plugins; if some need pinning, add an opt-out flag in the field schema.

**Side effects to review before shipping**
- Every core plugin (config shape stored changes); cloud-synced installs written by older clients.
- Number/boolean fields where "equal to default" and "explicitly set" mean different things to a plugin (grep `userConfig` consumers and
  `getConfig()` callers for `=== undefined` checks).
- `usePlugins.updatePluginConfig` replaces `userConfig` wholesale; confirm omitted keys are not read back as `undefined` anywhere.

**Tests to add**
- Modal: Save with no edits persists `{}`; Save after editing one field persists only that field; editing back to the default persists nothing.
- Host: `syncInstalled` after a default change picks up the new default for an unedited key and keeps an edited one.
- One regression per plugin that ships large default data (Crafting Helper tables).
