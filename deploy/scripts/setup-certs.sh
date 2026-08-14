#!/usr/bin/env bash
set -e

# Must match the compose mount: ./nginx/certs -> /etc/nginx/certs
CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/nginx/certs"

mkdir -p "$CERT_DIR"

echo "🔐 Generating mkcert certificates into $CERT_DIR"

# Apex + wildcard — the wildcard covers every one-level subdomain
# (game-client, web-client, game-server, web-server, build, ...), so adding
# a new subdomain to nginx never requires touching this script again.
mkcert \
  -cert-file "$CERT_DIR/shatteredarchive.dev.pem" \
  -key-file  "$CERT_DIR/shatteredarchive.dev-key.pem" \
  shatteredarchive.dev \
  '*.shatteredarchive.dev'

echo "✅ Certificates generated"
