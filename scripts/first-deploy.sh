#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/4] Building images..."
docker compose -f docker-compose.prod.yml --env-file .env.prod build

echo "[2/4] Starting postgres..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres
sleep 5

echo "[3/4] Running migrations and seed..."
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api sh -c "pnpm db:migrate:prod && pnpm db:seed"

echo "[4/4] Starting all services..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

echo ""
echo "HQ is running!"
echo "API:      http://localhost:3003"
echo "Workshop: http://localhost:3002"
echo ""
echo "Next: bash scripts/setup-nginx.sh your-domain.com"
