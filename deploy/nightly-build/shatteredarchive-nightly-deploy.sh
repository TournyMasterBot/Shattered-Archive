#!/usr/bin/env bash
set -euo pipefail

# Absolute path (no ~ inside quotes)
REPO_DIR="$HOME/src/shatteredarchive"
BRANCH="release/dev"

PROJECT="shatteredarchive-prod"

# You said you want deploy/docker-compose.yml
COMPOSE_FILE="$REPO_DIR/deploy/docker-compose.yml"

# Use user-writable locations (avoid /var/log and /var/lock)
LOCKDIR="$HOME/.local/var/lock"
LOGDIR="$HOME/.local/var/log"
mkdir -p "$LOCKDIR" "$LOGDIR"

LOCKFILE="$LOCKDIR/shatteredarchive-nightly-deploy.lock"
LOGFILE="$LOGDIR/shatteredarchive-nightly-deploy.log"

exec >>"$LOGFILE" 2>&1
echo "---- $(date -Is) starting deploy ----"

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

  echo "Building images..."
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build --pull

  echo "Applying update..."
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --remove-orphans --wait --wait-timeout 300

  echo "Pruning unused images..."
  docker image prune -f

  echo "Deploy successful."
) 9>"$LOCKFILE"

echo "---- $(date -Is) deploy finished ----"