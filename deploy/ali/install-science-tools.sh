#!/usr/bin/env bash
set -euo pipefail

id grainpeak >/dev/null 2>&1 || useradd --system --home-dir /opt/grainpeak --shell /sbin/nologin grainpeak
id ramanfit >/dev/null 2>&1 || useradd --system --home-dir /opt/ramanfit --shell /sbin/nologin ramanfit

install -m 0644 /tmp/grainpeak.service /etc/systemd/system/grainpeak.service
install -m 0644 /tmp/ramanfit.service /etc/systemd/system/ramanfit.service
install -m 0644 /tmp/science-tools.caddy /etc/caddy/science-tools.caddy

if ! grep -Fxq 'import /etc/caddy/science-tools.caddy' /etc/caddy/Caddyfile; then
  printf '\nimport /etc/caddy/science-tools.caddy\n' >> /etc/caddy/Caddyfile
fi

caddy fmt --overwrite /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/science-tools.caddy
caddy validate --config /etc/caddy/Caddyfile

systemctl daemon-reload
systemctl enable --now grainpeak.service ramanfit.service
systemctl reload caddy.service
