# API Deploy

1. Copy env values:
```bash
cp apps/api/deploy/.env.example .env
```
2. Fill production secrets (`DATABASE_URL`, `API_KEY_PEPPER`, `INTERNAL_APP_SHARED_SECRET`).
3. Install deps and migrate:
```bash
pnpm install --frozen-lockfile
pnpm db:migrate:prod
pnpm --filter @hq/api build
```
4. Start with PM2:
```bash
pm2 start apps/api/deploy/ecosystem.config.cjs
```
