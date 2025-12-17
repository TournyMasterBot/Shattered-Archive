# ShatteredArchive Docker Environment

## Overview
This document describes the Docker-based, production-like local environment used by ShatteredArchive.

It is designed to closely mirror production behavior while remaining approachable for contributors.

## Architecture

**Containers**
- game-client (static Vite build)
- web-client (static Vite build)
- game-server (Node / Express)
- web-server (Node / Express)
- nginx (edge proxy, single exposed port)

**External Entry**
- `http://shatteredarchive.dev` → nginx

**Internal Communication**
- Docker bridge network with DNS aliases
- Subdomain-based routing via nginx

## Service Hostnames
- `game-client.shatteredarchive.dev`
- `game-server.shatteredarchive.dev`
- `web-client.shatteredarchive.dev`
- `web-server.shatteredarchive.dev`

These names resolve:
- **inside Docker** via Docker DNS
- **on the host** via a one-time hosts-file setup

## Networking Model
- One Docker bridge network
- Each service has DNS aliases
- nginx routes traffic based on `Host` header

### Why hosts-file setup is required
Browsers do not use Docker’s internal DNS. The hosts-file ensures your browser can resolve the development subdomains locally.

## nginx Routing
- Subdomain-based virtual hosts
- API traffic proxied to Node servers
- WebSocket upgrade headers enabled

## Environment Variables

### Clients (Vite)
`VITE_*` variables are baked in at build time:
- `VITE_WEB_API`
- `VITE_WEB_WS`
- `VITE_WEB_SECURE`
- `VITE_ENV`

For Docker builds, these point to:
- `http://web-server.shatteredarchive.dev`
- `ws://web-server.shatteredarchive.dev`

### Servers
- `PORT`
- `NODE_ENV=production`
- `LOG_LEVEL=info`

## Logging
- Console + file logging (INFO+)
- Debug logs disabled by default
- JSON logs enabled where supported

## Running the Stack
```bash
docker compose -f deploy/docker-compose.yml up --build
```

Stop:
```bash
docker compose down
```

Rebuild:
```bash
docker compose build --no-cache
```

## Cleaning Up Hosts Entries

**Windows:**
```bash
pnpm remove:hosts:win
```

**macOS / Linux:**
```bash
sudo pnpm remove:hosts:nix
```

## Common Issues

### Ports already in use
Ensure ports 80, 30000, and 40000 are free.

### Services not reachable
- Verify servers bind to `0.0.0.0`
- Check nginx container logs

### DNS not resolving
- Re-run hosts setup
- Clear browser cache / DNS cache

## Development vs Docker

Docker is ideal for:
- integration testing
- production parity
- lower memory usage

`pnpm dev` is ideal for:
- active feature work
- rapid UI iteration
- HMR debugging
