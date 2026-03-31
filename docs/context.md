# Shattered Archive — AI Context Guide

This file is intended to orient an AI assistant (Claude, Copilot, etc.) working on this codebase. Read it before making changes.

---

## What is this project?

**Shattered Archive** is a browser-based MUD (Multi-User Dungeon) client for the DSL MUD (`dsl-mud.org:4000`). It is a TypeScript monorepo built with pnpm workspaces. Players connect to the MUD and interact through a terminal UI built on xterm.js, with scripting, plugins, equipment tracking, chat parsing, and community contribution features.

---

## Repository Layout

```
ShatteredArchive/            ← this repo (c:/Projects/ShatteredArchive)
├── apps/
│   ├── game-client/         ← React/Vite browser app (primary)
│   ├── game-server/         ← Node.js WebSocket-to-Telnet proxy
│   ├── web-client/          ← Marketing/website frontend
│   └── web-server/          ← Node.js caching proxy for Shattered Archive Remote Server
├── docs/                    ← Project documentation (this folder)
├── services/                ← Shared Node.js service packages
├── sdks/                    ← Shared SDK packages
├── types/                   ← Shared TypeScript type packages
└── utils/                   ← Shared utility packages
```

---

## The Game Client (`apps/game-client`)

This is where almost all user-facing work happens.

### Key architectural layers (inside-out):

```
WebSocket (/ws/game)
  → useGameConnection (hook)            emits game:remote-server:* events
    → RuntimeSingleton                  remaps to shatteredarchive:* events
      → UserScriptRuntime               parses GMCP, detects chat/combat lines
        → shatteredarchive:write-terminal
          → ShatteredArchiveTerminal    renders via xterm.js
```

### Critical event names

The most important events to know — don't confuse old names with new ones:

| Old (retired) | Current | Notes |
|---|---|---|
| `game:terminal-data` | `shatteredarchive:write-terminal` | Terminal render event |
| `game:socket-open` | `game:remote-server:open` | WebSocket opened |
| `game:socket-closed` | `game:remote-server:close` | WebSocket closed |
| `game:telnet-raw-chunk` | `game:remote-server:raw` | Raw MUD data |
| `game:chat-line` | `shatteredarchive:chat-line` | Chat line detected |

**The primary data event is `shatteredarchive:raw-data`.** This is what triggers, equipment delta hooks, and contribute modals all listen to.

Full event reference: [game-client.md](./game-client.md)
Full event flow diagram: [architecture/Emitted Events.md](./architecture/Emitted%20Events.md)

### State management

There is no central Redux/Zustand store. State is managed via specialized stores:
- `features/chat/chat-store.ts` — chat messages
- `features/equipment/equipment-store.ts` — equipment state (IndexedDB + LocalStorage)
- `features/room/roomDataStore.ts` — last received room data
- `features/userScripts/globalScriptsStore.ts` — per-connection user scripts and variables
- `features/accessibility/accessibility-settings-store.ts` — a11y settings
- `features/audio/audio-settings-store.ts` — audio settings

### User scripts

Users can write scripts in JavaScript, TypeScript, Lua (fengari-web), or Python (skulpt). Scripts are stored in `localStorage` keyed by `shatteredArchive.userScripts.{connectionId}`.

Script kinds: **trigger** (event-driven), **alias** (command intercept), **timer** (interval-driven), **text** (plain commands).

Available in scripts: `sendCommand`, `writeTerminal`, `log`, `error`, `event`, `httpGetJson`, `runGlobal`, `getGlobalVar`, `setGlobalVar`, `deleteGlobalVar`, `getNamedVar`.

### Plugins

Plugins are JavaScript modules implementing `IPluginModule`. They receive a `PluginRuntimeApi` with `sendCommand`, `onEvent`, `httpGetJson`, `getConfig`, `setConfig`. The core plugin registry is at `features/plugins/registry.ts`. Routed events available to plugins: see `features/plugins/routed-gmcp-events.ts`.

---

## The Shattered Archive Remote Server

This is a **separate repository** deployed at `https://shatteredarchive.com`. 

Key controllers:

| Controller | Routes | Purpose |
|---|---|---|
| `MapsController` | `GET /maps/...` | Continent/area/beast data |
| `ContributeController` | `POST /contribute/identify`, `POST /contribute/creaturelore` | Community data submissions |
| `LibraryController` | `GET /library/...` | Spell/ability library data |
| `UserController` | `GET/POST /user/...` | User auth |

The `apps/web-server` in this repo is a Node.js caching proxy deployed at `https://web-server.shatteredarchive.dev`. It sits **in front of** the Shattered Archive Remote Server for the maps endpoints. The contribute endpoints are called **directly** by the game client against `https://shatteredarchive.com`.

---

## Known TODOs / Issues

- `useEquipmentCapture.ts` has its event listener **commented out** (marked `TMB TODO`). The hook registers but does not listen to `shatteredarchive:raw-data`, meaning full `eq` snapshot capture is currently non-functional. The delta system (`useEquipmentDeltas`) does work correctly.

---

## Documentation Map

| Doc | What it covers |
|---|---|
| [game-client.md](./game-client.md) | Full event bus reference, scripting, architecture |
| [game-server.md](./game-server.md) | WebSocket protocol, message shapes, config |
| [web-server.md](./web-server.md) | REST API, caching, Shattered Archive Remote Server context |
| [definitions.md](./definitions.md) | Terminology: Pages, Components, Hooks, Features |
| [architecture/Emitted Events.md](./architecture/Emitted%20Events.md) | Mermaid event flow diagrams |
| [features/user-equipment.md](./features/user-equipment.md) | Equipment capture + delta system |
| [features/contribute.md](./features/contribute.md) | Identify + Creature Lore submission feature |
| [features/user-library.md](./features/user-library.md) | Library/spell browsing feature |
| [scripting/javascript.md](./scripting/javascript.md) | JS script API reference |
| [scripting/typescript.md](./scripting/typescript.md) | TS script API reference |
| [scripting/lua.md](./scripting/lua.md) | Lua runtime notes |
| [scripting/python.md](./scripting/python.md) | Python runtime notes |
| [deploy.md](./deploy.md) | Deployment overview |
| [ports.md](./ports.md) | Port allocations |

---

## Working in this codebase: tips

1. **Don't invent event names.** Always check `event-names.ts`, `routed-gmcp-events.ts`, or the source files before using an event string literal. The old names (`game:terminal-data`, `game:socket-open`, etc.) no longer exist.

2. **HMR-safe listeners.** Always pass a `key` option to `ListenEvent`. Duplicate registration with the same key removes the previous listener automatically — important for React hooks and hot reload.

3. **The terminal singleton.** `ShatteredArchiveTerminal.Instance` is a singleton that owns the xterm.js instance. Write to the terminal via `DispatchEvent('shatteredarchive:write-terminal', { rawText })` rather than calling the singleton directly from components.

4. **Equipment state.** Equipment delta parsing happens in `useEquipmentDeltas`. Equipment snapshot capture (`useEquipmentCapture`) is currently partially disabled — see Known TODOs above.

5. **Identity.** Character name is available at `window.__SA_IDENTITY__.characterName` after GMCP `login_data` arrives. Always check it before attempting contribute submissions.

6. **Shattered Archive Remote Server vs Node servers.** When you see code calling `https://shatteredarchive.com/...`, that is the Shattered Archive Remote Server (ASP.NET, separate repo). `https://web-server.shatteredarchive.dev` is `apps/web-server` (Node.js caching proxy). `/ws/game` is `apps/game-server` (Node.js telnet proxy).
