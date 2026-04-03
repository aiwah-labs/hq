#!/usr/bin/env bash
set -euo pipefail

[ "$EUID" -eq 0 ] || { echo "Run as root (sudo or root user)"; exit 1; }

echo "[1/4] Installing Docker..."
apt-get update -qq
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "[2/4] Installing nginx + certbot..."
apt-get install -y nginx certbot python3-certbot-nginx

echo "[3/4] Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "[4/4] Done."
echo ""
echo "Next: git clone https://github.com/aiwah-labs/hq /opt/hq && cd /opt/hq && cp .env.example .env.prod"
