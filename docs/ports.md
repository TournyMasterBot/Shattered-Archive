# Port registry

Register every new listener HERE before using it. "Published" = bound on the host;
"internal" = only reachable on a Docker network (still register it, so nobody reuses it
by accident). Last full audit: 2026-10-02 (docker ps, compose files, app configs, netstat).

# Game
apps/game-client: 30080
apps/game-server: 31000

# Web
apps/web-client: 40080
apps/web-server: 41000

# MUD Builder
apps/mud-builder-client: 60080
apps/mud-builder-server: 61000

# Auth Service
apps/auth-client: 62080
apps/auth-server: 62000

# Scrum Poker
apps/scrum-poker-client: 63080
apps/scrum-poker-server: 63000

# Soulsteel
apps/soulsteel-client: 64080
apps/soulsteel-server: 64000

# Simulacrum
apps/simulacrum-server: 65000
apps/simulacrum-server relay: 65001
apps/simulacrum-server -> merc-mud (upstream target, not a listener of its own): 4000

# PSD Viewer (low priority; moved 2026-10-02 from 62080/62000, which collided with auth)
apps/psd-viewer-client: 20080
apps/psd-viewer-server: 20000

# Shattered Story (C:\Projects\Shattered-Story; a native Android app, so no web client port)
story-edge TLS 1.3 for the phone (published on the LAN IP only, never 0.0.0.0): 21000
apps/story-server (internal only: networks `app` and `shattered-ai_story`, never published): 21010

# No ports (VS Code extensions, not services)
apps/dsl-color-preview
apps/dsl-log-preview

# Host edge / backends (deploy/docker-compose*.yml)
shatteredarchive-nginx (edge, published): 80, 443
shatteredarchive-nginx (edge, published; proxies to dsl-log-viewer:5900): 5900
shatteredarchive-csharp (published): 5000, 8888
merc-mud (published, host loopback only): 4000
simulacrum-docker-proxy (internal only): 2375

# Shattered-AI (C:\Projects\Shattered-AI — not part of the apps/ scheme)
shattered_mcp MCP/SSE (published, host loopback only): 3100
shattered_gateway TLS + X-API-Key for the mobile app (published, LAN-facing): 8080
ollama-code (published, host loopback only; container-internal 11434): 41434
ollama-story (internal only, no host port; container 11434): 11434
comfyui (internal only): 8188
qwen_gateway MCP/SSE for `pnpm run qwen` (published, host loopback only): 3101
qwen_gateway egress allowlist (internal `agent` network only, never published): 10100
shattered_mcp_media MCP/SSE, image tools only, ON DEMAND via `--profile media` (published, host loopback only): 3102

# Allocation rules and ranges
#
# Rules
#  - Never use a tool's well-known default for a new service (3000, 5000, 8000, 8080, 8888,
#    11434, 5173, ...). This host runs many other Docker projects side by side.
#  - Before assigning, check it is free: `docker ps -a`, `netstat -ano | findstr LISTENING`,
#    and `netsh int ipv4 show excludedportrange protocol=tcp` (Windows/Hyper-V reserve ranges,
#    e.g. 27339, 28385, 28390 today). Then add it to this file in the same change.
#  - Valid ports end at 65535. Do NOT invent 66xxx — nginx and every client reject it.
#  - Windows hands out ephemeral ports from 49152-65535; the apps scheme below already sits
#    inside that band, so never publish an ad-hoc listener there without registering it.
#  - Internal-only listeners need to be unique only within their Docker network, but register
#    them anyway.
#
# Ranges
#  30000-65535  APPS scheme: `<N>0000` server, `<N>0080` client.
#              Decades 30,31 (game), 40,41 (web), 60,61 (mud-builder), 62 (auth),
#              63 (scrum-poker), 64 (soulsteel), 65 (simulacrum) are TAKEN; 50,51 are free. Beyond
#              that the scheme is exhausted at 65 — new apps use the lower range below.
#  20000-29999  NEW APPS, same scheme: 2N000 server / 2N080 client. TAKEN: 20 (psd-viewer), 21 (shattered-story: 21000 edge,
#              21010 server; 21080 stays unused, there is no web client).
#              Next free: 22000/22080, 23000/23080, ... 29000/29080. Verify each pair is free
#              first; occupied by other software on this host today: 22112, 27339 (Windows-
#              reserved), 28385, 28390.
#  10000-10999  LOCAL AI / DEV TOOLING and internal sidecars (egress allowlists, brokers, MCP
#              helpers). 10100 = qwen_gateway egress. Next free: 10101+.
#  11000-12999  Free — spare for tooling or additional internal listeners.
#  13000-19999  Mostly free. Occupied by other software today: 13030-13032.
#  1024-9999    Legacy/default territory (3100/3101 Shattered-AI MCP, 4000 merc-mud, 5000/5900/
#              8080/8888 existing). Do not add new services here; existing ones stay put.
#  Occupied by non-workspace software today (avoid): 9012-9014, 13030-13032, 22112, 27339,
#              28385, 28390.
