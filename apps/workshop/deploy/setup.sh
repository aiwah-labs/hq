#!/usr/bin/env bash
set -euo pipefail

echo "[1/6] Install Node.js 22 + pnpm"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
corepack enable
corepack prepare pnpm@latest --activate

echo "[2/6] Install PM2, nginx, postgres"
sudo npm install -g pm2
sudo apt-get install -y nginx postgresql postgresql-contrib certbot python3-certbot-nginx

echo "[3/6] Create postgres role/database (adjust as needed)"
sudo -u postgres psql -c "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aiwah') THEN CREATE ROLE aiwah LOGIN PASSWORD 'change_me'; END IF; END $$;"
sudo -u postgres psql -c "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aiwah_prod') THEN CREATE DATABASE aiwah_prod OWNER aiwah; END IF; END $$;"

echo "[4/6] Link nginx config"
sudo cp apps/workshop/deploy/nginx.conf /etc/nginx/sites-available/aiwah-workshop
sudo ln -sf /etc/nginx/sites-available/aiwah-workshop /etc/nginx/sites-enabled/aiwah-workshop
sudo nginx -t
sudo systemctl reload nginx

echo "[5/6] Request certificate"
echo "Run manually once DNS resolves: sudo certbot --nginx -d workshop.aiwahlabs.com"

echo "[6/6] Setup done"
