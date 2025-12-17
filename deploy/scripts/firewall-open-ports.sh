#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-prod}" # prod|dev|all
PROJECT="ShatteredArchive"

if [[ "$MODE" == "prod" ]]; then
  PORTS=(80 443)
elif [[ "$MODE" == "dev" ]]; then
  PORTS=(30080 40080)
elif [[ "$MODE" == "all" ]]; then
  PORTS=(80 443 30080 31000 40080 41000)
else
  echo "Unknown MODE '$MODE' (expected prod|dev|all)" >&2
  exit 1
fi

echo "[$PROJECT] Opening ports ($MODE): ${PORTS[*]}"

if command -v ufw >/dev/null 2>&1; then
  for p in "${PORTS[@]}"; do
    sudo ufw allow "${p}/tcp" comment "${PROJECT} ${MODE}" >/dev/null || true
  done
  sudo ufw reload >/dev/null
  exit 0
fi

if command -v firewall-cmd >/dev/null 2>&1; then
  for p in "${PORTS[@]}"; do
    sudo firewall-cmd --permanent --add-port="${p}/tcp" >/dev/null
  done
  sudo firewall-cmd --reload >/dev/null
  exit 0
fi

for p in "${PORTS[@]}"; do
  sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT -p tcp --dport "$p" -j ACCEPT
done

echo "NOTE: iptables rules may not persist across reboot unless saved."
