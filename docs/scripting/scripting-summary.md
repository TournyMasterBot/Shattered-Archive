
# Scripting Summary (User Scripts, Globals, and Variables)

This client includes a scripting system designed for **end users**. You can create:

- **User Scripts**: Triggers, Aliases, and Timers (per character/connection).
- **Global Scripts**: One shared “library” file per scripting language.
- **Variables**:
  - **Named Variables** (Variables tab): string values, like `TARGET=orc guard`
  - **Global Variables** (Globals tab): persisted key/value storage, strings or JSON-like values

A typical workflow is:
1. Put reusable helper functions in **Globals**.
2. Call them from Triggers/Aliases/Timers via `runGlobal(...)`.
3. Read player-configurable strings from **Named Variables** via `getNamedVar(...)`.
4. Store persistent state in **Global Variables** via `getGlobalVar/setGlobalVar`.

---

## 1) User scripts

### Trigger
Runs when incoming text matches your trigger. Triggers can also receive an event payload.

### Alias
Runs when you type a matching command (e.g., typing `gtest` runs your alias script).

### Timer
Runs on a schedule (e.g., every 5 seconds).

---

## 2) The Script API (available in all languages)

All user scripts can access the same set of functions/values.

### Core actions
- `sendCommand(cmd: string)`  
  Sends a command to the MUD.

- `log(...args)`  
  Writes to the script log (developer console / script output).

- `error(...args)`  
  Writes an error entry (also appears in the in-app error panel).

- `event`  
  Context about why the script ran (trigger/alias/timer).  
  Useful fields:
  - `event.name`
  - `event.payload`

### Terminal output (DSL colored)
- `writeTerminal(dsl: string)` *(if available)*  
  Writes text directly to the terminal. Supports DSL color codes like `{G`, `{W`, `{x`.  
  End colored output with `{x` to reset formatting.

Example:
```js
writeTerminal?.(`{GHello world{x\n`);
```

### HTTP helper
- `httpGetJson(url, options?) -> Promise<any>` *(if available)*  
  Performs a browser fetch and returns parsed JSON when possible; otherwise returns text.  
  Throws on HTTP or network errors.

---

## 3) Variables

### Named Variables (Variables tab)
Named variables are **strings** that users set in the Variables tab (e.g. `TARGET=rat`).

- Read: `getNamedVar("TARGET") -> string | undefined`

Example (any language conceptually):
- If `TARGET` is set, use it; otherwise fall back to `"rat"`.

### Global Variables (Globals tab)
Global variables are a persisted key/value store. Use them for:
- remembering the last target
- counters
- small configuration blobs (JSON-like)

- Read: `getGlobalVar("KEY") -> any`
- Write: `setGlobalVar("KEY", value) -> void`
- Delete: `deleteGlobalVar("KEY") -> void`

---

## 4) Global scripts (shared libraries)

Global scripts are stored per language in the Globals tab. You call into them from any user script using:

```js
runGlobal?.("global.javascript.core.echo", { text: "Hello" });
```

### Global identifiers
The format is:
```
global.<language>.<path>
```

Examples:
- `global.javascript.core.echo`
- `global.typescript.core.echo`
- `global.lua.core.echo`
- `global.python.core.echo`

### Lua/Python name mapping
For Lua and Python globals, dotted paths map to underscores at runtime:

- `global.lua.foo.bar` calls Lua function `foo_bar(...)`
- `global.python.foo.bar` calls Python function `foo_bar(...)`

---

## 5) Proof-of-concept: one alias calling JS globals

### Step A — Set a Named Variable
In **Variables**, set:
- `TARGET = orc guard`

### Step B — Create JS globals (Globals tab → JavaScript)
```js
exports.core = exports.core || {};

exports.core.echo = (api, args) => {
  const text = String(args?.text ?? "");
  api.writeTerminal?.(`{G[JS global]{x echo: ${text}\n`);
};

exports.core.bumpCounter = (api, _args) => {
  const key = "JS_COUNTER";
  const cur = Number(api.getGlobalVar?.(key) ?? 0) || 0;
  const next = cur + 1;

  api.setGlobalVar?.(key, next);
  api.writeTerminal?.(`{G[JS global]{x counter=${next}\n`);
};

exports.core.attackTarget = (api, _args) => {
  const target = api.getNamedVar?.("TARGET") || "rat";
  api.sendCommand(`kill ${target}`);
};
```

### Step C — Create an alias (Aliases → JavaScript)
```js
const namedTarget = getNamedVar?.("TARGET") || "NOT SET";
const lastTarget = getGlobalVar?.("LAST_TARGET");

writeTerminal?.(`{W[gtest]{x named TARGET=${namedTarget} last=${String(lastTarget ?? "")}\n`);

setGlobalVar?.("LAST_TARGET", namedTarget);

runGlobal?.("global.javascript.core.echo", { text: `Hello; TARGET=${namedTarget}` });
runGlobal?.("global.javascript.core.bumpCounter");
runGlobal?.("global.javascript.core.attackTarget");
```

Expected results:
- Terminal prints your named variable and last stored value
- `LAST_TARGET` updates
- `JS_COUNTER` increments
- The client sends `kill <TARGET>` to the MUD

---

## 6) Troubleshooting

### “function not found”
- Confirm your global identifier matches your global function path.
- For JavaScript/TypeScript globals, ensure you exported the function under `exports`.

Example:
- Calling `global.javascript.core.echo` requires:
  - `exports.core.echo = ...`

### “runGlobal is undefined”
- Your script environment may not have the optional helper wired in that context.  
  Use optional chaining (`runGlobal?.(...)`) to avoid hard errors.

### Variables are empty
- Named Variables are strings and are case-sensitive by name.  
  Make sure you set exactly `TARGET` (not `target`).

---

## See also
- `plugins.md` — built-in plugins (Roller, Auto Standup, Auto Respell, Brew Helper)
- `javascript.md`
- `typescript.md`
- `lua.md`
- `python.md`
