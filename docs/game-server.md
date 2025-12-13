- [Overview](#overview)
- [Folder Path](#folder-path)
- [Connections](#connections)

# Overview
The game server is the back end service for the Shattered Archive mud client. This project should exist as a thin proxy to the mud for client input, and includes supporting logic to manage UI specific features. This server should not include character specific logic, and should maintain distinction between game sessions to allow multiple clients to connect in parallel. 

# Folder Path
* apps/game-server

# Connections
* apps/web-server