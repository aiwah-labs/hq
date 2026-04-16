# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY shared/api-client/package.json shared/api-client/package.json

RUN pnpm install --frozen-lockfile

COPY apps/mcp apps/mcp
COPY shared/api-client shared/api-client

RUN pnpm --filter @aiwah/mcp build

FROM node:20-bookworm-slim AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app

COPY --from=builder /app /app

CMD ["pnpm", "--filter", "@aiwah/mcp", "start"]

