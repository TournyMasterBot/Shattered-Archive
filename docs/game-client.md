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