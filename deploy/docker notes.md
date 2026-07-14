# ── DslLogViewer ────────────────────────────────────────────
# Run from C:\Projects\DslLogViewer (or wherever the files are copied on server)

# Start (build image + run)
docker compose -f docker-compose.yml up -d --build

# Check logs
docker logs -f --tail 200 dsl-log-viewer

# Rebuild after changes
docker compose -f docker-compose.yml up -d --build --force-recreate

# Tear down
docker compose -f docker-compose.yml down --remove-orphans

# ── ShatteredArchive ─────────────────────────────────────────
# Wait healthchecks
docker compose -f deploy/docker-compose.yml -p shatteredarchive-prod up -d --build --pull always --remove-orphans --wait

# Check game server logs
docker compose -f deploy/docker-compose.yml -p shatteredarchive-prod logs -f --tail 200

# Manual kick
docker compose -f deploy/docker-compose.yml -p shatteredarchive-prod up -d --build --remove-orphans

# Nginx being a butt
docker rm -f shatteredarchive-nginx
cd ~/src/shatteredarchive/deploy
docker compose up -d --no-deps nginx
docker ps -a --filter "name=shatteredarchive-nginx"

# ── MUD Builder (experimental stack only) ────────────────────
# Volume layout: the merc-mud GAME runs from its OWN compose
# (C:/Projects/merc-mud/docker-compose.yml) and bind-mounts
# C:/Projects/merc-mud/2.4/area at /opt/merc-mud/area. The builder server
# (this stack) bind-mounts the SAME host dir at /mud/area. Shared host dir =
# builder writes (areas, backups/, reload.signal, copyover.signal) are the
# live game files; the game's 1s sentinel poll picks reloads up. Bringing
# this stack up/down never touches the game container.
#
# MUD_WRITE_ENABLED=true is set ONLY on the mud-builder-server service in
# docker-compose.shattered-archive-experimental.yml — never in a Dockerfile
# or .env. Everywhere else the builder is preview/download-only.

# Start just the builder pair (game stays wherever it is)
docker compose -f deploy/docker-compose.shattered-archive-experimental.yml up -d --build mud-builder-server mud-builder-client

# Start/refresh the game itself (separate compose, brief downtime — players notice)
docker compose -f C:/Projects/merc-mud/docker-compose.yml up -d --build

# Builder UI through the edge: https://build.shatteredarchive.dev
# API through the edge:        https://build.shatteredarchive.dev/api/capabilities

# Burn it all down and try again
docker compose ls
docker compose -p shatteredarchive-prod down --remove-orphans
docker compose -p shatteredarchive down --remove-orphans
docker compose ls --format json | jq -r '.[].Name' | while read -r p; do
  echo "DOWN $p"
  docker compose -p "$p" down --remove-orphans
done
docker rm -f $(docker ps -aq --filter "name=shatteredarchive") 2>/dev/null || true