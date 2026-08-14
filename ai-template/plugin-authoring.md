# Game-Client Plugin Authoring Reference

Generalized reference for building a `game-client` plugin correctly on the first
pass. Written from the concrete work of building the **Weapon Flag Squelch**
plugin (`apps/game-client/src/features/plugins/core-plugins/weapon-flag-squelch.plugin.ts`),
generalized so it applies to any new plugin, not just that one. Every rule below
exists because skipping it caused a real bug or a real round of rework in that
session — follow the checklist in order rather than improvising the shape.

Source of truth for exact types: `types/types-client/src/plugins/plugin-base.ts`
(`IPluginModule`, `PluginRuntimeApi`, `PluginConfigSchema`, `PluginConfigField`,
`PluginConfigAction`, `PluginEvent`). This doc explains *how the pieces are used*;
that file is authoritative for *exact signatures* — read it before writing code,
don't rely on this doc's paraphrase if they ever disagree.

---

## 0. Plugin vs. user script — pick the right mechanism first

- **User script** (trigger/alias/timer in the in-client script editor): personal,
  ad-hoc, stored per-connection in localStorage. Use when the behavior is
  one person's preference and won't be shared.
- **Plugin** (`core-plugins/*.plugin.ts`, registered in `registry.ts`): shared,
  versioned, has a real config UI (fields/actions), ships in the built client for
  everyone. Use when the behavior is general-purpose enough to hand to other
  players, or needs a config panel instead of hand-edited source.

If you're not sure which the user wants, ask — the two have very different
blast radius (a plugin bug ships to everyone who enables it; a user script bug
affects one person).

---

## 1. File anatomy

1. New file: `apps/game-client/src/features/plugins/core-plugins/<kebab-name>.plugin.ts`
2. It exports one factory function: `export function create<PascalName>Plugin(): IPluginModule { ... }`
3. Register it in `apps/game-client/src/features/plugins/registry.ts`:
   - import the factory
   - add an entry to the `CORE_PLUGINS` array: `{ id, manifest: create<X>Plugin().manifest, create: create<X>Plugin }`
   - **the plugin file alone does nothing** — forgetting the registry entry is
     the single most common "why doesn't my plugin show up" mistake.

---

## 2. Manifest

```ts
manifest: {
  id: 'kebab-case-id',       // stable; matches the registry.ts id
  name: 'Human Readable Name',
  version: '0.1.0',          // semver — see §8 for when to bump
  description: 'One or two sentences: what it does, what's on by default.',
},
```

`id` is permanent once shipped — it's the storage key for saved per-user config.
Don't rename it later; add a new plugin instead if the behavior fundamentally changes.

---

## 3. Config schema — the only UI a plugin gets

`configSchema` is rendered by a generic base UI. There is **no nesting or
grouping** — `fields` is a flat list, rendered in array order. If you want
visual grouping, do it with a shared label prefix (e.g. `"Frost (C) — freezes line"`,
`"Frost (C) — cold touch line"`) and keep related fields adjacent in the array —
don't invent a fake grouping construct that doesn't exist in the type.

```ts
configSchema: {
  defaults: { /* every field key MUST have a default here */ },
  fields: [ /* PluginConfigField[] — string | number | boolean | textarea | select */ ],
  actions: [ /* optional named buttons — see §6 */ ],
},
```

- `defaults` + saved `userConfig` are merged at enable time
  (`{ ...defaults, ...userConfig }`) — a field with no default can come back
  `undefined` for existing users after you add it later. Always give one.
