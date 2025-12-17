#!/bin/sh
set -eu

CERT_DIR="/etc/nginx/certs"
CERT="${CERT_DIR}/fullchain.pem"
KEY="${CERT_DIR}/privkey.pem"

# Generate a single self-signed cert with SANs for the local dev domains.
# This is NOT trusted by browsers by default; use http:// for no warnings.
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "[edge] Generating self-signed TLS cert (dev only)..."

  cat > /tmp/openssl.cnf <<'EOF'
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
CN = shatteredarchive.dev

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = shatteredarchive.dev
DNS.2 = game-client.shatteredarchive.dev
DNS.3 = web-client.shatteredarchive.dev
DNS.4 = game-server.shatteredarchive.dev
DNS.5 = web-server.shatteredarchive.dev
DNS.6 = *.shatteredarchive.dev
EOF

  openssl req -x509 -nodes -days 3650     -newkey rsa:2048     -keyout "$KEY"     -out "$CERT"     -config /tmp/openssl.cnf >/dev/null 2>&1

  rm -f /tmp/openssl.cnf
fi

exec "$@"
