
#!/usr/bin/env bash
set -e

if ! command -v mkcert >/dev/null; then
  echo "mkcert not installed. See https://github.com/FiloSottile/mkcert"
  exit 1
fi

mkcert -install

mkdir -p deploy/nginx/certs

mkcert \
  -cert-file deploy/nginx/certs/shatteredarchive.dev.pem \
  -key-file deploy/nginx/certs/shatteredarchive.dev-key.pem \
  shatteredarchive.dev \
  game-client.shatteredarchive.dev \
  web-client.shatteredarchive.dev \
  game-server.shatteredarchive.dev \
  web-server.shatteredarchive.dev \
  build.shatteredarchive.dev \
  auth.shatteredarchive.dev \
  kingdom-tactics.shatteredarchive.dev \
  scrum-poker.shatteredarchive.dev

echo "mkcert certificates generated."
