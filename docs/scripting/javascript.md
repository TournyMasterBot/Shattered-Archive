# JavaScript User Scripts

JavaScript user scripts run in a sandbox and are given a small API surface. They can be used as **Aliases**, **Triggers**, or **Timers**.

---

## Available API (JavaScript)

These names are available directly in your script:

- `sendCommand(cmd: string)`
- `writeTerminal(dsl: string)` *(optional)*
- `log(...args)` / `error(...args)`
- `event` *(object with `name` and `payload`)*
- `httpGetJson(url: string, options?) -> Promise<any>`
- `runGlobal(globalId: string, args?) -> Promise<any>` *(optional)*
- `getGlobalVar(key: string) -> any` *(optional)*
- `setGlobalVar(key: string, value: any)` *(optional)*
- `deleteGlobalVar(key: string)` *(optional)*
- `getNamedVar(name: string) -> string | undefined` *(optional)*

---

## Terminal output formatting

`writeTerminal()` accepts **DSL color codes** (not ANSI). Examples:
- Colors: `{r {g {y {b {m {c {w` and bright variants `{R {G {Y ...`
- Reset: `{x`
- Literal `{`: `{{`

Example:
```js
writeTerminal?.("{GHello{x world\n");
```

---

## Example: Alias that calls a JS Global function

**Globals → JavaScript**
```js
exports.core = exports.core || {};

exports.core.echo = (api, args) => {
  api.writeTerminal?.(`{G[JS global]{x ${String(args?.text ?? "")}\n`);
};
```

**Alias script body (JavaScript)**
```js
const t = getNamedVar?.("TARGET") || "rat";
writeTerminal?.(`{W[gtest]{x TARGET=${t}\n`);

await runGlobal?.("global.javascript.core.echo", { text: `Target is: ${t}` });
```

---

## Example: Use Global Variables (persistent KV)

```js
const key = "COUNTER";
const cur = Number(getGlobalVar?.(key) ?? 0) || 0;
const next = cur + 1;

setGlobalVar?.(key, next);
writeTerminal?.(`{G[counter]{x ${next}\n`);
```

---

## Example: HTTP request (awaitable in JS)

```js
try {
  const data = await httpGetJson?.("https://api.github.com/repos/octocat/hello-world");
  log("repo:", data);
} catch (e) {
  error("httpGetJson failed:", e);
}
```

---

## Calling the Globals by name

The exports of **Globals → JavaScript** and **Globals → TypeScript** are available in every JS / TS script as plain
names, so `core.echo({ text })` just works, with no `runGlobal` and no `api` argument. The calling convention below is
applied for you, and what the function returns is returned to you untouched: a value for an ordinary function, a
promise for an `async` one.

```js
sendCommand("kill " + pick({ list: ["rat", "orc"] }));   // exports.pick = (args) => ...
const later = await core.later({ n: 5 });                // exports.core.later returns a promise
state.kills++;                                           // exports.state = { kills: 0 } is the Globals file's own object
```

- A method keeps `this` (it is the object it hangs off), so it can use the Globals file's own state.
- Objects and arrays are shared, not copied; a number or string export is its value at the moment the script started.
- A script can still declare its own `const core = ...`.
- The Globals file of the script's own language wins a name that both files export; names the script already has
  (`log`, `sendCommand`, `event`, ...), keywords and non-identifiers (`my-fn`) are not bound.
- Scripts run in an `async` function, so top-level `await` works; a script that never awaits runs to the end in the
  same turn it was triggered in, as it always did.
- To call a Lua or Python global, use `await runGlobal("global.lua.core.add", { a: 1, b: 2 })`: it resolves with the
  value the function returned.

---

## Global script calling conventions (JS)

When `runGlobal("global.javascript.some.path", args)` is called, the JS global runtime:

- loads the Globals tab JavaScript source as a CommonJS-style module
- reads the exported function at `exports.some.path`
- invokes it as either:
  - `fn(api, args)` if the function declares 2+ parameters, or
  - `fn(args)` otherwise

Recommended signature:
```js
exports.core = exports.core || {};
exports.core.myFunc = (api, args) => { /* ... */ };
```
