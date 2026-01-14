# Lua User Scripts

Lua scripts run in the browser via a Lua VM and have a bridge API injected as both:
- global functions (`log`, `sendCommand`, ...)
- a global table `api` with the same functions (`api.log`, `api.sendCommand`, ...)

---

## Available API (Lua)

Injected globals (and also under the `api` table):

- `log(message)`
- `error(message)`
- `sendCommand(cmd)`
- `writeTerminal(dsl)` *(optional)*
- `runGlobal(id, argsJson?)` *(optional; fire-and-forget)*
- `getGlobalVar(key) -> string` *(returns JSON/string; empty if missing)*
- `setGlobalVar(key, valueJsonOrString)`
- `deleteGlobalVar(key)`
- `getNamedVar(name) -> string` *(empty if missing)*

Also available:
- `httpGetJson(url)` *(fire-and-forget; logs result asynchronously if available)*

**Important:** In Lua, `httpGetJson()` does **not** return a Lua table. It logs results via `log(...)` when the fetch completes.

---

## Example: Alias-like script using Named + Global variables

```lua
local t = getNamedVar("TARGET")
if t == "" then t = "rat" end

writeTerminal("{W[gtest]{x TARGET=" .. t .. "\n")

setGlobalVar("LAST_TARGET", t)

-- Call into JS globals
runGlobal("global.javascript.core.echo", "{\"text\":\"Hello from Lua\"}")
```

---

## Lua Global scripts

Lua globals are defined in **Globals → Lua** as top-level functions.

Calling:
- `runGlobal("global.lua.core.echo", { ... })`

will invoke Lua function:
- `core_echo(argsJson)`

Where `argsJson` is a JSON string (or empty string).

### Example: Globals → Lua

```lua
function core_echo(argsJson)
  writeTerminal("{G[Lua global]{x core_echo args=" .. (argsJson or "") .. "\n")
end

function core_attackTarget(argsJson)
  local t = getNamedVar("TARGET")
  if t == "" then t = "rat" end
  sendCommand("kill " .. t)
end
```

---

## Tips

- For structured args, prefer JSON:
  - from JS/TS: `runGlobal("global.lua.core.echo", { text: "hi" })`
  - inside Lua, you can treat it as a string (or add your own JSON decode helper if needed).
