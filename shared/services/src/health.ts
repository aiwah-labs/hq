import type { ServiceContext } from './context.js';

export interface DependencyStatus {
  name: string;
  ok: boolean;
  message?: string;
}

export interface HealthReport {
  ok: boolean;
  timestamp: string;
  dependencies: DependencyStatus[];
}

export interface EnvWarning {
  key: string;
  severity: 'error' | 'warn';
  message: string;
}

export interface DiagnosticsReport {
  health: HealthReport;
  envWarnings: EnvWarning[];
  recentFailures: {
    actions: unknown[];
    workflows: unknown[];
    agents: unknown[];
  };
}

export async function checkHealth(ctx: ServiceContext): Promise<HealthReport> {
  const deps: DependencyStatus[] = [];

  try {
    await ctx.dbClient.$queryRaw`SELECT 1`;
    deps.push({ name: 'database', ok: true });
  } catch (err) {
    deps.push({ name: 'database', ok: false, message: err instanceof Error ? err.message : 'unreachable' });
  }

  const hasSecret = !!process.env.SESSION_SECRET;
  deps.push({ name: 'auth', ok: hasSecret, message: hasSecret ? undefined : 'SESSION_SECRET is not set' });

  const oidcIssuer = process.env.AUTH_OIDC_ISSUER;
  const oidcClientId = process.env.AUTH_OIDC_CLIENT_ID;
  const oidcClientSecret = process.env.AUTH_OIDC_CLIENT_SECRET;
  const ssoEnabled = !!(oidcIssuer || oidcClientId || oidcClientSecret);
  const ssoComplete = !!(oidcIssuer && oidcClientId && oidcClientSecret);
  if (ssoEnabled) {
    deps.push({
      name: 'sso',
      ok: ssoComplete,
      message: ssoComplete ? undefined : 'SSO partially configured — set AUTH_OIDC_ISSUER, AUTH_OIDC_CLIENT_ID, AUTH_OIDC_CLIENT_SECRET',
    });
  }

  const mcpSecret = process.env.MCP_BOT_API_KEY;
  deps.push({ name: 'mcp', ok: !!mcpSecret, message: mcpSecret ? undefined : 'MCP_BOT_API_KEY not set — MCP auth disabled' });

  const storageBucket = process.env.STORAGE_BUCKET;
  if (storageBucket) {
    const storageOk = !!(process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY);
    deps.push({ name: 'storage', ok: storageOk, message: storageOk ? undefined : 'STORAGE_BUCKET set but credentials missing' });
  }

  const criticalDeps = deps.filter((d) => d.name !== 'mcp' && d.name !== 'sso');
  const ok = criticalDeps.every((d) => d.ok);
  return { ok, timestamp: ctx.now().toISOString(), dependencies: deps };
}

export function getEnvWarnings(): EnvWarning[] {
  const warnings: EnvWarning[] = [];
  const required: [string, string][] = [
    ['DATABASE_URL', 'Database connection string'],
    ['SESSION_SECRET', 'Session signing secret'],
    ['INTERNAL_API_SECRET', 'Internal API shared secret'],
  ];
  for (const [key, desc] of required) {
    if (!process.env[key]) warnings.push({ key, severity: 'error', message: `${desc} is not set — required for production` });
  }
  const recommended: [string, string][] = [
    ['API_CORS_ORIGINS', 'CORS origin allowlist'],
    ['NEXT_PUBLIC_API_URL', 'API base URL for Workshop'],
  ];
  for (const [key, desc] of recommended) {
    if (!process.env[key]) warnings.push({ key, severity: 'warn', message: `${desc} is not set — recommended for production` });
  }
  return warnings;
}

export async function getRecentFailures(ctx: ServiceContext): Promise<DiagnosticsReport['recentFailures']> {
  const [actions, workflows, agents] = await Promise.all([
    ctx.dbClient.actionExecution.findMany({
      where: { status: 'FAILED' },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { id: true, actionName: true, actorType: true, actorId: true, error: true, startedAt: true, correlationId: true },
    }),
    ctx.dbClient.workflowRun.findMany({
      where: { status: 'failed' },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { id: true, workflowKey: true, triggerType: true, error: true, startedAt: true },
    }),
    ctx.dbClient.agentThread.findMany({
      where: { lastTurnStatus: 'failed' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, agentKey: true, lastTurnStatus: true, updatedAt: true },
    }),
  ]);
  return { actions, workflows, agents };
}

export async function getDiagnostics(ctx: ServiceContext): Promise<DiagnosticsReport> {
  const [health, recentFailures] = await Promise.all([checkHealth(ctx), getRecentFailures(ctx)]);
  return { health, envWarnings: getEnvWarnings(), recentFailures };
}
