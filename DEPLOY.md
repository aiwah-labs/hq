# Deploying HQ

HQ runs as three Docker containers: API, Workshop (UI), and Postgres.
One server, one compose file, 20 minutes.

## Prerequisites

- A VPS with Ubuntu 22.04+ (DigitalOcean, Hetzner, Vultr, etc.) — 2GB RAM minimum
- A domain name pointed at your server (A record)
- SSH access to root or sudo user

## Step 1 — Prepare the server

SSH in and run the setup script:

```bash
ssh root@your-server-ip
curl -fsSL https://raw.githubusercontent.com/aiwah-labs/hq/main/scripts/setup-server.sh | bash
```

This installs Docker, Docker Compose, and nginx with Certbot.

## Step 2 — Clone and configure

```bash
git clone https://github.com/aiwah-labs/hq /opt/hq
cd /opt/hq
cp .env.example .env.prod
```

Edit `.env.prod` with your values:

```bash
nano .env.prod
```

Required variables:

| Variable | Value |
|---|---|
| DATABASE_URL | `postgresql://hq:your-db-password@postgres:5432/hq_prod` |
| INTERNAL_APP_SHARED_SECRET | run: `openssl rand -hex 32` |
| SESSION_SECRET | run: `openssl rand -hex 32` |
| SUPERADMIN_EMAIL_ALLOWLIST | your@email.com |
| ANTHROPIC_API_KEY | your Anthropic API key |

## Step 3 — Deploy

```bash
cd /opt/hq
bash scripts/first-deploy.sh
```

This builds images, runs migrations, seeds the database, and starts all containers.

## Step 4 — Set up SSL and nginx

```bash
bash scripts/setup-nginx.sh your-domain.com
```

This configures nginx as a reverse proxy and issues a Let's Encrypt certificate.

Your Workshop is now live at `https://your-domain.com`.

## Updating

When a new version is available:

```bash
cd /opt/hq && bash scripts/deploy-prod.sh
```

## Health check

```bash
curl https://your-domain.com/api/v1/health
# {"status":"ok"}
```

## Logs

```bash
# All containers
docker compose -f docker-compose.prod.yml logs -f

# API only
bash scripts/logs.sh api tail

# Errors only
bash scripts/logs.sh api errors
```

## Troubleshooting

**Containers not starting**

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api
```

**Database connection error**

Check that `DATABASE_URL` in `.env.prod` uses `postgres` as the host (the Docker service name), not `localhost`.

**Port already in use**

Check what's using the port: `lsof -i :3002`
