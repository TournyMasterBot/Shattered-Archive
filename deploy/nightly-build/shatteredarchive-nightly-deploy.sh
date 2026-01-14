# Save as /usr/local/bin/shatteredarchive-nightly-deploy.sh and chmod +x it:
#!/usr/bin/env bash
set -euo pipefail

# Adjust to your actual repo path on the server
REPO_DIR="/src/shatteredarchive"
BRANCH="release/dev"

PROJECT="shatteredarchive-prod"
COMPOSE_FILE="deploy/docker-compose.yml"

LOCKFILE="/var/lock/shatteredarchive-nightly-deploy.lock"
LOGFILE="/var/log/shatteredarchive-nightly-deploy.log"

exec >>"$LOGFILE" 2>&1
echo "---- $(date -Is) starting deploy ----"

# prevent overlapping runs
(
  flock -n 9 || { echo "Another deploy is running; exiting."; exit 0; }

  cd "$REPO_DIR"

  echo "Fetching updates..."
  git fetch --prune origin

  echo "Checking out $BRANCH..."
  git checkout "$BRANCH"

  OLD_SHA="$(git rev-parse HEAD)"
  git pull --ff-only origin "$BRANCH"
  NEW_SHA="$(git rev-parse HEAD)"

  if [[ "$OLD_SHA" == "$NEW_SHA" ]]; then
    echo "No changes (still $NEW_SHA). Exiting."
    exit 0
  fi

  echo "Updated: $OLD_SHA -> $NEW_SHA"

  # Build first so running containers stay up during build
  echo "Building images..."
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build --pull

  # Apply changes without tearing the whole stack down.
  # --wait requires healthchecks to be defined for services you care about. :contentReference[oaicite:3]{index=3}
  echo "Applying update..."
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --remove-orphans --wait --wait-timeout 300

  echo "Pruning unused images..."
  docker image prune -f

  echo "Deploy successful."
) 9>"$LOCKFILE"

echo "---- $(date -Is) deploy finished ----"
