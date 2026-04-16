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

// Resolve temp/ at repo root (apps/api/src → ../../../.. = repo root)
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../../');
const LOG_DIR = resolve(REPO_ROOT, 'temp/logs');

function newLogFile(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // 2026-04-16T10-30-00
  return resolve(LOG_DIR, `api-${ts}.log`);
}

function parseCorsOrigins(): string[] {
  const raw = process.env.API_CORS_ORIGINS?.trim();
  if (!raw) return ['http://localhost:3002'];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function buildLogger() {
  const level = process.env.LOG_LEVEL ?? 'info';
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    mkdirSync(LOG_DIR, { recursive: true });
    const logFile = newLogFile();

    return {
      level,
      transport: {
        targets: [
          // Pretty output to terminal
          {
            target: 'pino-pretty',
            options: { colorize: true, ignore: 'pid,hostname', translateTime: 'HH:MM:ss' },
          },
          // Structured JSON to timestamped file — new file per process start
          // Analyse: cat temp/logs/api-*.log | jq 'select(.level >= 40)'
          // Pretty:  tail -f temp/logs/api-<ts>.log | npx pino-pretty
          {
            target: 'pino/file',
            options: { destination: logFile, append: false },
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
