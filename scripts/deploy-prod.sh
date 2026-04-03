#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Pulling latest changes..."
git pull origin ${DEPLOY_BRANCH:-main}

echo "Building updated images..."
docker compose -f docker-compose.prod.yml --env-file .env.prod build

echo "Running migrations..."
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api pnpm db:migrate:prod

echo "Restarting services..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

echo "Deployment complete!"
