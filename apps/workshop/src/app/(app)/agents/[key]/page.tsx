import { Badge, Button, Card, CardBody, CardHeader, Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { ArrowLeft, Play, Power, PowerOff, Clock, Zap, MessageSquare, Calendar, Bot } from 'lucide-react';
import { enableAgentAction, disableAgentAction, triggerAgentAction } from './actions';
import { actionRegistry, serializeAction } from '@hq/actions';

function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function AgentDetailPage({ params }: { params: Promise<{ key: string }> }) {
  await requirePermission(ROUTE_PERMISSIONS.agents);
  const { key } = await params;
  const api = await getSessionApiClient();

  const agent = await api.get<any>(`/v1/agents/${encodeURIComponent(key)}`);
  const threadsRes = await api.get<any>(`/v1/agents/${encodeURIComponent(key)}/threads?limit=20`);
  const threads = threadsRes.data ?? threadsRes ?? [];

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-6 py-8" data-testid="agent-detail-page">
      {/* Header */}
      <header>
        <Link href="/agents" className="mb-3 inline-flex items-center gap-1 text-[12px] text-[var(--app-muted)] hover:text-[var(--app-fg)]" data-testid="link-back-agents">
          <ArrowLeft className="h-3.5 w-3.5" /> All Agents
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-[18px] font-semibold" data-testid="agent-name">{agent.name}</h1>
              <p className="text-[12px] text-[var(--app-muted)]">{agent.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <form action={agent.enabled ? disableAgentAction.bind(null, key) : enableAgentAction.bind(null, key)}>
              <Button
                variant={agent.enabled ? 'ghost' : 'primary'}
                size="sm"
                type="submit"
                data-testid="btn-toggle-agent"
                aria-label={agent.enabled ? 'Disable agent' : 'Enable agent'}
              >
                {agent.enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                {agent.enabled ? 'Disable' : 'Enable'}
              </Button>
            </form>
            <form action={triggerAgentAction.bind(null, key)}>
              <Button variant="secondary" size="sm" type="submit" data-testid="btn-trigger-agent" aria-label="Trigger agent manually">
                <Play className="h-3.5 w-3.5" /> Trigger
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Config */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-model">
          <CardBody>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-muted)]">Model</p>
            <p className="mt-1 font-mono text-[13px]">{agent.model}</p>
          </CardBody>
        </Card>
        <Card data-testid="card-max-steps">
          <CardBody>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-muted)]">Max Steps</p>
            <p className="mt-1 text-[13px]">{agent.maxSteps ?? 20}</p>
          </CardBody>
        </Card>
        <Card data-testid="card-triggers">
          <CardBody>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-muted)]">Triggers</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(agent.triggers ?? []).map((t: any, i: number) => (
                <Badge key={i} tone="teal">{t.type}{t.mode ? `:${t.mode}` : ''}{t.eventType ? `:${t.eventType}` : ''}</Badge>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card data-testid="card-status">
          <CardBody>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-muted)]">Status</p>
            <Badge tone={agent.enabled ? 'success' : 'neutral'} className="mt-1">
              {agent.enabled ? 'ENABLED' : 'DISABLED'}
            </Badge>
          </CardBody>
        </Card>
      </div>

      {/* Capabilities */}
      {agent.resolvedActions?.length > 0 && (() => {
        const rows = (agent.resolvedActions as string[]).map((name) => {
          const action = actionRegistry.get(name);
          return action ? serializeAction(action) : null;
        }).filter(Boolean) as ReturnType<typeof serializeAction>[];
        const reads = Array.from(new Set(rows.flatMap((r) => r.objects?.reads ?? [])));
        const writes = Array.from(new Set(rows.flatMap((r) => r.objects?.writes ?? [])));
        const deletes = Array.from(new Set(rows.flatMap((r) => r.objects?.deletes ?? [])));
        const riskCounts = { low: 0, medium: 0, high: 0 };
        rows.forEach((r) => { riskCounts[r.risk]++; });
        const gated = rows.filter((r) => r.approval?.required);
        return (
          <Card data-testid="card-capabilities">
            <CardHeader>Capabilities ({rows.length} actions)</CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-muted)]">Reads</p>
                  <p className="mt-1 text-[13px]">{reads.join(', ') || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-muted)]">Writes</p>
                  <p className="mt-1 text-[13px]">{writes.join(', ') || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-muted)]">Deletes</p>
                  <p className="mt-1 text-[13px]">{deletes.join(', ') || '—'}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                <Badge tone="neutral">low: {riskCounts.low}</Badge>
                <Badge tone="teal">medium: {riskCounts.medium}</Badge>
                <Badge tone="success">high: {riskCounts.high}</Badge>
                {gated.length > 0 && <Badge tone="neutral">approval required: {gated.length}</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {rows.map((r) => (
                  <span
                    key={r.name}
                    title={`${r.risk}${r.approval?.required ? ' · approval required' : ''}`}
                    className="rounded-full border border-[var(--app-border)] bg-[var(--app-bg-elevated)] px-2.5 py-0.5 font-mono text-[11px]"
                  >
                    {r.name}
                    {r.approval?.required ? ' ·⚑' : ''}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>
        );
      })()}

      {/* Threads */}
      <Card data-testid="card-threads">
        <CardHeader>Threads ({Array.isArray(threads) ? threads.length : 0})</CardHeader>
        <CardBody className="p-0">
          {(!Array.isArray(threads) || threads.length === 0) ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--app-muted)]">No threads yet. Trigger the agent to start a conversation.</p>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Thread ID</TH>
                    <TH>Channel</TH>
                    <TH>Messages</TH>
                    <TH>Last Active</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {threads.map((t: any) => (
                    <TR key={t.id} data-testid={`row-thread-${t.id}`}>
                      <TD>
                        <Link
                          href={`/agents/${encodeURIComponent(key)}/threads/${t.id}`}
                          className="font-mono text-[12px] text-brand-teal hover:underline"
                          data-testid={`link-thread-${t.id}`}
                        >
                          {t.id.slice(0, 12)}…
                        </Link>
                      </TD>
                      <TD className="text-[12px] text-[var(--app-muted)]">{t.channelRef ?? '—'}</TD>
                      <TD className="text-[12px]">{(t.messages as any[])?.length ?? 0}</TD>
                      <TD className="text-[12px] text-[var(--app-muted)]">{formatDate(t.updatedAt)}</TD>
                      <TD><Badge tone={t.status === 'active' ? 'success' : 'neutral'}>{t.status}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
