#!/usr/bin/env bash
set -e

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"

mkdir -p "$CERT_DIR"

echo "🔐 Generating mkcert certificates into $CERT_DIR"

mkcert \
  -cert-file "$CERT_DIR/shatteredarchive.dev.pem" \
  -key-file  "$CERT_DIR/shatteredarchive.dev-key.pem" \
  shatteredarchive.dev \
  game-client.shatteredarchive.dev \
  web-client.shatteredarchive.dev \
  game-server.shatteredarchive.dev \
  web-server.shatteredarchive.dev

echo "✅ Certificates generated"
