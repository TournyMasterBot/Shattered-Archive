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
- `runGlobal(id, args?, callback?) -> value` *(optional; see **Calling globals** below)*
- `getGlobalVar(key) -> string` *(returns JSON/string; empty if missing)*
- `setGlobalVar(key, valueJsonOrString)`
- `deleteGlobalVar(key)`
- `getNamedVar(name) -> string` *(empty if missing)*
- `event` *(trigger/alias/timer context table: `event.name`, `event.payload`; `nil` if not applicable)*

Also available:
- `httpGetJson(url)` *(fire-and-forget; logs result asynchronously if available)*

**Important:** In Lua, `httpGetJson()` does **not** return a Lua table. It logs results via `log(...)` when the fetch completes.

---

## Example: Trigger reading the matched line

```lua
-- Event: shatteredarchive:raw-data, Match text: "tells the group"
local text = ""
if event and event.payload then text = event.payload.text or "" end

writeTerminal("{c" .. text .. "{x\n")
```

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

## Calling globals

`runGlobal(id, args?, callback?)` calls a global written in ANY language (`global.<language>.<path>`). `args` is a table
(sent as plain data) or a JSON string. As a plain statement it works as it always has. It is also an ordinary call: when
the global has finished by the time `runGlobal` returns, that is its return value; otherwise it returns `nil`.

```lua
local twice = runGlobal("global.javascript.core.double", { n = 21 })      -- 42
local info  = runGlobal("global.python.core.info", { who = "orc" })       -- a table
writeTerminal(info.name .. " " .. info.n .. "\n")
```

For a global that is still running (an `async` JS function, a Python function that sleeps), pass a callback. It is
always called once, after your script has finished, as `callback(result, err)`:

```lua
runGlobal("global.javascript.core.later", { n = 7 }, function(result, err)
  if err then log("failed: " .. err) else writeTerminal(result .. "\n") end
end)
```

Whole numbers reach Lua as integers (`5`, not `5.0`); a returned list is a table with keys 1..n.
A callback is dropped if the Lua engine was restarted (Globals → Lua was saved) before the global finished.

---

## One Lua engine

Lua runs as ONE engine per connection, not one per script. The **Globals → Lua** source is run into it first, and
every Lua trigger, alias and timer then runs in that same engine. So:

- a function or variable defined in Globals → Lua can be called or read directly from any Lua script
  (no `runGlobal` needed): `bump()`, `counter`
- a global a script assigns (`kills = (kills or 0) + 1`) is still there for the next script, whichever
  trigger / alias / timer runs it; use `local` for anything that should stay private to one run
- editing and saving **Globals → Lua** restarts the engine: everything it held, including values set by scripts,
  starts over. Editing a script does not restart it.
- the bridge names (`log`, `error`, `sendCommand`, `event`, ...) are rebound on every run, so do not reuse them

Plugin-bundled scripts do not share this engine.

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
