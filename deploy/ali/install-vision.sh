#!/usr/bin/env bash
set -euo pipefail

release=/opt/cnt-vision/releases/20260911-portal
test -s "$release/vision_api.py"
test -s /etc/cnt-vision/deepseek.key
chown root:cntvision /etc/cnt-vision/deepseek.key
chmod 0640 /etc/cnt-vision/deepseek.key
ln -sfn "$release" /opt/cnt-vision/current
install -m 0644 "$release/cnt-vision.service" /etc/systemd/system/cnt-vision.service
install -m 0644 "$release/cnt-vision.caddy" /etc/caddy/cnt-vision.caddy
if ! grep -Fxq 'import /etc/caddy/cnt-vision.caddy' /etc/caddy/Caddyfile; then
  cp -p /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-vision-20260911
  printf '\nimport /etc/caddy/cnt-vision.caddy\n' >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable cnt-vision.service
systemctl restart cnt-vision.service
systemctl reload caddy.service
