---
id: services-map
title: Service constellation, edge routing and shared state
kind: service
tags: [docker, compose, nginx, routing, networks, volumes, websocket, deploy]
repo: ShatteredArchive
paths: [docs/ports.md, deploy/docker-compose.yml, deploy/nginx/edge-subdomains.conf]
verified_date: 2026-10-03
verified_commit: ad565a6
status: current
---

# Service constellation

Ports are not listed here. `docs/ports.md` is the audited registry: register a new listener there before using it, and never use a tool's well-known default port (the host runs many other Docker projects).

## Compose projects and networks

- The prod stack is the compose project `shatteredarchive-prod` (`deploy/docker-compose.yml`). It has two networks: `shatteredarchive-prod` (the stack's own) and `sa-shared` (fixed name `sa-shared`).
- `sa-shared` is shared with the C# site (the DSL repo's `docker-compose-prod.yml`, a separate compose project that declares it `external`). This stack creates it, so bring this stack up first.
- Services are reached by the alias `<service>.shatteredarchive.dev` on their network (for example `auth-server.shatteredarchive.dev`), not only by container name.
- `auth-server` and `auth-client` are additive on purpose: they are not in nginx's `depends_on`, so they can never block the rest of the stack from starting.

## Edge nginx

- One edge nginx publishes 80 and 443, and 5900 (proxies to `dsl-log-viewer`). It routes by host name: `game-client.`, `web-client.`, `web-server.`, `game-server.`, `simulacrum.`, `build.` (MUD Builder), `auth.` on `shatteredarchive.dev`, and `shatteredarchive.com` / `www` to the C# site. `deploy/nginx/edge-subdomains.conf` is the complete list.
- The browser's game websocket is `/ws/game` on the game-client host. nginx proxies it to `game-server:31000`.
- **Every `proxy_pass` uses a variable upstream** (`resolver 127.0.0.11 valid=30s; set $game_server game-server:31000; proxy_pass http://$game_server;`), never a literal host name. A literal name is resolved once when nginx loads its config and cached for the worker's life; Docker reuses freed addresses, so recreating an app without recreating nginx pins the block to an address another container now owns. The failure is silent: on 2026-08-03 `game-client.shatteredarchive.dev` served the scrum-poker SPA under game-client's CSP.
- The game-client's CSP profile allows `unsafe-eval` (user scripts and the bundled Lua/Python interpreters need it). The other apps use the strict profile; which file applies is picked per environment by `NGINX_CSP_SCRIPTING_FILE` (dev versus prod).

## game-server is an allowlisted proxy

`game-server` only connects to MUD targets listed in `GAME_PROXY_ALLOWLIST` (currently `dsl-mud.org:4000`, `dsl-mud.org:8000` and the simulacrum relay on port 65001). `GAME_PROXY_ALLOW_ALL` is `"false"`. A new target must be added to the allowlist in the compose file.

## Shared volumes

- `sa-service-pubkeys`: public keys that consuming services publish for auto-registration with the auth hub. It has a fixed name (not project-scoped) because the C# site is a separate compose project that declares it `external`; without the fixed name each project would create its own and never see the other's files. See `auth-service.md`.
- `auth-server-secrets`: the auth hub's encryption key. A project-scoped named volume, deliberately not a host path (the key must not be casually visible or editable).
- `scrum-poker-data`: scrum-poker-server's data.
