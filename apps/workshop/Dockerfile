# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/workshop/package.json apps/workshop/package.json
COPY shared/api-client/package.json shared/api-client/package.json
COPY shared/auth/package.json shared/auth/package.json
COPY shared/db/package.json shared/db/package.json
COPY shared/services/package.json shared/services/package.json

RUN pnpm install --frozen-lockfile

COPY apps/workshop apps/workshop
COPY shared/api-client shared/api-client
COPY shared/auth shared/auth
COPY shared/db shared/db
COPY shared/services shared/services

RUN pnpm --filter @aiwah/db exec prisma generate

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_INTERNAL_SHARED_SECRET
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_INTERNAL_SHARED_SECRET=${NEXT_PUBLIC_INTERNAL_SHARED_SECRET}

RUN pnpm --filter @aiwah/workshop build

FROM node:20-bookworm-slim AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3002

CMD ["pnpm", "--filter", "@aiwah/workshop", "start"]
