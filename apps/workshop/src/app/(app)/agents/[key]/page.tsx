import { StatusDot, Button, Card, CardBody, EmptyState, Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { Play, Power, PowerOff, Bot } from 'lucide-react';
import { enableAgentAction, disableAgentAction, triggerAgentAction } from './actions';

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

  const threadCount = Array.isArray(threads) ? threads.length : 0;

  return (
    <div className="space-y-4" data-testid="agent-detail-page">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <Link href="/agents" className="font-medium hover:text-[#3d4149] transition-colors" data-testid="link-back-agents">
            Agents
          </Link>
          <span className="text-[#d0d6e0]">/</span>
          <span className="truncate">{agent.name}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#E0F7F3] text-[#009E85]">
              <Bot size={12} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]" data-testid="agent-name">
                {agent.name}
              </h1>
              {agent.description && (
                <p className="mt-1.5 text-[12.5px] text-[#62666d]">{agent.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <form action={agent.enabled ? disableAgentAction.bind(null, key) : enableAgentAction.bind(null, key)}>
              <Button
                variant="outline"
                size="sm"
                type="submit"
                data-testid="btn-toggle-agent"
              >
                {agent.enabled ? <PowerOff size={12} /> : <Power size={12} />}
                {agent.enabled ? 'Disable' : 'Enable'}
              </Button>
            </form>
            <form action={triggerAgentAction.bind(null, key)}>
              <Button variant="primary" size="sm" type="submit" data-testid="btn-trigger-agent">
                <Play size={12} /> Trigger
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        {[
          { label: 'Status', value: agent.enabled ? 'Enabled' : 'Disabled' },
          { label: 'Model', value: agent.model ?? '—' },
          { label: 'Max steps', value: agent.maxSteps ?? 20 },
          { label: 'Threads', value: threadCount },
        ].map((s, i) => (
          <div key={s.label} className={`flex-1 px-4 py-3${i > 0 ? ' border-l border-[#e6e8eb]' : ''}`}>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{s.label}</p>
            <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums tracking-tight text-[#0f1011]">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Triggers + scopes */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Triggers */}
        <Card data-testid="card-triggers">
          <div className="border-b border-[#e6e8eb] px-4 py-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Triggers</h2>
          </div>
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {((agent.triggers ?? agent.defaultTriggers) ?? []).map((t: any, i: number) => (
                <span key={i} className="inline-flex items-center rounded bg-[#f3f4f5] px-1.5 py-0.5 text-[10.5px] font-medium text-[#62666d]">
                  {t.type}{t.mode ? `:${t.mode}` : ''}{t.eventType ? `:${t.eventType}` : ''}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Scopes */}
        {(agent.scopes ?? []).length > 0 && (
          <Card data-testid="card-scopes">
            <div className="border-b border-[#e6e8eb] px-4 py-2.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Scopes</h2>
            </div>
            <CardBody>
              <div className="flex flex-wrap gap-1.5">
                {(agent.scopes as string[]).map((s: string) => (
                  <span key={s} className="rounded bg-[#f3f4f5] px-1.5 py-0.5 font-mono text-[10.5px] text-[#62666d]">
                    {s}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Threads */}
      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Threads</h2>
          <p className="text-[11px] text-[#8a8f98]">&mdash; {threadCount} recent</p>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="card-threads">
          {!Array.isArray(threads) || threadCount === 0 ? (
            <EmptyState
              title="No threads yet"
              description="Trigger the agent to start a conversation."
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Thread</TH>
                    <TH>Channel</TH>
                    <TH>Messages</TH>
                    <TH>Last active</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {threads.map((t: any) => (
                    <TR key={t.id} data-testid={`row-thread-${t.id}`}>
                      <TD>
                        <Link
                          href={`/agents/${encodeURIComponent(key)}/threads/${t.id}`}
                          className="font-mono text-[12px] text-[#009E85] hover:text-[#007A66] transition-colors"
                          data-testid={`link-thread-${t.id}`}
                        >
                          {t.id.slice(0, 12)}…
                        </Link>
                      </TD>
                      <TD className="text-[12px] text-[#62666d]">{t.channelRef ?? '—'}</TD>
                      <TD className="text-[12px] tabular-nums">{(t.messages as any[])?.length ?? 0}</TD>
                      <TD className="text-[12px] text-[#8a8f98]">{formatDate(t.updatedAt)}</TD>
                      <TD>
                        <StatusDot
                          tone={t.status === 'active' ? 'success' : 'neutral'}
                          label={t.status}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </div>
      </div>
    </div>
  );
}
