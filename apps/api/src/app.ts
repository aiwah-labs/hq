import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { db } from '@hq/db';
import { getBoss, stopBoss } from '@hq/jobs';
import { ApiError, inferCodeFromStatus, inferStatusFromError } from './lib/errors';
import { registerV1Routes } from './routes/v1';
import { startSSEListener, stopSSEListener } from './lib/sse';
import { registerAllWorkers } from './workers/index';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Auto-register demo actions, agents, and workflows at import time
import '@hq/actions';
import '@hq/agents';
import '@hq/workflows';

// Resolve temp/ at repo root (apps/api → ../../temp)
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../../');
const LOG_FILE = resolve(REPO_ROOT, 'temp/api.log');

function parseCorsOrigins(): string[] {
  const raw = process.env.API_CORS_ORIGINS?.trim();
  if (!raw) return ['http://localhost:3002'];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function buildLogger() {
  const level = process.env.LOG_LEVEL ?? 'info';
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // Ensure temp/ exists
    mkdirSync(resolve(REPO_ROOT, 'temp'), { recursive: true });

    return {
      level,
      transport: {
        targets: [
          // Pretty output to terminal
          {
            target: 'pino-pretty',
            options: { colorize: true, ignore: 'pid,hostname', translateTime: 'HH:MM:ss' },
          },
          // JSON to file for analysis: tail -f temp/api.log | pino-pretty
          {
            target: 'pino/file',
            options: { destination: LOG_FILE, append: true },
          },
        ],
      },
    };
  }

  return { level };
}

export async function buildApiServer() {
  const app = Fastify({ logger: buildLogger() });

  await app.register(cors, {
    origin: parseCorsOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: Number(process.env.API_RATE_LIMIT_RPM ?? 600),
    timeWindow: '1 minute',
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = inferStatusFromError(error);
    const code = error instanceof ApiError ? error.code : inferCodeFromStatus(statusCode);
    request.log.error({ err: error, requestId: request.id }, 'request failed');
    return reply.code(statusCode).send({
      error: {
        code,
        message: error instanceof Error ? error.message : 'Unexpected error.',
        requestId: request.id,
        details: error instanceof ApiError ? error.details : undefined,
      },
    });
  });

  // ─── Health ───────────────────────────────────────────────────────────────

  app.get('/health', async (_request, reply) => {
    const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

    // DB check
    const dbStart = Date.now();
    try {
      await db.$queryRaw`SELECT 1`;
      checks.db = { ok: true, latencyMs: Date.now() - dbStart };
    } catch (err) {
      checks.db = { ok: false, error: err instanceof Error ? err.message : 'unknown' };
    }

    // Job queue check
    const queueStart = Date.now();
    try {
      await getBoss();
      checks.queue = { ok: true, latencyMs: Date.now() - queueStart };
    } catch (err) {
      checks.queue = { ok: false, error: err instanceof Error ? err.message : 'unknown' };
    }

    const allOk = Object.values(checks).every((c) => c.ok);

    return reply.code(allOk ? 200 : 503).send({
      ok: allOk,
      service: 'hq-api',
      version: process.env.npm_package_version ?? 'unknown',
      time: new Date().toISOString(),
      checks,
    });
  });

  // ─── V1 Routes ────────────────────────────────────────────────────────────

  await registerV1Routes(app);

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  app.addHook('onReady', async () => {
    await getBoss();
    await registerAllWorkers();
    await startSSEListener();
    app.log.info('API ready');
  });

  app.addHook('onClose', async () => {
    await stopSSEListener();
    await stopBoss();
  });

  return app;
}
