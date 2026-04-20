import { db } from '@hq/db';
import { getEnvWarnings, checkHealth, createServiceContext } from '@hq/services';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';

export const dynamic = 'force-dynamic';

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
        ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
      }`}
    >
      {ok ? 'OK' : 'FAIL'}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: 'error' | 'warn' }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
        severity === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
      }`}
    >
      {severity.toUpperCase()}
    </span>
  );
}

export default async function DiagnosticsPage() {
  await requirePermission(PERMISSIONS.adminSurface);

  const systemPrincipal = {
    kind: 'bot' as const,
    source: 'apikey' as const,
    botId: 'system',
    botName: 'System',
    apiKeyId: '',
    scopes: [] as string[],
    permissions: {} as any,
  };
  const ctx = createServiceContext(systemPrincipal);
  const [health, envWarnings, failedActions, failedWorkflows, failedAgents] = await Promise.all([
    checkHealth(ctx),
    Promise.resolve(getEnvWarnings()),
    db.actionExecution.findMany({ where: { status: 'FAILED' }, orderBy: { startedAt: 'desc' }, take: 10 }),
    db.workflowRun.findMany({ where: { status: 'FAILED' }, orderBy: { startedAt: 'desc' }, take: 10 }),
    db.agentRun.findMany({ where: { status: 'FAILED' }, orderBy: { startedAt: 'desc' }, take: 10 }),
  ]);

  return (
    <div className="space-y-4" data-testid="diagnostics-page">
      <div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Diagnostics</h1>
        <p className="mt-1 text-[13px] text-[#62666d]">
          System health, environment configuration, and recent failures.
        </p>
      </div>

      {/* Health */}
      <section data-testid="health-section">
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Health</h2>
        <div className="flex items-center gap-3 rounded-md border border-[#e6e8eb] bg-[#ffffff] px-4 py-3">
          <StatusBadge ok={health.ok} />
          <span className="text-[13px] text-[#0f1011]">
            {health.ok ? 'All critical systems operational' : 'One or more systems degraded'}
          </span>
          <span className="ml-auto font-mono text-[11px] text-[#62666d]">{health.timestamp}</span>
        </div>
        <ol className="mt-2 divide-y divide-[#e6e8eb] rounded-md border border-[#e6e8eb] bg-[#ffffff]">
          {health.dependencies.map((dep) => (
            <li key={dep.name} className="flex items-start gap-3 px-4 py-3" data-testid={`dep-${dep.name}`}>
              <StatusBadge ok={dep.ok} />
              <div>
                <span className="font-mono text-[13px] text-[#0f1011]">{dep.name}</span>
                {dep.message ? <p className="mt-0.5 text-[12px] text-[#62666d]">{dep.message}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Env warnings */}
      {envWarnings.length > 0 ? (
        <section data-testid="env-warnings-section">
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Environment Warnings</h2>
          <ol className="divide-y divide-[#e6e8eb] rounded-md border border-[#e6e8eb] bg-[#ffffff]">
            {envWarnings.map((w) => (
              <li key={w.key} className="flex items-start gap-3 px-4 py-3">
                <SeverityBadge severity={w.severity} />
                <div>
                  <span className="font-mono text-[13px] text-[#0f1011]">{w.key}</span>
                  <p className="mt-0.5 text-[12px] text-[#62666d]">{w.message}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Recent failures */}
      <section data-testid="recent-failures-section">
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Recent Failures</h2>
        <div className="space-y-4">
          {([
            { label: 'Actions', items: failedActions, getLabel: (r: any) => r.actionName, getDetail: (r: any) => r.error, getTime: (r: any) => r.startedAt },
            { label: 'Workflows', items: failedWorkflows, getLabel: (r: any) => r.workflowKey, getDetail: (r: any) => r.error, getTime: (r: any) => r.startedAt },
            { label: 'Agent Threads', items: failedAgents, getLabel: (r: any) => r.agentKey, getDetail: (r: any) => r.lastTurnStatus, getTime: (r: any) => r.updatedAt },
          ] as const).map(({ label, items, getLabel, getDetail, getTime }) => (
            <div key={label}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">{label}</h3>
              {items.length === 0 ? (
                <p className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-4 py-3 text-[13px] text-[#62666d]">No recent failures.</p>
              ) : (
                <ol className="divide-y divide-[#e6e8eb] rounded-md border border-[#e6e8eb] bg-[#ffffff]">
                  {items.map((row) => (
                    <li key={(row as any).id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 rounded bg-red-500/10 px-2 py-0.5 font-mono text-[11px] text-red-400">FAIL</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-[12px] text-[#0f1011]">{getLabel(row)}</span>
                          <span className="shrink-0 font-mono text-[11px] text-[#62666d]">{new Date(getTime(row)).toLocaleString()}</span>
                        </div>
                        {getDetail(row) ? <p className="mt-0.5 truncate text-[12px] text-[#62666d]">{getDetail(row)}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
