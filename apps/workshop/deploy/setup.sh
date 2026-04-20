#!/usr/bin/env bash
set -euo pipefail

# CUSTOMIZE: override these for your deployment.
DB_ROLE="${DB_ROLE:-hq}"
DB_PASSWORD="${DB_PASSWORD:-change_me}"
DB_NAME="${DB_NAME:-hq_prod}"
NGINX_SITE="${NGINX_SITE:-hq-workshop}"
APP_DOMAIN="${APP_DOMAIN:-workshop.example.com}"

echo "[1/6] Install Node.js 22 + pnpm"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
corepack enable
corepack prepare pnpm@latest --activate

echo "[2/6] Install PM2, nginx, postgres"
sudo npm install -g pm2
sudo apt-get install -y nginx postgresql postgresql-contrib certbot python3-certbot-nginx

echo "[3/6] Create postgres role/database (adjust as needed)"
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_ROLE}') THEN CREATE ROLE ${DB_ROLE} LOGIN PASSWORD '${DB_PASSWORD}'; END IF; END \$\$;"
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}') THEN CREATE DATABASE ${DB_NAME} OWNER ${DB_ROLE}; END IF; END \$\$;"

echo "[4/6] Link nginx config"
sudo cp apps/workshop/deploy/nginx.conf "/etc/nginx/sites-available/${NGINX_SITE}"
sudo ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
sudo nginx -t
sudo systemctl reload nginx

echo "[5/6] Request certificate"
echo "Run manually once DNS resolves: sudo certbot --nginx -d ${APP_DOMAIN}"

echo "[6/6] Setup done"
