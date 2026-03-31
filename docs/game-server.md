- [Overview](#overview)
- [Folder Path](#folder-path)
- [Connections](#connections)
- [WebSocket Protocol](#websocket-protocol)
  - [Endpoint](#endpoint)
  - [Client → Server Messages](#client--server-messages)
  - [Server → Client Messages](#server--client-messages)
  - [Connection Lifecycle](#connection-lifecycle)
- [Configuration](#configuration)
- [Logging](#logging)

---

# Overview

The game server is a thin WebSocket-to-Telnet proxy. It accepts browser WebSocket connections and tunnels them to a MUD server over Telnet. It has no game logic; it is purely a transport bridge.

Multiple clients may connect simultaneously. Each WebSocket connection is independent and maintains its own Telnet session.

# Folder Path

- `apps/game-server`

# Connections

- **Inbound:** Browser game clients via WebSocket at `/ws/game`
- **Outbound:** MUD servers via Telnet (default: `dsl-mud.org:4000`)
- **Sibling:** `apps/web-server` (separate process; game-server does not call it directly)

---

# WebSocket Protocol

## Endpoint

```
ws://<host>/ws/game        (HTTP)
wss://<host>/ws/game       (HTTPS)
```

The game client connects to the same host it was served from, using `window.location.host`.

---

## Client → Server Messages

All messages are JSON-encoded strings.

### `connect` — initiate a MUD connection

Must be the **first message** sent after the WebSocket opens.

```ts
{
  type: 'connect';
  host: string;  // e.g. "dsl-mud.org"
  port: number;  // e.g. 4000
}
```

If the target is not on the allowlist (see Configuration), the server closes the WebSocket with an error message.

### `data` — send text to the MUD

```ts
{
  type: 'data';
  data: string;  // Raw command text, e.g. "look\n"
}
```

---

## Server → Client Messages

All messages are JSON-encoded strings.

### `raw` — MUD text output

```ts
{
  type: 'raw';
  data: string;  // Raw telnet data (may contain ANSI codes, partial lines, etc.)
}
```

### `gmcp` — GMCP packet

```ts
{
  type: 'gmcp';
  data: string;  // GMCP payload, e.g. "char_data {\"hp\":100,...}"
}
```

### `error` — server-side error

```ts
{
  type: 'error';
  message: string;
}
```

### `close` — server closed the MUD connection

```ts
{
  type: 'close';
  reason?: string;
}
```

---

## Connection Lifecycle

```
1. Browser opens WebSocket to /ws/game
2. Browser sends:  { type: 'connect', host: 'dsl-mud.org', port: 4000 }
3. Server validates host:port against allowlist
4. Server establishes Telnet connection to host:port
5. Telnet data received  →  { type: 'raw', data: '...' }  →  browser
6. GMCP packet received  →  { type: 'gmcp', data: '...' }  →  browser
7. Browser sends:  { type: 'data', data: 'look\n' }
8. Server forwards data over Telnet to MUD
9. MUD disconnects  →  { type: 'close', reason: '...' }  →  browser WebSocket closes
```

---

# Configuration

Controlled via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | (required) | HTTP/WS server port |
| `GAME_PROXY_ALLOW_ALL` | `false` | Set `"true"` to bypass the host allowlist |
| `GAME_PROXY_ALLOWLIST` | `"dsl-mud.org:4000"` | Comma-separated `host:port` entries allowed as Telnet targets |
| `LOG_FILE_PATH` | `./log/server.log` | Plain text log output |
| `JSON_LOG_FILE_PATH` | `./log/server.log.jsonl` | JSONL structured log output |
| `LOG_MAX_FILE_SIZE` | (none) | Max log file size |
| `LOG_MAX_FILES` | (none) | Max number of log files |
| `LOG_DATE_PARTITIONED` | `false` | Date-partition log files |
| `LOG_RESPECT_SOH` | `true` | Suppress high-volume log events (raw data) when SOH control char received |

---

# Logging

Uses `@shatteredarchive/services-server` Logger with both plain-text and JSONL output.

Log events `game:remote-server:raw` and `game:client:input` are considered high-volume and are suppressed when `LOG_RESPECT_SOH` is true and a SOH (Start of Header) character is received.
