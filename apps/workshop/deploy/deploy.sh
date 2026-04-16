#!/usr/bin/env bash
set -euo pipefail

REPO_DIR=${REPO_DIR:-/var/www/aiwah-hq}
cd "$REPO_DIR"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

git pull --ff-only
pnpm install --frozen-lockfile
pnpm db:migrate:prod
pnpm --filter @aiwah/workshop build
pm2 startOrReload apps/workshop/deploy/ecosystem.config.cjs --update-env
pm2 save
