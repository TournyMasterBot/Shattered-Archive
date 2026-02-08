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