- Prefer **one toggle per distinct, independently-meaningful thing** over one
  broad toggle covering several behaviors. A single "flag" or "category" can
  have more than one independently-observable variant (e.g. self-target vs.
  other-target grammar) that a user may reasonably want to control separately.
  When in doubt, split — collapsing later is easy, un-collapsing a shipped
  config key is not (renames break existing users' saved config).
- Give **every individual toggle its own explicit default value**, not one
  shared module-level default applied to all. Some subsets legitimately want
  the opposite default from the rest (e.g. one line-category left visible
  while everything else defaults to hidden) — put the default on the item
  itself as a named field, not as an ad-hoc exception buried in the logic.

---

## 4. Lifecycle hooks

- `onEnable(api)` — called once when the user turns the plugin on. Do setup
  here (register omit rules, register actions). May return a cleanup function,
  called on disable.
- `onDisable(api)` — optional additional teardown.
- `onEvent(api, evt)` — if present, the host wires it to **every** event in
  `ROUTED_WINDOW_EVENTS` (`features/plugins/routed-gmcp-events.ts`). You must
  filter by `evt.name` yourself; you don't get to subscribe to just one event
  via this hook.
- `onAlias(api, input)` — intercept an unmatched slash command; return `true`
  to consume it (prevents it reaching the game).

Inside any handler, call `api.getConfig()` **fresh each time** — don't cache
config from `onEnable` into a closure variable and reuse it. Handlers run long
after enable; the user can edit config live in between.

---

## 5. Two plugin shapes (pick one, or combine)

### A. Reactive — respond to an event, then act
`onEvent` checks `evt.name === '...'`, extracts payload fields, then calls
`api.sendCommand(...)` and/or `api.writeTerminal(...)`.

**Payload discipline (this is where real bugs happened):**
- Never assume a payload's shape from memory or from what a doc says it
  *should* be. Find the actual `DispatchEvent('event:x', {...})` call site and
  read the literal object it constructs. Payload shapes drift.
- Write tolerant extractors — a payload may be a bare string in one code path
  and an object in another: `typeof payload === 'string' ? payload : payload?.field`.
- Strip decoration before comparing against reference strings: ANSI codes
  (`\x1b\[[0-9;]*m` — note the ESC byte itself must be in the pattern, not
  just the bracket sequence that follows it) and status-token prefixes like
  `"(Glowing) (Humming) "`.

### B. Suppressive — hide matching lines from the terminal
Use `api.registerOmitRules(rules)` inside `onEnable`. A rule is either:
```ts
{ matchText: string; eventName?: string; caseInsensitive?: boolean }   // substring
{ pattern: string; flags?: string; eventName?: string }                // regex
```
`eventName` defaults to `shatteredarchive:raw-data`.

- Rules are **declarative and keyed by your plugin's id** — calling
  `registerOmitRules` again fully **replaces** your previous rule set (it does
  not merge). Call with `[]` to clear.
- Suppression only stops the **secondary** UI-facing dispatch
  (`shatteredarchive:write-terminal` / chat-line capture). It does **not**
  stop the primary raw-data event itself from reaching your own `onEvent`
  handler — you can squelch a line and still react to it in the same plugin.
- Always register `[]` in the cleanup returned from `onEnable` (the host also
  clears on disable, but doing it explicitly is the established convention —
  see `colorkit.plugin.ts`, `highlighter.plugin.ts`).

**The `$`-anchor gotcha (caused a real shipped bug):** raw-data lines arrive
as `"<line text>\n"` — the payload **includes its trailing newline**. A regex
ending in `$` will silently never match unless you pass the `m` (multiline)
flag, because without it `$` requires true end-of-string, and the trailing
`\n` means you're never actually at the end. **Always pass `flags: 'm'`** on
every regex omit rule. `^` behaves identically with or without `m` for
single-line input, so there's no downside to always including it.

---

## 6. Reacting to live config edits — the `sync-*` action pattern

There is **no config-change lifecycle hook.** `updateConfig`/`setConfig` from
the config UI silently patch the stored config; a plugin that only computed
something once in `onEnable` (like a `registerOmitRules` call) will not
automatically recompute when the user edits a field afterward.

The established fix (used by `colorkit.plugin.ts`, `highlighter.plugin.ts`,
`weapon-flag-squelch.plugin.ts`): define the recompute logic as a named
function inside `onEnable`, call it once immediately, and also register it as
an action the config UI can invoke on demand:

```ts
onEnable(api: PluginRuntimeApi) {
  const syncOmitRules = () => {
    const cfg = api.getConfig();
    // derive rules from cfg, call api.registerOmitRules(...)
  };

  syncOmitRules();
  api.registerAction('sync-rules', syncOmitRules);

  return () => api.registerOmitRules([]);
},
```
Pair this with an `actions: [{ key: 'sync-rules', label: '...', description: '...' }]`
entry in `configSchema`. Handlers that instead read `api.getConfig()` fresh on
every event (the reactive shape, §5A) don't need this — they're live by
construction. Only declarative, register-once state (omit rules) needs it.

---

## 7. Verifying a matching pattern against reality — don't ship on vibes

Reference docs and remembered phrasing drift from what the game actually
sends. Before shipping any line-matching pattern:

1. Find the real corpus: `C:\Projects\DSL\GameLogs\ShatteredArchive\Docker\game-server\<year>\<month>\<day>\server.log-*.jsonl`
   (one JSON object per line; the text is at `payload.data`).
2. Grep for the phrase you're targeting; extract `payload.data`, strip ANSI
   (see §5A), dedupe, and read the **actual** text — don't assume the
   reference doc's wording is complete or current.
3. Write a small throwaway Node script (in the session scratchpad, not the
   repo) that compiles your exact pattern + flags and `.test()`s it against
   the real captured lines. This proved, in this session, that a documented
   pattern (`"X is shocked by a"`, third-person) never matched what the log
   actually contained (`"You are shocked by ..."`, second-person) — a gap
   invisible from just reading the regex.
4. Also test the pattern against **adjacent, unrelated real lines** from the
   same corpus, not just the line it's meant to match — this is how a
   near-miss was caught where mob natural-attack damage lines
   (`"Khexisth's freezing bite mauls you."`) looked superficially similar to
   a proc-echo line but are actually core combat feedback that must never be
   suppressed. Confirm zero false-positive matches before shipping.
5. When the doc and reality disagree, trust reality. Add a new toggle for a
   newly-discovered variant rather than silently editing the existing one —
   keep both, and note in a comment which is confirmed (with a date) and
   which is still unconfirmed.

---

## 8. Version bump discipline

Bump `manifest.version` (semver) when:
- the config schema shape changes (fields added, removed, or renamed — a
  renamed/removed key means existing users' saved config silently falls back
  to the new default for that key, which is usually fine but should be a
  deliberate, visible change via the version bump)
- default behavior changes (a toggle's default flips)
- a real correctness bug is fixed

Comment-only or internal-refactor changes don't need a bump.

---

## 9. Build/verify checklist (run after every edit)

```bash
cd apps/game-client
npx tsc --noEmit -p tsconfig.json   # filter to your file + "error TS"; must be clean
pnpm --filter @shatteredarchive/game-client build   # must succeed
```

- A successful build prints a fresh `dist/assets/main-<hash>.js` — the hash
  changing confirms a real rebuild, not a stale cache hit.
- **A local build only proves it compiles.** Nothing is live until:
  1. committed (plugin files are not auto-committed), and
  2. the game-client image is rebuilt/redeployed:
     `docker compose -f deploy/docker-compose.yml up -d --build game-client`
     (production-facing — confirm with the user before running this).

---

## 10. Minimal skeleton

```ts
// apps/game-client/src/features/plugins/core-plugins/<kebab-name>.plugin.ts
import type { IPluginModule, PluginEvent, PluginRuntimeApi } from '@shatteredarchive/types-client';

export function create<PascalName>Plugin(): IPluginModule {
  return {
    manifest: {
      id: '<kebab-name>',
      name: '<Human Readable Name>',
      version: '0.1.0',
      description: '<what it does, what is on by default>',
    },

    configSchema: {
      defaults: { /* ... */ debug: false },
      fields: [ /* ... */ { key: 'debug', type: 'boolean', label: 'Debug logging', description: '...' } ],
      // actions: [{ key: 'sync-rules', label: '...', description: '...' }], // only if using registerOmitRules
    },

    onEnable(api: PluginRuntimeApi) {
      // declarative suppression (§5B) and/or reactive setup here
      return () => {
        // cleanup, e.g. api.registerOmitRules([]);
      };
    },

    onEvent(api: PluginRuntimeApi, evt: PluginEvent): void {
      if (evt.name !== 'event:whatever') return;
      // extract payload defensively (§5A), act via api.sendCommand / api.writeTerminal
    },
  };
}
```

Then in `apps/game-client/src/features/plugins/registry.ts`:
```ts
import { create<PascalName>Plugin } from './core-plugins/<kebab-name>.plugin';
// ...
{
  id: '<kebab-name>',
  manifest: create<PascalName>Plugin().manifest,
  create: create<PascalName>Plugin,
},
```

---

## Case study: Weapon Flag Squelch (what was built, and why each part exists)

- **Shape:** suppressive (§5B) — no `onEvent` at all; purely declarative
  `registerOmitRules`, since the goal was hiding known proc-echo lines, not
  reacting to them.
- **Config:** one boolean field **per distinct proc line** (17 total), not one
  per flag letter (9) — discovered mid-build that some flags echo more than
  one independently-meaningful line (self-target vs. other-target grammar),
  and collapsing them into one toggle would have removed the user's ability
  to keep one variant visible while hiding the other.
- **Per-item defaults:** every line defaults to squelched except the three
  Poison lines, which default to visible — expressed as a `defaultSquelch`
  field on each pattern object, not a special-cased branch.
- **The `m`-flag bug (§5B):** every pattern here ends in `$`; none would have
  matched anything without the multiline flag, because every real raw-data
  payload carries its trailing `\n`. Caught by writing a throwaway Node
  regex-test script against real captured lines before shipping.
- **The reference-doc gap (§7):** a user report of a squelch "not working"
  turned out to be a real corpus mismatch — the documented pattern used
  third-person grammar; the actual game line used second-person. Fixed by
  adding a new toggle for the newly-observed variant, confirmed against the
  real log, rather than editing the old one on guesswork.
- **The near-miss (§7 step 4):** cross-checked all patterns against an entire
  unrelated combat log (a different mob's attacks) specifically to rule out
  suppressing real damage-feedback lines that merely *looked* similar.
- **Files touched:** the plugin file itself
  (`core-plugins/weapon-flag-squelch.plugin.ts`) and one line added to
  `registry.ts`. No other file needed to change — config UI, storage, and
  suppression wiring are all generic host behavior.
