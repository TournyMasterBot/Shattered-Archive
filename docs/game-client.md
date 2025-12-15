- [Overview](#overview)
- [Folder Path](#folder-path)
- [Connections](#connections)
- [Scripting Language Support](#scripting-language-support)
  - [JS Bridge Supported Comands](#js-bridge-supported-comands)
  - [Javascript](#javascript)
  - [Typescript](#typescript)
  - [LUA](#lua)
  - [Python](#python)
- [MUD Interaction Tools](#mud-interaction-tools)
  - [Triggers](#triggers)
  - [Alias](#alias)
  - [Timers](#timers)
- [Event Bus Reference](#event-bus-reference)
  - [`game:terminal-data`](#gameterminal-data)
  - [`game:socket-open`](#gamesocket-open)
  - [`game:socket-closed`](#gamesocket-closed)
  - [`game:gmcp-auto-enable`](#gamegmcp-auto-enable)
  - [`game:telnet-raw-chunk`](#gametelnet-raw-chunk)
  - [`game:telnet-raw-line`](#gametelnet-raw-line)
  - [`game:chat-line`](#gamechat-line)
  - [`game:movement-attempt`](#gamemovement-attempt)
  - [`game:movement-failed`](#gamemovement-failed)
  - [`game:movement-succeeded`](#gamemovement-succeeded)
  - [`game:gmcp`](#gamegmcp)

# Overview
The game client is the front end UI for the shatteredarchive mud client. This project should contain all logic that can be modified by users to send data to the MUD.

# Folder Path
* apps/game-client

# Connections
* apps/game-server
* apps/web-server

# Scripting Language Support
## JS Bridge Supported Comands
* [JS Bridge](./scripting/javascript.md)
* [TS Bridge](./scripting/typescript.md)
* [LUA Bridge](./scripting/lua.md)
* [Python Bridge](./scripting/python.md)

## Javascript
**Status**: Fully Supported

Supported via native browser, the javascript script engine should 'just work' for pretty much all scripting purposes. This includes external requests to fetch data from remote resources.

## Typescript
**Status**: Fully Supported

Supported via native browser by utilizing on-the-fly transpilation, the typescript script engine should 'just work' for pretty much all scripting purposes. This includes external requests to fetch data from remote resources.

## LUA
**Status**: Best Effort

Supported via `fengari-web`. This supports real lua code (that does not have access to the file system) and does NOT have access to things like http.get or websocket.connect. Only the commands defined in the JS bridge will be supported to interact with the environment.

## Python
**Status**: Best Effort

Supported via `skulpt`. This supports core language features but does NOT have direct access to sockets/http/OS functionality. Only the commands defined in the JS bridge will be supported to interact with the environment.

# MUD Interaction Tools
## Triggers
## Alias
## Timers

# Event Bus Reference

This document describes the **custom DOM events** emitted by the Shattered Archive game client. These events form the primary integration surface for UI components, plugins, and diagnostics.

All events are dispatched on `window` using `CustomEvent`.

```ts
window.addEventListener('<event-name>', (ev) => {
  const ce = ev as CustomEvent<any>;
  console.log(ce.detail);
});
```

---

## `game:terminal-data`

**Purpose**
Emitted whenever text should be rendered to the main terminal.

**When it fires**

* On every incoming TELNET raw chunk
* When the client echoes commands or internal status messages

**Detail payload**

```ts
{
  text: string; // ANSI text, may include CR/LF
}
```

**Notes**

* Text is not split into lines
* Intended for terminal renderers (xterm.js, log panes)

---

## `game:socket-open`

**Purpose**
Signals that the WebSocket connection to the game server has opened.

**Detail payload**
*None*

**Notes**

* Useful for timers, UI state, or plugin lifecycle hooks

---

## `game:socket-closed`

**Purpose**
Signals that the WebSocket connection has closed.

**Detail payload**
*None*

**Notes**

* Fired on manual disconnect or server close
* GMCP timers and connection-scoped state are reset shortly after

---

## `game:gmcp-auto-enable`

**Purpose**
Emitted when the client automatically sends the `gmcp` command after no GMCP packets are observed during the probe window.

**Detail payload**

```ts
{
  host?: string;
  port?: number;
}
```

**Notes**

* Indicates a fallback behavior
* Does **not** guarantee GMCP is active yet

---

## `game:telnet-raw-chunk`

**Purpose**
Provides the raw TELNET data chunk exactly as received from the server.

**Detail payload**

```ts
{
  text: string; // Raw chunk, may contain multiple lines
}
```

**Notes**

* No splitting or filtering
* Ideal for logging, replay capture, or low-level analysis

---

## `game:telnet-raw-line`

**Purpose**
Emitted once per parsed line extracted from a TELNET chunk.

**Detail payload**

```ts
{
  text: string;    // Line without trailing CR/LF
  rawLine: string; // Line including original CR/LF if present
}
```

**Notes**

* One event per logical line
* Used by plugins and chat detection

---

## `game:chat-line`

**Purpose**
Emitted when a TELNET line is detected as player/NPC chat.

**Detail payload**

```ts
{
  text: string;     // Full chat line (ANSI)
  rawLine: string;  // Raw line including CR/LF
  rawChunk?: string;

  speakerStart: number;
  speakerEnd: number;
  verbStart: number;
  verbEnd: number;
  messageStart: number;
  messageEnd: number;
}
```

**Notes**

* Indices are relative to `text`
* No substrings are allocated by the probe
* Used to populate the Chat pane and audio alerts

---

## `game:movement-attempt`

**Purpose**
Indicates that the user attempted to move (e.g. via compass or command).

**Detail payload**

```ts
{
  cmd: string;      // Movement command sent (e.g. "n", "sw")
  dir?: string;     // Compass direction if applicable
  ts: number;       // Timestamp (ms)
  source?: string;  // e.g. "compass"
}
```

**Notes**

* Fired immediately before `game:send-command`
* No success or failure implied

---

## `game:movement-failed`

**Purpose**
Emitted when a recent movement attempt is inferred to have failed.

**Detail payload**

```ts
{
  cmd: string;
  dir?: string;
  ts: number;
  reasonLine: string; // Server text indicating failure
}
```

**Notes**

* Detected heuristically from server output
* Time-window based correlation with last attempt

---

## `game:movement-succeeded`

**Purpose**
Emitted when a movement attempt results in a successful room change.

**Detail payload**

```ts
{
  cmd: string;
  dir?: string;
  ts: number;
  room?: string;
}
```

**Notes**

* Triggered on receipt of `room_data` GMCP
* Considered authoritative compared to text parsing

---

## `game:gmcp`

**Purpose**
Low-level notification of raw GMCP packets.

**Detail payload**

```ts
{
  raw: string; // Full GMCP payload as received
}
```

**Notes**

* Higher-level GMCP events (`game:room-data`, `game:char-data`, etc.) are emitted separately
* Useful for debugging or custom GMCP handlers

---