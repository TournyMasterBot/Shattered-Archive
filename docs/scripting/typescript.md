# TypeScript User Scripts

TypeScript user scripts are **transpiled to JavaScript at runtime** (no type checking) and then executed like JavaScript scripts.

---

## Available API (TypeScript)

Same surface as JavaScript:

- `sendCommand(cmd: string)`
- `writeTerminal(dsl: string)` *(optional)*
- `log(...args)` / `error(...args)`
- `event?: { name: string; payload: any }`
- `httpGetJson(url: string, options?) -> Promise<unknown>`
- `runGlobal(globalId: string, args?) -> Promise<unknown>` *(optional)*
- `getGlobalVar(key: string) -> unknown` *(optional)*
- `setGlobalVar(key: string, value: unknown)` *(optional)*
- `deleteGlobalVar(key: string)` *(optional)*
- `getNamedVar(name: string) -> string | undefined` *(optional)*

---

## Example: Alias using Named Variables + Globals

**Globals → TypeScript**
```ts
export {}; // optional; keeps TS module rules happy

// You can use CommonJS-style exports in Globals TS as well:
(exports as any).core = (exports as any).core || {};

(exports as any).core.echo = (api: any, args: any) => {
  api.writeTerminal?.(`{C[TS global]{x ${String(args?.text ?? "")}\n`);
};
```

**Alias script body (TypeScript)**
```ts
const target = getNamedVar?.("TARGET") || "rat";
writeTerminal?.(`{W[gtest]{x TARGET=${target}\n`);

await runGlobal?.("global.typescript.core.echo", { text: `Target is: ${target}` });
```

---

## Example: Typed HTTP usage

```ts
type Repo = { full_name?: string };

const raw = await httpGetJson?.("https://api.github.com/repos/octocat/hello-world");
const repo = raw as Repo;

log("full_name:", repo.full_name);
```

---

## Global script calling conventions (TS)

TypeScript Globals are transpiled and executed as a module with `module`/`exports` available.

To expose a function at:
- `global.typescript.core.bumpCounter`

you must define:
- `exports.core.bumpCounter = (api, args) => { ... }`

You can also assign `module.exports = { ... }`.
