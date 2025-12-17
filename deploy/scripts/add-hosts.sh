#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "❌ This script must be run as root (use sudo)"
  echo "   Try: sudo pnpm setup:hosts:nix"
  exit 1
fi

HOSTS_FILE="/etc/hosts"

BEGIN="# BEGIN ShatteredArchive"
END="# END ShatteredArchive"

BLOCK=$(cat <<'EOF'
# BEGIN ShatteredArchive
127.0.0.1 shatteredarchive.dev
127.0.0.1 game-client.shatteredarchive.dev
127.0.0.1 game-server.shatteredarchive.dev
127.0.0.1 web-client.shatteredarchive.dev
127.0.0.1 web-server.shatteredarchive.dev
# END ShatteredArchive
EOF
)

# Remove existing block
tmp="$(mktemp)"
sudo awk -v b="$BEGIN" -v e="$END" '
  $0==b {inblock=1; next}
  $0==e {inblock=0; next}
  !inblock {print}
' "$HOSTS_FILE" | sudo tee "$tmp" >/dev/null

# Append new block
echo "" | sudo tee -a "$tmp" >/dev/null
echo "$BLOCK" | sudo tee -a "$tmp" >/dev/null

sudo cp "$tmp" "$HOSTS_FILE"
rm -f "$tmp"

echo "✅ Updated $HOSTS_FILE"
echo "$BLOCK"
