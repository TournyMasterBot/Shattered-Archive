# Python User Scripts

Python scripts run in the browser via Skulpt and have a bridge API exposed as Python builtins.

---

## Available API (Python)

You can call these directly:

- `log(*args)`
- `error(*args)`
- `sendCommand(cmd: str)`
- `writeTerminal(dsl: str)` *(optional)*
- `runGlobal(id: str, args: object = None)` *(optional; fire-and-forget)*
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
- When sharing state across scripts, prefer Global Variables (`setGlobalVar`) over Python module globals, because globals are per-connection and language-agnostic.
