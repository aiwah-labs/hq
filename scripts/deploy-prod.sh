#!/bin/bash
set -e

echo "Deploying production..."
cd /opt/aiwah-hq

echo "Fetching latest changes..."
git fetch origin

echo "Resetting to production branch..."
git reset --hard origin/production

echo "Building images..."
docker compose -f docker-compose.prod.yml --env-file .env.prod build

echo "Starting containers..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

echo "Deployment complete!"
