- [Overview](#overview)
- [Folder Path](#folder-path)
- [Connections](#connections)
- [Scripting Language Support](#scripting-language-support)
  - [JS Bridge Supported Commands](#js-bridge-supported-commands)
  - [Javascript](#javascript)
  - [Typescript](#typescript)
  - [LUA](#lua)
  - [Python](#python)
- [MUD Interaction Tools](#mud-interaction-tools)
  - [Triggers](#triggers)
  - [Alias](#alias)
  - [Timers](#timers)
- [Event Bus Reference](#event-bus-reference)
  - [Transport Events (WebSocket Layer)](#transport-events-websocket-layer)
    - [`game:remote-server:open`](#gameremote-serveropen)
    - [`game:remote-server:raw`](#gameremote-serverraw)
    - [`game:remote-server:gmcp`](#gameremote-servergmcp)
    - [`game:remote-server:error`](#gameremote-servererror)
    - [`game:remote-server:close`](#gameremote-serverclose)
    - [`game:socket-error`](#gamesocket-error)
  - [Internal Shattered Archive Events](#internal-shattered-archive-events)
    - [`shatteredarchive:raw-data`](#shatteredarchiveraw-data)
    - [`shatteredarchive:gmcp-data`](#shatteredarchivegmcp-data)
    - [`shatteredarchive:write-terminal`](#shatteredarchivewrite-terminal)
    - [`shatteredarchive:write-console`](#shatteredarchivewrite-console)
    - [`shatteredarchive:send-command`](#shatteredarchivesend-command)
    - [`shatteredarchive:chat-line`](#shatteredarchivechat-line)
    - [`shatteredarchive:server-error`](#shatteredarchiveserver-error)
    - [`shatteredarchive:server-closed`](#shatteredarchiveserver-closed)
    - [`shatteredarchive:connection-changed`](#shatteredarchiveconnection-changed)
    - [`shatteredarchive:userScripts-updated`](#shatteredarchiveuserscripts-updated)
    - [`shatteredarchive:globalVars-updated`](#shatteredarchiveglobalvars-updated)
    - [`shatteredarchive:accessibility-updated`](#shatteredarchiveaccessibility-updated)
    - [`shatteredarchive:identity-updated`](#shatteredarchiveidentity-updated)
    - [`shatteredarchive:movement-attempt`](#shatteredarchivemovement-attempt)
    - [`shatteredarchive:movement-failed`](#shatteredarchivemovement-failed)
    - [`shatteredarchive:movement-succeeded`](#shatteredarchivemovement-succeeded)
    - [`shatteredarchive:named-var:set`](#shatteredarchivenamed-varset)
    - [`shatteredarchive:named-var:delete`](#shatteredarchivenamed-vardelete)
    - [`shatteredarchive:named-var:clear`](#shatteredarchivenamed-varclear)
  - [GMCP Game Events](#gmcp-game-events)
    - [`game:gmcp`](#gamegmcp)
    - [`game:tick`](#gametick)
    - [`game:char-data`](#gamechar-data)
    - [`game:room-data`](#gameroom-data)
    - [`game:affects-trueup`](#gameaffects-trueup)
    - [`game:affect-added`](#gameaffect-added)
    - [`game:affect-removed`](#gameaffect-removed)
    - [`game:character-login`](#gamecharacter-login)
  - [Combat \& Equipment Events](#combat--equipment-events)
    - [`event:disarm`](#eventdisarm)
    - [`event:wield:primary`](#eventwieldprimary)
    - [`event:wield:secondary`](#eventwieldsecondary)
    - [`event:gear:wear`](#eventgearwear)
    - [`event:gear:remove`](#eventgearremove)
    - [`event:flee:success`](#eventfleesuccess)
    - [`event:flee:failed`](#eventfleefailed)
    - [`event:damage`](#eventdamage)
    - [`event:creature-death`](#eventcreature-death)
    - [`event:level-up`](#eventlevel-up)

---

# Overview

The game client is the front-end UI for the Shattered Archive MUD client. It connects to the game server via WebSocket, renders output in a terminal (xterm.js), and exposes a rich event bus for plugins, user scripts, and components.

The client is a Vite/React/TypeScript single-page application. All user-visible logic (scripting, plugins, equipment tracking, chat, autoleveling) lives here.

# Folder Path

- `apps/game-client`

# Connections

- **`apps/game-server`** — WebSocket proxy at `/ws/game`. The client connects here to reach the MUD.
- **`apps/web-server`** — REST API for map/area/beast data. Acts as a caching proxy in front of the Shattered Archive Remote Server.

---

# Scripting Language Support

## JS Bridge Supported Commands

- [JS Bridge](./scripting/javascript.md)
- [TS Bridge](./scripting/typescript.md)
- [LUA Bridge](./scripting/lua.md)
- [Python Bridge](./scripting/python.md)

## Javascript

**Status**: Fully Supported

Supported via native browser. This includes external requests (`fetch`, `httpGetJson`) and all browser APIs.

## Typescript

**Status**: Fully Supported

On-the-fly transpilation using the TypeScript compiler API bundled into the client. Functionally identical to JavaScript in terms of available APIs.

## LUA

**Status**: Best Effort

Supported via `fengari-web`. No file system, no HTTP, no WebSocket. Only the JS bridge API is available.

## Python

**Status**: Best Effort

Supported via `skulpt`. Core language features only — no sockets, HTTP, or OS access. Only the JS bridge API is available.

---

# MUD Interaction Tools

## Triggers

Triggers listen to a named event (most commonly `shatteredarchive:raw-data`) and run a script when the event payload matches a configured text pattern. Triggers can optionally suppress (omit) the matching line from the terminal output.

Key fields:
- `eventName` — which event to listen to (see [ROUTED_WINDOW_EVENTS](#gmcp-game-events) for the full list available to plugins and scripts)
- `matchText` — text substring to match against the event payload
- `caseInsensitive` — whether matching is case-insensitive
- `omitFromOutput` — if true, the matching line is suppressed from the terminal
- `dontRequireMatchText` — if true, the trigger fires for every event regardless of text

## Alias

Aliases intercept user-typed commands before they are sent to the MUD. If the typed text matches an alias pattern (including capture variable syntax like `{TARGET}`), the alias script executes instead of the raw command being sent. Captured variables are injected as local constants in the script scope.

The command separator character (default `;`) is configurable via Accessibility Settings and propagated via `shatteredarchive:accessibility-updated`.

## Timers

Timers run a script on a repeating interval (in milliseconds). The timer system is driven by a global 250ms tick (`window.__SA_USERSCRIPTS_TIMER_TICK__`). Timer state is per-script-id and persists across HMR reloads within a session.

---

# Event Bus Reference

All events are dispatched on `window` as `CustomEvent` instances. The `detail` property contains the payload.

**Listening to events:**

```ts
import { ListenEvent } from 'features/event-emitter/event-dispatcher';

const unsubscribe = ListenEvent<SomePayload>('event-name', (payload) => {
  // handle payload
}, { key: 'my-listener-key' });

// cleanup:
unsubscribe();
```

The `key` option is important for HMR safety — it de-duplicates listeners with the same key, removing the previous registration automatically.

---

## Transport Events (WebSocket Layer)

These events are emitted by `useGameConnection` (`apps/game-client/src/hooks/useGameConnection.ts`) directly from the WebSocket message handlers. They represent raw I/O from the game server.

> **Note:** These are internal transport events. Most consumers should listen to the higher-level `shatteredarchive:*` events instead.

---

### `game:remote-server:open`

**Emitted by:** `useGameConnection` → `emitSocketOpen`
**Listened by:** `RuntimeSingleton` (indirectly via redispatch)

Signals that the WebSocket connection to the game server has opened.

```ts
{
  type: 'socket-opened';
  host: string;
  port: number;
  receivedTimestamp: string; // ISO 8601
}
```

---

### `game:remote-server:raw`

**Emitted by:** `useGameConnection` → `emitServerRaw`
**Listened by:** `RuntimeSingleton` → redispatched as `shatteredarchive:raw-data`

Raw text data from the MUD, exactly as received from the game server.

```ts
{
  type: 'raw';
  receivedTimestamp: string; // ISO 8601
  payload: string;           // Raw telnet data, may include ANSI codes
}
```

---

### `game:remote-server:gmcp`

**Emitted by:** `useGameConnection` → `emitServerGmcp`
**Listened by:** `RuntimeSingleton` → redispatched as `shatteredarchive:gmcp-data`; also processed into `game:tick`, `game:char-data`, `game:room-data`, etc.

Raw GMCP packet from the MUD.

```ts
{
  type: 'gmcp';
  receivedTimestamp: string; // ISO 8601
  payload: string;           // GMCP payload string, e.g. "char_data {...}"
}
```

---

### `game:remote-server:error`

**Emitted by:** `useGameConnection` → `emitServerError`
**Listened by:** `RuntimeSingleton` → redispatched as `shatteredarchive:server-error`

An error from the game server or the WebSocket layer.

```ts
{
  type: 'error';
  payload: {
    receivedTimestamp: string; // ISO 8601
    message: string;
  };
}
```

---

### `game:remote-server:close`

**Emitted by:** `useGameConnection` → `emitSocketClosed` or `emitServerClose`
**Listened by:** `RuntimeSingleton` → redispatched as `shatteredarchive:server-closed`

The connection to the game server was closed. `type` distinguishes client-initiated (`socket-closed`) vs server-initiated (`server-closed`) closes.

```ts
{
  type: 'socket-closed' | 'server-closed';
  payload: {
    host?: string;
    port?: number;
    receivedTimestamp: string; // ISO 8601
    reason?: string;
  };
}
```

---

### `game:socket-error`

**Emitted by:** `useGameConnection` → WebSocket `onerror` handler

WebSocket error (transport-level, not application-level). Does not carry error details — only location info.

```ts
{
  host?: string;
  port?: number;
  ts: number; // Date.now()
}
```

---

## Internal Shattered Archive Events

These events form the primary integration surface for components, plugins, and user scripts. They are derived from the transport events above via `RuntimeSingleton`.

---

### `shatteredarchive:raw-data`

**Emitted by:** `RuntimeSingleton` (remapped from `game:remote-server:raw`)
**Listened by:** `UserScriptRuntime`, `useEquipmentDeltas`, `ContributeIdentifyModal`, `ContributeCreatureLoreModal`, chat probe

The primary raw game data event. One event per incoming data chunk from the MUD.

```ts
{
  rawText: string;           // Raw text (may include ANSI codes)
  text: string;              // Same as rawText (legacy alias)
  fromUserScript: boolean;   // Always false for MUD-originated data
}
```

**Used by triggers:** This is the most common `eventName` for user triggers. Match against `rawText` or `text`.

---

### `shatteredarchive:gmcp-data`

**Emitted by:** `RuntimeSingleton` (remapped from `game:remote-server:gmcp`)
**Listened by:** `UserScriptRuntime` → parsed into `game:tick`, `game:char-data`, etc.

Raw GMCP packet before parsing into typed game events.

```ts
{
  rawText: string;         // Full GMCP string, e.g. "char_data {\"hp\":100,...}"
  fromUserScript: boolean; // Always false
}
```

---

### `shatteredarchive:write-terminal`

**Emitted by:** `UserScriptRuntime` (for each non-omitted line), user scripts
**Listened by:** `ShatteredArchiveTerminal` singleton

Instructs the terminal to render text. Lines that are suppressed by trigger omit rules are not dispatched.

```ts
{
  rawText: string;              // Text to write (ANSI codes supported)
  fromUserScript?: boolean;     // true if originated from a user script
  receivedTimestamp?: string;   // ISO 8601 (from original raw event)
}
```

> **Note:** Lines with `fromUserScript: true` bypass omit rules.

---

### `shatteredarchive:write-console`

**Emitted by:** Terminal singleton (debug path)
**Listened by:** `ShatteredArchiveTerminal` (logs to browser console, does not render to terminal)

Used for diagnostic logging of text to the browser console without terminal output.

```ts
{
  rawText: string;
}
```

---

### `shatteredarchive:send-command`

**Emitted by:** `UserScriptRuntime` (default `sendCommand` impl), aliases, scripts
**Listened by:** `useGameConnection`

Sends a command string to the MUD. The command is echoed to the terminal in green before being sent.

```ts
{
  cmd: string; // Command text to send, e.g. "look" or "kill orc"
}
```

---

### `shatteredarchive:chat-line`

**Emitted by:** `UserScriptRuntime.processRawEvent` (when the chat probe matches)
**Listened by:** `RuntimeSingleton` → `appendChatLine` (chat store)

Emitted when a raw game line is classified as a chat message by the chat probe.

```ts
{
  rawText: string;
  text?: string;
  receivedTimestamp?: string;  // ISO 8601

  // Chat span indices (relative to the full text string):
  isChat: true;
  speakerStart: number;
  speakerEnd: number;
  verbStart: number;
  verbEnd: number;
  messageStart: number;
  messageEnd: number;
}
```

---

### `shatteredarchive:server-error`

**Emitted by:** `RuntimeSingleton` (remapped from `game:remote-server:error`)

Application-level server error notification.

```ts
{
  message: string;
}
```

---

### `shatteredarchive:server-closed`

**Emitted by:** `RuntimeSingleton` (remapped from `game:remote-server:close`)

The game server connection closed.

```ts
{
  reason?: string;
}
```

---

### `shatteredarchive:connection-changed`

**Emitted by:** UI when the active connection/character switches
**Listened by:** `RuntimeSingleton` → re-hydrates scripts and switches named-var scope

```ts
{
  connectionId?: string;
}
```

---

### `shatteredarchive:userScripts-updated`

**Emitted by:** `UserScriptSandboxModal` (after saving scripts)
**Listened by:** `RuntimeSingleton`, `UserScriptRuntime` → reloads script registry

```ts
{
  connectionId?: string;
}
```

---

### `shatteredarchive:globalVars-updated`

**Emitted by:** Global script store (when global variables change)
**Listened by:** `UserScriptRuntime` → rebuilds trigger omit rules

```ts
{
  key?: string; // Storage key that was updated
}
```

---

### `shatteredarchive:accessibility-updated`

**Emitted by:** Accessibility settings modal (after saving)
**Listened by:** `RuntimeSingleton` → updates the alias split character

```ts
{
  commandSplitChar?: string;
  // ...other accessibility settings fields
}
```

---

### `shatteredarchive:identity-updated`

**Emitted by:** `UserScriptRuntime.setIdentitySnapshot` (on GMCP `login_data`)
**Listened by:** `ContributeIdentifyModal`, `ContributeCreatureLoreModal`

Character identity derived from GMCP login data.

```ts
{
  characterName?: string;
  updatedAt?: number; // Date.now()
}
```

---

### `shatteredarchive:movement-attempt`

**Emitted by:** `autoleveling-engine.ts` when a directional move command is dispatched
**Listened by:** `useCompassBlock`, autoleveling engine (movement correlation)

Fired immediately before the movement command is sent to the MUD.

```ts
{
  cmd: string;    // Movement command, e.g. "n", "sw"
  dir?: string;   // Compass direction if applicable
}
```

---

### `shatteredarchive:movement-failed`

**Emitted by:** `useCompassBlock` (when failure text is detected after a movement attempt)
**Listened by:** Autoleveling engine (waits for result)

```ts
{
  cmd: string;
  direction?: string;
}
```

---

### `shatteredarchive:movement-succeeded`

**Emitted by:** `useCompassBlock` (on receipt of `game:room-data` after an attempt)
**Listened by:** Autoleveling engine (waits for result)

```ts
{
  cmd: string;
  dir?: string;
  room?: string; // Room name from GMCP room_data
}
```

---

### `shatteredarchive:named-var:set`

**Emitted by:** Scripts or UI that want to push a named variable change
**Listened by:** `RuntimeSingleton` → updates the in-memory named var map

```ts
{
  name: string;           // Variable name (normalized to UPPERCASE)
  value: string;
  connectionId?: string;
}
```

---

### `shatteredarchive:named-var:delete`

**Emitted by:** Scripts or UI
**Listened by:** `RuntimeSingleton` → removes entry from named var map

```ts
{
  name: string;
  connectionId?: string;
}
```

---

### `shatteredarchive:named-var:clear`

**Emitted by:** Scripts or UI
**Listened by:** `RuntimeSingleton` → clears all named vars for a connection

```ts
{
  connectionId?: string;
}
```

---

## GMCP Game Events

These events are parsed from `shatteredarchive:gmcp-data` inside `UserScriptRuntime.processGmcpEvent`. They are also included in `ROUTED_WINDOW_EVENTS` (`features/plugins/routed-gmcp-events.ts`), making them available to plugins and user script triggers.

---

### `game:gmcp`

**Emitted by:** `UserScriptRuntime` for every GMCP packet (raw, unstructured)

```ts
{
  raw: string; // Full GMCP payload as received
}
```

---

### `game:tick`

**Emitted by:** `UserScriptRuntime` on GMCP `tick` packets

```ts
{
  // tick payload fields (game-specific)
}
```

---

### `game:char-data`

**Emitted by:** `UserScriptRuntime` on GMCP `char_data` packets
**Listened by:** `useFocusBarVitals`, `useRightSidebar`, `useCharData`

```ts
{
  hp: number; max_hp: number;
  mana: number; max_mana: number;
  move: number; max_move: number;
  gold: number; silver: number;
  wimpy: number;
  str: number; max_str: number;
  int: number; max_int: number;
  wis: number; max_wis: number;
  dex: number; max_dex: number;
  con: number; max_con: number;
  stance: string;
  language: string;
  tnl: number;         // To next level
  carry_weight: number; can_carry_weight: number;
  is_afk: boolean;
  is_quiet: boolean;
  is_flying: boolean;
  is_riding: boolean;
  is_fighting: boolean;
}
```

---

### `game:room-data`

**Emitted by:** `UserScriptRuntime` on GMCP `room_data` packets
**Listened by:** `useCompassBlock`, `useRoomHeader`, autoleveling engine, movement hooks

```ts
{
  room: string;       // Room name
  sector: string;     // Sector/area
  exits: string[];    // Available exit directions
}
```

---

### `game:affects-trueup`

**Emitted by:** `UserScriptRuntime` on GMCP `affect_data` packets

Full replacement of the affects list.

```ts
{
  affects: AffectData[];
}
```

---

### `game:affect-added`

**Emitted by:** `UserScriptRuntime` on GMCP `add_affect` packets

```ts
{
  name: string;
  duration: number;
  // ...affect-specific fields
}
```

---

### `game:affect-removed`

**Emitted by:** `UserScriptRuntime` on GMCP `remove_affect` packets

```ts
{
  name: string;
}
```

---

### `game:character-login`

**Emitted by:** `UserScriptRuntime` on GMCP `login_data` packets. Also triggers `shatteredarchive:identity-updated`.

```ts
{
  name?: string;          // Character name (may also appear as characterName, char_name, etc.)
  // ...other login fields
}
```

---

## Combat & Equipment Events

These events are emitted from `useEquipmentDeltas` and `UserScriptRuntime.processForSpecialLines`. They are included in `ROUTED_WINDOW_EVENTS` and available to plugin/script triggers.

Slot-specific variants are also dispatched alongside the generic event:
- `event:gear:wear:{slot}` — e.g. `event:gear:wear:wielded`
- `event:gear:remove:{slot}` — e.g. `event:gear:remove:secondary weapon`

---

### `event:disarm`

**Emitted by:** `useEquipmentDeltas` (on disarm text detection)

Clears the wielded and secondary weapon slots.

```ts
{
  text: string; // The raw game line that triggered this
}
```

---

### `event:wield:primary`

**Emitted by:** `useEquipmentDeltas` (on "You wield X." detection)

```ts
{
  item: string;     // Item name (status tags stripped)
  rawItem: string;  // Item name as-received
  slot: 'wielded';
  text: string;
}
```

---

### `event:wield:secondary`

**Emitted by:** `useEquipmentDeltas` (on "You wield X as a secondary weapon." detection)

```ts
{
  item: string;
  rawItem: string;
  slot: 'secondary weapon';
  text: string;
}
```

---

### `event:gear:wear`

**Emitted by:** `useEquipmentDeltas` (on "You wear X ..." detection)

Generic wear event. Also dispatched as `event:gear:wear:{slot}`.

```ts
{
  item: string;    // Item name (status tags stripped)
  rawItem: string;
  slot: string;    // Canonical slot key, e.g. "worn on torso"
  text: string;
}
```

---

### `event:gear:remove`

**Emitted by:** `useEquipmentDeltas` (on "You stop using X." detection)

Generic remove event. Also dispatched as `event:gear:remove:{slot}` when the slot can be matched.

```ts
{
  item: string;
  rawItem: string;
  slot?: string;  // Canonical slot key if matched; undefined if ambiguous
  text: string;
}
```

---

### `event:flee:success`

**Emitted by:** `UserScriptRuntime.processForSpecialLines` on "You flee from combat!"

```ts
{
  text: string;
}
```

---

### `event:flee:failed`

**Emitted by:** `UserScriptRuntime.processForSpecialLines` on "PANIC! You couldn't escape!" or similar

```ts
{
  text: string;
}
```

---

### `event:damage`

**Emitted by:** `UserScriptRuntime` on damage line detection

```ts
{
  text: string;
  // ...parsed damage fields
}
```

---

### `event:creature-death`

**Emitted by:** `UserScriptRuntime.processForSpecialLines` on "X is DEAD!!"

```ts
{
  text: string;
}
```

---

### `event:level-up`

**Emitted by:** `UserScriptRuntime` (via `ProbeLevelUpLine` detection)

```ts
{
  text: string;
}
```
