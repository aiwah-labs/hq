# Deploying HQ

## Environment variables

Copy `.env.example` to `.env` and configure:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `INTERNAL_APP_SHARED_SECRET` | Random secret for internal app communication |
| `SESSION_SECRET` | Random 32+ character string for session signing |
| `SUPERADMIN_EMAIL_ALLOWLIST` | Comma-separated list of superadmin email addresses |

## Docker Compose

```bash
cp .env.example .env
# Edit .env with your values
docker compose -f docker-compose.prod.yml up -d
```

## Manual deployment

### Database

```bash
pnpm db:migrate:prod
pnpm db:seed
```

### API

```bash
cd apps/api
pnpm build
node dist/server.js
```

### Workshop

```bash
cd apps/workshop
pnpm build
pnpm start
```

Use a process manager like PM2 to keep services running:

```bash
pm2 start dist/server.js --name hq-api
pm2 start "pnpm start" --name hq-workshop
```

## Updating

```bash
git pull origin main
pnpm install
pnpm db:migrate:prod
# Restart services
```
