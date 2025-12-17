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

echo "🔧 Removing ShatteredArchive entries from $HOSTS_FILE"

tmp="$(mktemp)"

# Remove the marked block if it exists
sudo awk -v b="$BEGIN" -v e="$END" '
  $0==b {inblock=1; next}
  $0==e {inblock=0; next}
  !inblock {print}
' "$HOSTS_FILE" | sudo tee "$tmp" >/dev/null

sudo cp "$tmp" "$HOSTS_FILE"
rm -f "$tmp"

echo "✅ ShatteredArchive hosts entries removed (if they existed)."
