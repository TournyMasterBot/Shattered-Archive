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

All five run on both the web client and mobile.

### What a script can do

Every language gets the same `api` object:

| Call | Does |
|---|---|
| `api.sendCommand(cmd)` | Send a command to the game |
| `api.writeTerminal(dsl)` | Write coloured text to your own screen (the game never sees it) |
| `api.log(...)` / `api.error(...)` | Write to the script log |
| `api.getGlobalVar(key)` / `api.setGlobalVar(key, v)` / `api.deleteGlobalVar(key)` | Persistent key/value storage |
| `api.getNamedVar(name)` / `api.setNamedVar(name, v)` | Named variables used for `{NAME}` expansion |
| `api.doAfter(ms, 'world'\|'alias', cmd)` | Run something after a delay |
| `api.runGlobal(id, args)` | Call a global function — see below |
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
per language.

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

Global scripts stay loaded between calls, so module-level state persists. Editing
one reloads it on the next call — no restart needed.

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
