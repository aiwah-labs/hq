# Workshop Deploy

## Prerequisites
- Ubuntu/Debian VPS
- DNS record for `workshop.aiwahlabs.com`
- Repo cloned to `/var/www/aiwah-hq`

## First-time setup
1. Copy environment values:
```bash
cp apps/workshop/deploy/.env.example .env
```
2. Edit `.env` for production credentials.
3. Run one-time setup:
```bash
bash apps/workshop/deploy/setup.sh
```
4. Issue TLS certificate:
```bash
sudo certbot --nginx -d workshop.aiwahlabs.com
```

## Regular deploy
```bash
bash apps/workshop/deploy/deploy.sh
```

## Local development (No Docker)

### Fast path (recommended)
```bash
pnpm db:local:bootstrap
pnpm dev:platform
```

Use `pnpm db:local:bootstrap` the first time on a machine. After that, `pnpm dev:platform`
is the daily command: it starts local Postgres, refreshes the generated env files, and runs
Workshop + API together.

Optional:
```bash
pnpm mcp
```

For realistic local sample data from production:
```bash
pnpm db:prod:doctor
pnpm db:prod:pull
```

This is one-way only: the script reads prod over SSH with `pg_dump`, overwrites the local dev DB,
then applies local migrations and ensures the bootstrap user still exists locally.

Generated local env files:
- `shared/db/.env`
- `apps/workshop/.env.local`
- `apps/api/.env.local`
- `apps/mcp/.env.local`

`pnpm api` and `pnpm mcp` now self-load env values from repo files, so they work from a fresh
shell without manually exporting `DATABASE_URL` or related vars.

### macOS
```bash
brew install postgresql@16
brew services start postgresql@16
createuser aiwah || true
createdb aiwah_dev -O aiwah || true
psql -d postgres -c "ALTER USER aiwah WITH PASSWORD 'aiwah_dev';"
export DATABASE_URL="postgresql://aiwah:aiwah_dev@localhost:5432/aiwah_dev?schema=public"
export SUPERADMIN_EMAIL_ALLOWLIST="aiwahlabs@gmail.com"
export SEED_EMAIL="aiwahlabs@gmail.com"
export SEED_PASSWORD="Tempura@2026"
pnpm db:local:env
pnpm db:migrate
pnpm db:seed
pnpm dev:platform
```

### Linux (Debian/Ubuntu)
```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE ROLE aiwah LOGIN PASSWORD 'aiwah_dev';" || true
sudo -u postgres psql -c "CREATE DATABASE aiwah_dev OWNER aiwah;" || true
export DATABASE_URL="postgresql://aiwah:aiwah_dev@localhost:5432/aiwah_dev?schema=public"
export SUPERADMIN_EMAIL_ALLOWLIST="aiwahlabs@gmail.com"
export SEED_EMAIL="aiwahlabs@gmail.com"
export SEED_PASSWORD="Tempura@2026"
pnpm db:local:env
pnpm db:migrate
pnpm db:seed
pnpm dev:platform
```

Stop local DB when idle:
- macOS: `brew services stop postgresql@16`
- Linux: `sudo systemctl stop postgresql`

## Rollback
```bash
git checkout <last-known-good-tag-or-sha>
pnpm install --frozen-lockfile
pnpm --filter @hq/workshop build
pm2 reload aiwah-workshop
```
