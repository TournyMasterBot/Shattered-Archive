# Scope: Plugin Configure → Save freezes every default into the saved config

Item: item.md · Type: bug · Scoped against: performance/Allocation-hunt @ 0ca5960 · Date: 2026-10-31
Data classification of this work: internal (rules: docs/standards/data-classification.md, DRAFT: owner has not yet confirmed the classes)

## What the work is
Saving a plugin's configuration stores every setting, including untouched defaults, so later changes to a plugin's shipped defaults never
reach users who have saved once. The work is to make Save store only what the user changed, in the web client and, because it has the same
pattern, possibly the mobile client, and to decide what happens to configs that are already frozen. Nothing here adds a requirement beyond
`item.md`; the fix outline in `item.md` is input, not a decision.

## Affected areas
| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| `apps/game-client` config modal | Seeds its draft with defaults and writes the whole draft on Save | change | `components/PluginConfigModal.tsx:62-66`, `:89-97` |
| `apps/game-client` plugin action buttons | Build the same unfiltered draft and push it to the running plugin (runtime only, not stored) | change or confirm unaffected | `components/PluginConfigModal.tsx:296-299` |
| `apps/game-client` install store | `updatePluginConfig` replaces `userConfig` wholesale; installs live in `localStorage` key `shatteredArchive.plugins.installed` | confirm / change | `hooks/usePlugins.ts:29`, `:352-360` |
| `apps/game-client` plugin host | Re-applies `{...defaults, ...userConfig}` on `enable()` and `syncInstalled()`; this is why omitted keys would follow new defaults | confirm | `features/plugins/pluginHost.ts:298`, `:398` |
| `apps/game-client` modal wiring | Two callers pass the saved config straight through | confirm | `components/PluginsPage.tsx:113`, `components/PluginsModal.tsx:197` |
| `apps/game-client` plugins' own config reads | 21 core plugin files read config via `getConfig()` and must cope with keys that are absent from the stored record but present via the host merge | confirm | `features/plugins/core-plugins/*.plugin.ts` |
| `apps/game-client` patch persistence | Already persists only a patch (merged onto the saved record), the model the fix would follow; used by one plugin | confirm | `features/plugins/pluginConfigPersist.ts:25`, `pages/MainContainer.tsx:265-270` |
| `apps/game-client` Crafting Helper | Carries the plugin-only mitigation (legacy default fingerprints) that the fix would make redundant for new saves | confirm / possibly change | `core-plugins/crafting-helper.plugin.ts:257` |
| `apps/game-client` cloud sync | Uploads and downloads the whole install list, so the frozen copies travel with an account | confirm | `features/auth/cloudSync.ts:93-103` |
| `shatteredarchive-mobile` plugin card | Same pattern: draft seeded with `{...defaults, ...saved}`, `savePluginConfig(id, draft)` stores all of it; also gets the reset control and the first-load prune (decisions 1-2) | change | `dsl-client/components/scripts/PluginCard.tsx:25`, `:37`; `features/scripts/script-engine.ts:189` |
| `DSL` C# site, `UserContentController` | Stores the plugin-config array as an opaque blob; validates only `id`, `name`, `version`, `enabled`, `installedAt` and a 200-record cap, never `userConfig` contents | confirm unaffected | `Server/Server.Web.Public/Controllers/UserContentController.cs:93-113`, `:779-788` |
| Documentation | Plugin docs say "click Configure"; none describes what Save stores or how defaults update | change | `docs/scripting/plugins.md:11`, `docs/game/scripting-and-sharing.md`, in-app `ScriptingHelpModal.tsx` |

## Stakeholders
- **Players with saved plugin configs**, whose settings stop receiving default updates today; any behaviour change on load (pruning, reset)
  changes what they see.
- **The owner / plugin maintainers**, who ship new defaults and currently have to register old table fingerprints by hand.
- **Mobile players** (same pattern, separate code and release path).
- **Cloud-sync users**: configs saved to the account by older clients keep their frozen copies, and an older client can write them back.
- **Crafting Helper users**: its tables drive vault `get` / `craft` commands, so a changed default reaching them matters.
- **Documentation readers**: the developer docs under `docs/scripting/` and the end-user guide.

## Data touched
| Data | Class | Read / Write / Store / Send / Log | Change in handling |
|---|---|---|---|
| Per-plugin user settings (`userConfig`): thresholds, toggles, keyword lists, tables | Internal. Free-text fields exist, so a user could type a name into one; a name search of the config keys found only `voiceName` (a TTS voice), so none is known to hold personal data | Read, Write, Store (`localStorage`), Send (cloud sync) | Fewer keys written. No new class, nothing newly logged, no new destination. |
| Cloud copy of the install list (account blob via `/api/user-content/plugin-configs`) | Internal (same content) | Send, Store | Payloads from updated clients carry fewer keys; blobs written earlier keep their full copies. Whether this blob is encrypted at rest was not checked. |
| Install record fields `id`, `name`, `version`, `enabled`, `installedAt` | Internal | Read, Write, Store, Send | None. |

