# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY shared/actions/package.json shared/actions/package.json
COPY shared/agents/package.json shared/agents/package.json
COPY shared/auth/package.json shared/auth/package.json
COPY shared/db/package.json shared/db/package.json
COPY shared/events/package.json shared/events/package.json
COPY shared/integrations/package.json shared/integrations/package.json
COPY shared/jobs/package.json shared/jobs/package.json
COPY shared/objects/package.json shared/objects/package.json
COPY shared/services/package.json shared/services/package.json
COPY shared/storage/package.json shared/storage/package.json
COPY shared/workflows/package.json shared/workflows/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY shared/actions shared/actions
COPY shared/agents shared/agents
COPY shared/auth shared/auth
COPY shared/db shared/db
RUN rm -f shared/db/.env
COPY shared/events shared/events
COPY shared/integrations shared/integrations
COPY shared/jobs shared/jobs
COPY shared/objects shared/objects
COPY shared/services shared/services
COPY shared/storage shared/storage
COPY shared/workflows shared/workflows

RUN pnpm --filter @aiwah/db exec prisma generate
# Skip tsc typecheck — tsx runs source directly at runtime
# RUN pnpm --filter @aiwah/api build

FROM node:20-bookworm-slim AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3003

CMD ["pnpm", "--filter", "@aiwah/api", "start"]
