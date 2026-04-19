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

# Burn it all down and try again
docker compose ls
docker compose -p shatteredarchive-prod down --remove-orphans
docker compose -p shatteredarchive down --remove-orphans
docker compose ls --format json | jq -r '.[].Name' | while read -r p; do
  echo "DOWN $p"
  docker compose -p "$p" down --remove-orphans
done
docker rm -f $(docker ps -aq --filter "name=shatteredarchive") 2>/dev/null || true