## Inputs for sizing
Not sized: that is for a human. Counted facts:
- Repos touched: 2 (`ShatteredArchive`, `shatteredarchive-mobile`, per decision 1), 0 for the C# site (validated as unaffected by reading the validator).
- Core plugin files: 22 in `core-plugins/*.plugin.ts`; 21 declare `defaults:` (`grep -lE "defaults\s*:"`); 21 call `getConfig()`, 77 call sites in total (`grep -c "getConfig()"` per file).
- Non-test files mentioning `userConfig` in `apps/game-client/src`: 11 (`grep -rc userConfig`).
- Save entry points that persist a draft: 2 (modal `save()` at `:89`, mobile `saveConfig` at `PluginCard.tsx:36`); 1 runtime-only path (modal action buttons).
- Callers of the modal's `onSave`: 2. Callers of `persistPluginConfigPatch`: 1 plugin, 2 call sites.
- Existing tests: `PluginConfigModal.test.tsx` 2 cases, none exercising Save; `usePlugins.test.ts` 4; `pluginHost.test.ts` 15; mobile `plugin-host-test.ts` 19 and no `PluginCard` test file found.
- Documents naming Configure: 2 repo docs plus 1 in-app help component; 0 describe Save semantics.
- Stored-data migration: 1 on each client (prune on first load, decision 2), over 2 stores: web `localStorage` key `shatteredArchive.plugins.installed`, mobile plugin config storage (`features/scripts/plugin-config-storage.ts`), plus the cloud copy those clients sync.
- New user-facing controls: 1 per client (Reset to defaults, decision 2), so 2 across the work.
- Schema changes: 0 (decision 3 keeps `PluginConfigField` as is).
- Server or deploy artifacts touched: 0 identified (client-only change; no ports, env, Dockerfile or nginx involvement found).
- Unknowns listed below: 5.

## Dependencies and order
- The prune on first load and the reset control (decision 2) both depend on the rule that a value equal to the default means "unset" (decision 3); the rule has to be defined once and shared in meaning between the two clients, which keep separate code.
- The modal change and the host merge are independent of the server; no server release is needed.
- The user's recorded preference is to finish a web feature before porting it; the decision to do both clients in one item sets the ordering question for the plan (web phases before mobile phases), not for this scope.

## Risks and unknowns
1. **Plugins that distinguish "unset" from "equals default".** The 77 `getConfig()` call sites were counted, not read. A loose search for `??` / `undefined` on config reads matched 38 lines across core plugins; a strict search for `cfg.x === undefined` matched none. None of the 38 was reviewed.
2. **Old clients overwriting.** An older client that has not been updated can still write full frozen records to the cloud copy; how often that happens was not determined.
3. **Pinning.** A user who deliberately sets a value equal to today's default would follow future default changes after the fix. Whether any plugin needs an opt-out was not determined.
4. **Encryption at rest of the plugin-config cloud blob** was not checked (relevant only to the classification of what it holds).
5. **Mobile release path and whether mobile has the same cloud-merge behaviour on load** were not examined.
A wrong assumption in 1 changes plugin behaviour silently for existing users; in 3 changes which settings stop being pinned.

## Out of scope
Anything not in `item.md` or the decisions above: redesigning plugin configuration, changing plugin defaults themselves, server-side changes, other plugins' own migrations, a per-field pinning opt-out (decision 3), and the Crafting Helper fingerprint mechanism beyond noting whether it becomes redundant.

## Decisions for the human
Answered by the user on 2026-10-31 (AskUserQuestion); the options and their consequences are kept for the record.
1. **Which clients?** Options: web only; web and mobile together; web first with mobile as a follow-up item.
   **Decided: web and mobile together.** One work item spans `ShatteredArchive` and `shatteredarchive-mobile`: two codebases, two test setups, two release paths.
2. **Existing frozen configs?** Options: leave as is; prune on first load; a per-plugin "Reset to defaults" control; both.
   **Decided: both prune and reset.** On first load after the change, stored keys equal to the current default are dropped, and a per-plugin reset control is added. Consequences: stored data is rewritten without the user acting, a deliberate "same as default" choice becomes a follower, and the control needs UI text and documentation on both clients.
3. **Pinning semantics?** Options: a value equal to the default is treated as unset everywhere; a per-field opt-out in the schema.
   **Decided: treated as unset everywhere.** No schema change; an opt-out would be a separate item if a plugin turns out to need pinning.
