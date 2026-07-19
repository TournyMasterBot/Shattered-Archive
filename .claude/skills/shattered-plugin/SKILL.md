---
name: shattered-plugin
description: Scaffold or extend a game-client plugin (apps/game-client/src/features/plugins/core-plugins/*.plugin.ts) following the house pattern for manifest, config schema, lifecycle hooks, event/line matching, line squelching, and registry wiring — covers the gotchas (trailing-newline regex flag, payload-shape drift, no config-change hook, verifying patterns against real logs). Use when asked to create, add, scaffold, or extend a game-client plugin, or to add line-squelch/suppression behavior. Triggers - /shattered-plugin, create a plugin, new plugin, add a core plugin, scaffold a plugin, squelch lines, suppress lines, omit rules, plugin registry, game-client plugin.
---

# shattered-plugin — game-client plugin authoring

Read `ai-template/plugin-authoring.md` (repo root) in full before writing any code.
It is the authoritative, generalized reference for this skill — manifest shape,
config schema rules, the two plugin shapes (reactive vs. suppressive), the
`sync-*` action pattern for live config, the `$`-anchor/multiline-flag gotcha,
and the verify-against-real-logs workflow. This SKILL.md is just the entry point;
don't duplicate its content here — follow it directly.

## Workflow

1. **Read the doc.** `ai-template/plugin-authoring.md` end to end (it's short).
2. **Clarify scope before coding**, if ambiguous:
   - Plugin (shared, versioned, has a config UI) vs. user script (personal,
     one-off) — see doc §0. If the user's ask sounds personal/throwaway, ask.
   - Reactive (respond to an event) vs. suppressive (hide matching lines) vs.
     both — see doc §5.
   - If matching real game text: do NOT hand-write the regex from memory or
     from a reference doc alone. Locate the real log corpus
     (`C:\Projects\DSL\GameLogs\ShatteredArchive\Docker\game-server\...`) per
     doc §7 and confirm the exact wording, including self-target vs.
     other-target grammar variants, before writing the pattern.
3. **Scaffold** using the skeleton in doc §10: new file under
   `apps/game-client/src/features/plugins/core-plugins/`, factory function,
   manifest, configSchema (one toggle per distinct meaningful behavior, each
   with its own explicit default — doc §3), lifecycle hooks.
4. **Wire the registry.** Add the import + `CORE_PLUGINS` entry in
   `apps/game-client/src/features/plugins/registry.ts` — a plugin file alone
   does nothing (doc §1). This is the most common miss; don't skip it.
5. **If suppressing lines:** use `api.registerOmitRules` in `onEnable`
   (doc §5B), remembering `flags: 'm'` on every regex rule (the trailing-`\n`
   gotcha), and add a `sync-*` action (doc §6) so config edits take effect
   without a full disable/re-enable.
6. **If matching regexes:** write a throwaway Node script in the session
   scratchpad, compile the exact pattern+flags, and `.test()` it against real
   captured lines from the log corpus — both the target line AND adjacent
   unrelated lines, to rule out false positives (doc §7). Don't ship a pattern
   you haven't proven against real text.
7. **Verify build.** Run the checklist in doc §9
   (`npx tsc --noEmit`, then `pnpm --filter @shatteredarchive/game-client build`).
   Both must be clean before considering the work done.
8. **Version bump** per doc §8 if config shape or default behavior changed.
9. State plainly what's built vs. deployed: a passing local build is not live —
   deployment is a separate, confirm-first step (doc §9).

## Rules
- Don't invent config UI structure the type doesn't support (no nested/grouped
  fields — flat list only, group visually via label prefixes).
- Don't cache `api.getConfig()` in a closure and reuse it across event
  handlers — always re-read it fresh (doc §4).
- Don't assume a `DispatchEvent` payload's shape — find and read the actual
  call site (doc §5A).
- Don't skip the real-log verification step for any new line-matching
  pattern — this is the single highest-value step in the whole workflow and
  the one most likely to be skipped under time pressure.
