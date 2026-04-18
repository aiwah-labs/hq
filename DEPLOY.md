# Deploying HQ

HQ runs as three Docker containers: API, Workshop (UI), and Postgres.
One server, one compose file, 20 minutes.

## Prerequisites

- A VPS with Ubuntu 22.04+ (DigitalOcean, Hetzner, Vultr, etc.) — 2GB RAM minimum
- A domain name pointed at your server (A record)
- SSH access to root or sudo user

---

## Step 1 — Prepare the server

```bash
ssh root@your-server-ip
curl -fsSL https://raw.githubusercontent.com/aiwah-labs/hq/main/scripts/setup-server.sh | bash
```

This installs Docker, Docker Compose, and nginx with Certbot.

---

## Step 2 — Clone and configure

```bash
git clone https://github.com/aiwah-labs/hq /opt/hq
cd /opt/hq
cp .env.example .env.prod
nano .env.prod
```

### Required env vars

| Variable | How to set |
|---|---|
| `DATABASE_URL` | `postgresql://hq:<POSTGRES_PASSWORD>@postgres:5432/hq_prod` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 16` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `INTERNAL_API_SECRET` | `openssl rand -hex 32` |
| `SUPERADMIN_EMAIL_ALLOWLIST` | `your@email.com` |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |

### Recommended env vars

| Variable | Purpose |
|---|---|
| `API_CORS_ORIGINS` | Comma-separated allowed origins — e.g. `https://hq.example.com` |
| `NEXT_PUBLIC_API_URL` | Public API URL — e.g. `https://hq.example.com/api` |

### Optional: SSO

To enable OIDC SSO (Google, Okta, Azure AD, etc.) set:

```
AUTH_OIDC_ISSUER=https://accounts.google.com
AUTH_OIDC_CLIENT_ID=your-client-id
AUTH_OIDC_CLIENT_SECRET=your-client-secret
AUTH_OIDC_ALLOWED_DOMAINS=yourcompany.com
AUTH_AUTO_PROVISION=true
AUTH_DEFAULT_ROLE=MEMBER
```

See [`docs/identity.md`](./docs/identity.md) and [`docs/sso.md`](./docs/sso.md) for full setup.

### Optional: MCP

To expose HQ actions to external agents via MCP:

```
MCP_BOT_API_KEY=<openssl rand -hex 32>
```

### Optional: File storage

To enable file attachments (S3/R2/MinIO):

```
STORAGE_BUCKET=my-bucket
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://your-r2-endpoint.r2.cloudflarestorage.com
```

---

## Step 3 — Deploy

```bash
cd /opt/hq
bash scripts/first-deploy.sh
```

This builds images, runs migrations, seeds the database, and starts all containers.

---

## Step 4 — SSL and nginx

```bash
bash scripts/setup-nginx.sh your-domain.com
```

Workshop is now live at `https://your-domain.com`. Log in with the email you set in `SUPERADMIN_EMAIL_ALLOWLIST`.

---

## Updating

```bash
cd /opt/hq && bash scripts/deploy-prod.sh
```

This pulls latest, rebuilds images, runs any new migrations, and restarts containers. **Migrations run before containers restart** — safe for zero-downtime deploys if your schema changes are backwards-compatible.

---

## Health check

```bash
curl https://your-domain.com/api/v1/runtime/health
# { "ok": true, "dependencies": [...] }
```

For a full diagnostics report (requires admin login):

```bash
curl -H "Cookie: <session>" https://your-domain.com/api/v1/runtime/diagnostics
```

Or open `/diagnostics` in Workshop.

---

## Backup and restore

### Postgres backup

```bash
# Dump
docker exec hq-postgres pg_dump -U hq hq_prod > hq_backup_$(date +%Y%m%d).sql

# Restore
cat hq_backup_20260416.sql | docker exec -i hq-postgres psql -U hq hq_prod
```

Automate with a daily cron:

```bash
0 3 * * * docker exec hq-postgres pg_dump -U hq hq_prod | gzip > /backups/hq_$(date +\%Y\%m\%d).sql.gz
```

### File storage

If you use S3/R2 for file attachments, enable versioning or cross-region replication on the bucket.

### Secrets backup

Store `.env.prod` in a secrets manager (1Password, Doppler, AWS Secrets Manager). Never commit it to git.

### Migration caution

Before running migrations on production:
1. Take a Postgres backup (above).
2. Check `pnpm db:migrate:prod --dry-run` if available.
3. Test migrations on a staging environment first.

---

## Logs

```bash
# All containers
docker compose -f docker-compose.prod.yml logs -f

# API only
bash scripts/logs.sh api tail

# Errors only
bash scripts/logs.sh api errors
```

---

## Troubleshooting

**Containers not starting**

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api
```

**Database connection error** — ensure `DATABASE_URL` uses `postgres` (the Docker service name) as host, not `localhost`.

**SESSION_SECRET missing** — diagnostics page or `GET /v1/runtime/health` will flag this.

**SSO not working** — check all three OIDC vars are set. Partial config causes a warning in diagnostics.

**Port already in use** — `lsof -i :3002`
