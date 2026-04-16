import { Badge, Card, CardBody, Table, TableWrap, TBody, TD, TH, THead, TR, Button } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { Bot, Clock, Zap, Calendar, MessageSquare } from 'lucide-react';

function statusTone(enabled: boolean): 'success' | 'neutral' {
  return enabled ? 'success' : 'neutral';
}

function triggerIcon(type: string) {
  switch (type) {
    case 'message': return <MessageSquare className="h-3.5 w-3.5" />;
    case 'event': return <Zap className="h-3.5 w-3.5" />;
    case 'cron': return <Calendar className="h-3.5 w-3.5" />;
    default: return null;
  }
}

function formatTriggers(triggers: Array<{ type: string; mode?: string; eventType?: string; cronExpression?: string }>) {
  return triggers.map((t, i) => {
    let label = t.type;
    if (t.type === 'message') label = t.mode === 'mention' ? '@mention' : t.mode ?? 'message';
    if (t.type === 'event') label = t.eventType ?? 'event';
    if (t.type === 'cron') label = t.cronExpression ?? 'cron';
    return (
      <span key={i} className="inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[11px]">
        {triggerIcon(t.type)}
        {label}
      </span>
    );
  });
}

export default async function AgentsPage() {
  await requirePermission(ROUTE_PERMISSIONS.agents);
  const api = await getSessionApiClient();
  const agents = await api.get<any[]>('/v1/agents');

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-6 py-8" data-testid="agents-page">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold" data-testid="agents-title">
            Agents
          </h1>
          <p className="mt-1 text-[12px] text-[var(--app-muted)]">
            Code-defined agents that automate CRM, outreach, and platform tasks
          </p>
        </div>
      </header>

      <TableWrap data-testid="table-agents">
        <Table>
          <THead>
            <TR>
              <TH>Agent</TH>
              <TH>Triggers</TH>
              <TH>Threads</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {agents.length === 0 ? (
              <TR>
                <TD colSpan={4} className="py-10 text-center text-[var(--app-muted)]" data-testid="agents-empty">
                  No agents registered
                </TD>
              </TR>
            ) : (
              agents.map((agent: any) => (
                <TR key={agent.key} data-testid={`row-agent-${agent.key}`}>
                  <TD>
                    <Link
                      href={`/agents/${encodeURIComponent(agent.key)}`}
                      className="group flex items-center gap-2.5"
                      data-testid={`link-agent-${agent.key}`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-teal/10 text-brand-teal">
                        <Bot className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="text-[13px] font-medium group-hover:text-brand-teal">{agent.name}</span>
                        <span className="block text-[11px] text-[var(--app-muted)]">{agent.description}</span>
                      </span>
                    </Link>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {formatTriggers(agent.triggers ?? [])}
                    </div>
                  </TD>
                  <TD className="text-[12px] text-[var(--app-muted)]">
                    {agent.threadCount ?? 0}
                  </TD>
                  <TD>
                    <Badge tone={statusTone(agent.enabled)} data-testid={`badge-status-${agent.key}`}>
                      {agent.enabled ? 'ENABLED' : 'DISABLED'}
                    </Badge>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableWrap>
    </section>
  );
}
