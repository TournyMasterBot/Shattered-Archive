# Python User Scripts

Python scripts run in the browser via Skulpt and have a bridge API exposed as Python builtins.

---

## Available API (Python)

You can call these directly:

- `log(*args)`
- `error(*args)`
- `sendCommand(cmd: str)`
- `writeTerminal(dsl: str)` *(optional)*
- `runGlobal(id: str, args: object = None, callback = None) -> value` *(optional; see **Calling globals** below)*
- `getGlobalVar(key: str) -> str` *(returns JSON/string; empty if missing)*
- `setGlobalVar(key: str, value)`
- `deleteGlobalVar(key: str)`
- `getNamedVar(name: str) -> str` *(empty if missing)*
- `event` *(trigger/alias/timer context dict: `event["name"]`, `event["payload"]`; `None` if not applicable)*

Also available:
- `httpGetJson(url: str)` *(fire-and-forget; logs result asynchronously if available)*

**Important:** In Python, `httpGetJson()` does **not** return a value. It triggers a request and logs results via `log(...)` when the fetch completes.

---

## Example: Trigger reading the matched line

```python
# Event: shatteredarchive:raw-data, Match text: "tells the group"
payload = (event or {}).get("payload") or {}
text = payload.get("text", "")

writeTerminal("{c%s{x\n" % text)
```

---

## Example: Alias-like script using variables + globals

```python
t = getNamedVar("TARGET") or "rat"
writeTerminal("{W[gtest]{x TARGET=%s\n" % t)

setGlobalVar("LAST_TARGET", t)

runGlobal("global.javascript.core.echo", {"text": "Hello from Python"})
```

---

## Calling globals

`runGlobal(id, args=None, callback=None)` calls a global written in ANY language (`global.<language>.<path>`). As a
plain statement it works as it always has. It is also an ordinary call: when the global has finished by the time
`runGlobal` returns, that is its return value (dict, list, str, number, bool or None); otherwise it returns `None`.

```python
twice = runGlobal("global.javascript.core.double", {"n": 21})   # 42
info = runGlobal("global.lua.core.info", {"who": "orc"})        # a dict
writeTerminal("%s %d\n" % (info["name"], info["n"]))
```

For a global that is still running (an `async` JS function, a Python function that sleeps), pass a callback. It is
always called once, after your script has finished, as `callback(result, err)`:

```python
def got(result, err):
    writeTerminal("%s\n" % (err or result))

runGlobal("global.javascript.core.later", {"n": 7}, got)
```

---

## One Python engine

Python runs as ONE engine per connection, not one per script. The **Globals → Python** source is run into a single
module namespace first, and every Python trigger, alias and timer then runs in that same namespace. So:

- a function or variable defined in Globals → Python can be called or read directly from any Python script
  (no `runGlobal` needed): `add(5)`, `total`
- a name a script assigns at the top level (`kills = 1`) is still there for the next script; read it back with
  `kills += 1` (use `global` inside functions, as in any module)
- editing and saving **Globals → Python** restarts the engine: everything it held, including values set by
  scripts, starts over. Editing a script does not restart it.
- the bridge names (`log`, `sendCommand`, `event`, ...) are builtins that are rebound on every run

Plugin-bundled scripts do not share this engine.

---

## Python Global scripts

Python globals are defined in **Globals → Python**.

Calling:
- `runGlobal("global.python.core.echo", { ... })`

will invoke Python function:
- `core_echo(args)`

Where `args` is:
- a Python dict (if args was JSON),
- a string (if not JSON),
- or `None` (if no args).

### Example: Globals → Python

```python
def core_echo(args):
    text = ""
    if isinstance(args, dict):
        text = str(args.get("text", ""))
    writeTerminal("{G[Py global]{x echo: %s\n" % text)

def core_attackTarget(args):
    t = getNamedVar("TARGET") or "rat"
    sendCommand("kill %s" % t)
```

---

## Tips

- Use `writeTerminal("{x\n")` at the end of colored output to reset formatting.
- Python scripts share one namespace (see above), which is the simplest way to share state between Python scripts. To share with another language, or to keep a value across a Globals restart, use Global Variables (`setGlobalVar`): they are saved, per-connection and language-agnostic.
