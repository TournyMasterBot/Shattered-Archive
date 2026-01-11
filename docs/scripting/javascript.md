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
