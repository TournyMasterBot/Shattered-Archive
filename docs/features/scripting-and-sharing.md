# Scripting & Sharing — User Guide

How to automate your play with scripts, and how to move that work between the
web client, your phone, and other devices.

This covers both clients. Where they differ, it says so.

---

## The three things you can create

| | What it is | Where |
|---|---|---|
| **Scripts** | Triggers, aliases and timers that react to the game | Scripts panel |
| **Global scripts** | Shared functions your scripts call, one file per language | Scripts → Globals |
| **Plugins** | Built-in automation modules you turn on and configure | Plugins panel |

All three travel together when you share (see [Sharing](#sharing) below).

---

## Scripts

A script is one of three kinds:

- **Trigger** — runs when a line of game text matches, or when a game event fires
- **Alias** — runs when you type a short command
- **Timer** — runs on a repeating interval

Each script is written in one of five languages:

| Language | Use it for |
|---|---|
| **Commands** (`text`) | One game command per line. Lines starting with `#` are ignored. |
| **JavaScript** | The general-purpose choice |
| **TypeScript** | JavaScript with types. Types are stripped before running — they are *not* checked. |
| **Lua** | If you prefer Lua |
| **Python** | If you prefer Python |

All five run on both the web client and mobile. (On mobile, `await` inside a
JavaScript or TypeScript script works where the phone's engine supports it;
otherwise use `runGlobal(...).then(...)`.)

### What a script can do

Every language gets the same calls. JavaScript, TypeScript and Lua can spell them either way (`api.sendCommand("north")`
or `sendCommand("north")`); Python uses the plain names only. The `api.` spelling is shown here:

| Call | Does |
|---|---|
| `api.sendCommand(cmd)` | Send a command to the game |
| `api.writeTerminal(dsl)` | Write coloured text to your own screen (the game never sees it) |
| `api.log(...)` / `api.error(...)` | Write to the script log |
| `api.getGlobalVar(key)` / `api.setGlobalVar(key, v)` / `api.deleteGlobalVar(key)` | Persistent key/value storage |
| `api.getNamedVar(name)` / `api.setNamedVar(name, v)` | Named variables used for `{NAME}` expansion |
| `api.doAfter(ms, 'world'\|'alias', cmd)` | Run something after a delay |
| `api.runGlobal(id, args, callback)` | Call a global function, written in any language — see below |
| `api.httpGetJson(url)` | Fetch JSON from a URL |
| `api.event` | The event that triggered this script |

In **Lua and Python** the same calls are also available as bare globals, so
`sendCommand("north")` and `api.sendCommand("north")` both work.

```javascript
// JavaScript trigger: quaff when you get low
api.sendCommand("quaff heal");
```

```lua
-- The same thing in Lua
sendCommand("quaff heal")
```

```python
# ...and in Python
sendCommand("quaff heal")
```

### Things that don't work in scripts, by design

- **No file access.** Lua's `io.open`, `os.remove`, `os.tmpname` and Python's
  file I/O are unavailable. On mobile they raise a clear error telling you so.
- **No shell access.** Lua's `os.execute` is unavailable.
- **No interactive prompts.** Lua's `debug.debug()` is unavailable.
- **No local or private network addresses from `api.httpGetJson`** (mobile).
  Public `http`/`https` only — `localhost`, `127.0.0.1`, `192.168.x.x`,
  `10.x.x.x`, `172.16–31.x.x`, `169.254.x.x` and `.local` names are refused, as
  are non-web schemes like `file:` and `data:`. The browser enforces the
  equivalent for the web client automatically; a phone app has no such built-in
  boundary, so it is enforced in code. See [Sharing safely](#sharing-safely).

These are unavailable in the browser too, so a script that avoids them behaves
the same everywhere.

---

## Global scripts

Global scripts are shared functions your triggers, aliases and timers call
instead of copy-pasting the same code into a dozen scripts. There is one file
per language, and a global written in **any** language can be called from a
script in **any** language.

**Web:** the Scripts panel's globals section.
**Mobile:** Scripts tab → **Globals** (top right).

Call one with `runGlobal("global.<language>.<name>")`:

```javascript
// In your global JavaScript file:
exports.heal = (api, args) => api.sendCommand("quaff " + args.potion);
```

```javascript
// From any trigger, alias or timer:
api.runGlobal("global.javascript.heal", { potion: "heal" });
```

Note the shapes, which differ per language:

- **JavaScript / TypeScript** — assign to `exports`. A bare `function foo() {}`
  is **not** callable; it is local to the file. A function taking two parameters
  receives `(api, args)`; one taking a single parameter receives `args` only.
- **Lua** — `function heal(argsJson) ... end`
- **Python** — `def heal(args):`

A dotted name maps to underscores in Lua and Python, so
`runGlobal("global.lua.combat.flee")` calls `combat_flee`.

In a **Commands** script, a line that is *only* a global identifier runs that
global instead of being sent to the game:

```
global.lua.heal
kill goblin
```

Global scripts stay loaded between calls, so module-level state persists.
Saving the global file for a language restarts that language's engine (see below).

### Lua and Python are one program

Lua and Python each run as a single engine: the global file is run first, and
then every Lua (or Python) trigger, alias and timer runs in that same engine.

- A function or variable defined in the global file, or in any script, can be
  used directly by every other script in that language: `bump()`, `counter`. You
  do not need `runGlobal` to reach your own language.
- A Lua variable set without `local` (`kills = (kills or 0) + 1`) is still there
  for the next script. Use `local` for anything that should stay private to one
  run. A Python name set at the top level persists the same way.
- Saving the global file for a language **restarts** that engine, so what it held
  (including values scripts set) starts over. Editing a trigger, alias or timer does not.

### JavaScript and TypeScript: globals by name

Everything the JavaScript and TypeScript global files export is available in every
JavaScript and TypeScript script by name, so you just call it:

```javascript
// Global file
exports.state = { kills: 0 };
exports.hit = (api, args) => { api.sendCommand("kill " + args.target); return ++exports.state.kills; };

// Any JavaScript / TypeScript script
const kills = hit({ target: "goblin" });   // the number it returned
state.kills = 0;                           // the global file's own object
```

The `(api, args)` / `(args)` rule above is applied for you, and what the function
returns comes back as it is (a promise from an `async` function). Scripts may use
`await` at the top level. If both files export a name, the script's own language
wins; names the script already has (`log`, `sendCommand`, `event`), reserved words
and names that are not valid identifiers are not bound.

### Calling a global from any language

| From | Call | Result |
|---|---|---|
| JavaScript / TypeScript | `await runGlobal("global.lua.combat.flee", args)` | the value |
| Lua | `local r = runGlobal("global.python.combat.info", {who = "orc"})` | the value if the global finished at once, else `nil` |
| Python | `r = runGlobal("global.javascript.double", {"n": 21})` | the value if the global finished at once, else `None` |
| Lua / Python, a global that takes time | `runGlobal(id, args, callback)` | `callback(result, error)`, after your script has finished |

Arguments and results are plain data: text, numbers, true/false, nothing, lists
and dictionaries. A function, a class instance or a value that contains itself
comes back as nothing. A Lua table with keys 1..n is a list, any other table a
dictionary, and whole numbers reach Lua as integers. A Lua global receives its
arguments as a JSON string, a Python global receives the value.

"Finished at once" means before `runGlobal` returned: any Lua function, any
non-`async` JavaScript / TypeScript function, any Python function that does not
sleep. For anything else pass a callback, which is always called, later.
`runGlobal("...")` on a line of its own, ignoring the result, works as it always did.

---

## Plugins

Plugins are built-in automation modules. Both clients ship the same 18, with the
same names, so a plugin you configure on one works on the other.

Turn them on and configure them in the Plugins panel (web) or the Scripts tab
(mobile). Your per-plugin settings are part of what gets shared.

---

## Sharing

There are two independent ways to move your work. Both carry **scripts, global
scripts and plugin configuration together** — a trigger that calls a global is
useless without the global, and a plugin is useless without its settings.

### 1. Cloud sync (needs an account)

Log in with your Shattered Archive account:

- **Web:** File → Account…
- **Mobile:** Settings → Account

Then:

- **Save to cloud** — pushes this device's scripts, globals and plugin config
- **Load from cloud** — replaces them with whatever you last saved

Logging in is entirely optional. Everything works without an account; sync just
adds somewhere to put it.

> **Load replaces, it does not merge.** It overwrites the scripts and plugin
> settings on the device you load onto. Both clients ask you to confirm first.

### 2. Export / import a file (no account)

- **Web:** the Scripts panel's Export / Import buttons — downloads and reads a
  `.json` file
- **Mobile:** the Scripts tab's Export / Import buttons — shares and picks a
  `.json` file

The file format is shared, so **every direction works**:

- Web → mobile
- Mobile → web
- Web → web (including into a different connection)
- Mobile → another phone or tablet, iOS or Android

Importing **adds** scripts rather than replacing them, but **replaces** global
scripts and plugin settings.

Older export files that predate global/plugin sharing still import fine — they
simply leave your globals and plugin settings untouched.

### What does not transfer

- **Scripts in a language the other client cannot run** — not an issue today,
  since both run all five.
- **Plugins the other client does not ship** — skipped, and the import tells you
  how many were skipped. Your own plugins are left alone.
- **Your account credentials** — sharing a file shares your automation, never
  your login.

> **A shared file contains code that will run on your device.** Treat one from
> someone else the way you would treat any script you did not write: read it
> first. See [Sharing safely](#sharing-safely).

---

## Sharing safely

Scripts are real programs. Importing a file, or loading from an account someone
else can reach, means running code you did not write.

What a script **can** do: send game commands as you, read and write your script
variables, and make web requests via `api.httpGetJson`.

What a script **cannot** do: read or write files on your device, run shell
commands, or — on mobile — reach anything on your home or office network
through `api.httpGetJson`. Lua and Python scripts reach *only* the `api` object
above; they have no other route to your device.

Practical advice:

- Read an imported file before you import it — it is plain JSON, and the `source`
  fields are the code.
- Be especially wary of scripts that call `api.httpGetJson`, which can send data
  off your device.
- If you share your account across devices, anything you save to the cloud runs
  on all of them.

---

## Troubleshooting

**A script does nothing.**
Check it is enabled, and check the script log for an error. A trigger also needs
its match text and event to actually fire.

**A Lua/Python script errors about files or shell commands.**
That is deliberate — see [above](#things-that-dont-work-in-scripts-by-design).
Use `setGlobalVar`/`getGlobalVar` to keep state instead.

**`runGlobal` says "function not found".**
In JavaScript/TypeScript, check you assigned to `exports.` — a bare `function`
declaration is not callable. In Lua/Python, check a dotted name maps to
underscores (`global.lua.a.b` calls `a_b`).

**Imported plugin settings did not appear.**
They apply immediately on both clients. If a plugin was already on and you
changed its config, it is turned off and on again so the new values take effect.

**On mobile, `api.httpGetJson` says an address is "local or private".**
That is the network boundary described
[above](#things-that-dont-work-in-scripts-by-design) — a released build only
lets scripts reach public web addresses. (If you are running a development build
of the app yourself, private addresses are permitted so you can test against a
local server.)

**An import said "No valid scripts found".**
The file is not a Shattered Archive export, or it is corrupt. Exports are plain
JSON starting with `"schema": "shatteredArchive.export.v1"`.
