# Plugin configuration storage (Developer Notes)

For whoever next touches `hooks/usePlugins.ts`, `features/plugins/pluginHost.ts`, `features/plugins/pluginConfigOverrides.ts` or
`components/PluginConfigModal.tsx`. Players configure plugins from **Plugins → Manage Plugins… → Configure**
(`docs/scripting/plugins.md`); this document is about how those settings are stored and read back.

---

## What is stored

One `InstalledPluginRecord` per plugin, all in a single global `localStorage` key, `shatteredArchive.plugins.installed`
(not per connection). Its `userConfig` holds **only the values that differ from the plugin's defaults**
(`configSchema.defaults`), the user's *overrides*. A setting the user never changed is simply absent.

That is deliberate. Saving used to store a copy of every setting, which froze the defaults for that user: when a plugin later shipped a
corrected default (new recipe rows, new keyword list, a changed timeout), `{ ...defaults, ...userConfig }` let the stale stored copy win
and the change never arrived. Crafting Helper's ~100-row `tierTable` is the case that made it matter, since it drives irreversible vault
`get` / `craft` commands.

## How defaults come back

The host re-applies the defaults on every read: `pluginHost.enable()` and `syncInstalled()` build the runtime config as
`{ ...defaults, ...userConfig }` (`pluginHost.ts`), so an absent key reads as the plugin's **current** default. Plugins never see the
stored overrides directly, only `api.getConfig()`, a shared snapshot that must be treated as read-only (the host rebuilds it only when the config changes).

## The one write funnel

Everything that writes the installed list ends up in `persistRecords` in `hooks/usePlugins.ts`, and it prunes on the way in:

- the hook's own save (the config modal's **Save**, enabling/disabling, installing);
- `writeInstalledPlugins` (a cloud load in `useAccountModal`, a script-file import in `UserScriptSandboxModal`);
- a plugin persisting a change it made itself (`pluginConfigPersist` → `MainContainer` → `updatePluginConfig`).

So a record written by an older client in the old shape (a full copy of the defaults) is stored pruned too. `updatePluginConfig` prunes
at the source as well, so hook state equals what storage holds and the `PLUGINS_UPDATED_EVENT` re-read finds no difference.
A record for a plugin with no registered defaults (an unknown id) is stored exactly as given.

The rules live in `features/plugins/pluginConfigOverrides.ts` (`toOverrides`, `pruneRecordOverrides`, `corePluginDefaults`).

## What counts as "same as default"

`isSameAsDefault` is strict and structural **on purpose**: no type coercion (`"5"` is *not* `5`, so it stays stored), objects compare by
key set regardless of key order, arrays by position. `undefined` is never stored; `null` is stored unless the default is `null` too.
A key with no default entry is always kept. Consequence worth knowing: a user who sets a value *equal to today's default* has not
pinned it. It follows the plugin's future defaults.

## First-load prune

Configs saved before this existed are pruned once. `migratePluginConfigOverrides()` runs at module load (next to the other storage
migrations in `usePlugins.ts`), keyed by `shatteredArchive.plugins.configOverrides.v1`. It is idempotent and fail-safe: the marker is set
only after the pruned list has been written; if storage cannot be read or written, the stored data is left as it is, one fixed-message
`console.warn` (never a setting's value) is logged, and the next start tries again.

## The config modal

`PluginConfigModal` seeds its draft with `{ ...defaults, ...initialUserConfig }` so every field shows its effective value, and **Save**
hands the parent `toOverrides(draft, defaults)`: only what differs from the defaults. That is the `onSave` contract, *the overrides*.
**Reset to defaults** sets the draft back to the defaults; nothing is stored until Save (which then stores `{}`), and Cancel discards it.
The action buttons (`schema.actions`) still push the whole unsaved draft to the running plugin with `updateEnabledPluginConfig`, a
runtime-only patch that never reaches storage.

## Live state: replace, not patch

After a Save, `PluginsPage` and `PluginsModal` call `pluginHost.replaceEnabledPluginConfig(id, config)`, which sets the running
plugin's config to `{ ...defaults, ...overrides }`: exactly what a reload would give it. `updateEnabledPluginConfig` only *merges* a
patch, so it cannot take a key away: a setting set back to its default, or an optional field with no default that the user cleared, would
linger in the running plugin until something else re-synced (`MainContainer` re-syncs on every installed-list change as a backstop).
Use replace for "this is the saved config", update for "this one change".

## Gotchas

- The cloud copy of an account can still hold the old shape (an older client wrote it); it is pruned when loaded, not on the server. The C#
  endpoint stores the array as an opaque blob and validates only `id`, `name`, `version`, `enabled` and `installedAt`.
- Crafting Helper keeps `LEGACY_DEFAULT_TABLE_FINGERPRINTS` (`crafting-helper.plugin.ts`) for tables saved before this: a saved table equal
  to a *previous* default is replaced by the current one. Overrides-only storage makes registering new fingerprints unnecessary for new saves.
- Two browser tabs share the key; a stale tab that writes the old shape is pruned again by the next write through the funnel.

## Relevant files

| Concern | File |
|---|---|
| Storage, funnel, migration, hook | `apps/game-client/src/hooks/usePlugins.ts` |
| Override rules | `apps/game-client/src/features/plugins/pluginConfigOverrides.ts` |
| Config modal (Save, Reset to defaults) | `apps/game-client/src/components/PluginConfigModal.tsx`, wired in `PluginsPage.tsx` and `PluginsModal.tsx` |
| Live config of a running plugin | `apps/game-client/src/features/plugins/pluginHost.ts` (`replaceEnabledPluginConfig`, `updateEnabledPluginConfig`) |
| Defaults re-applied on read | `apps/game-client/src/features/plugins/pluginHost.ts` (`enable`, `syncInstalled`) |
| Cloud sync of the list | `apps/game-client/src/features/auth/cloudSync.ts` (`loadPluginConfigs`, `savePluginConfigs`) |

## Testing note

`pluginConfigOverrides.test.ts` pins the equality rules and runs every core plugin's own defaults through `toOverrides`.
`components/PluginConfigModal.test.tsx` pins what Save hands over and how Reset to defaults behaves; `pluginHost.test.ts` pins
`replaceEnabledPluginConfig`. `hooks/usePlugins.test.ts` covers each write route, the first-load prune (including its failure paths) and the original bug end to end:
a default the plugin changed later reaches a user who only ever pressed Save, while an edited setting keeps the user's value.
