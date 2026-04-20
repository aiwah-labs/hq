import { StatusDot, EmptyState } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { Bot, Calendar, MessageSquare, Zap } from 'lucide-react';

function triggerLabel(t: { type: string; mode?: string; eventType?: string; cronExpression?: string }): string {
  if (t.type === 'message') return t.mode === 'mention' ? '@mention' : (t.mode ?? 'message');
  if (t.type === 'event') return t.eventType ?? 'event';
  if (t.type === 'cron') return t.cronExpression ?? 'cron';
  return t.type;
}

function TriggerChip({ t }: { t: { type: string; mode?: string; eventType?: string; cronExpression?: string } }) {
  const icon =
    t.type === 'message' ? <MessageSquare size={10} /> :
    t.type === 'event' ? <Zap size={10} /> :
    t.type === 'cron' ? <Calendar size={10} /> :
    null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-[#f3f4f5] px-1.5 py-0.5 text-[10.5px] font-medium text-[#62666d]">
      {icon}
      {triggerLabel(t)}
    </span>
  );
}

export default async function AgentsPage() {
  await requirePermission(ROUTE_PERMISSIONS.agents);
  const api = await getSessionApiClient();
  const agents = await api.get<any[]>('/v1/agents');

  const enabledCount = agents.filter((a) => a.enabled).length;

  return (
    <div className="space-y-4" data-testid="agents-page">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <span className="font-medium">Home</span>
          <span className="text-[#d0d6e0]">/</span>
          <span>Agents</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]" data-testid="agents-title">
          Agents
        </h1>
        <p className="mt-2 text-[12.5px] text-[#62666d]">
          Code-defined agents that automate CRM, outreach, and platform tasks.
        </p>
      </div>

      {/* Stat row */}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white">
        {[
          { label: 'Agents', value: agents.length, sub: 'registered' },
          { label: 'Enabled', value: enabledCount, sub: `${agents.length - enabledCount} disabled` },
        ].map((s, i) => (
          <div key={s.label} className={`flex-1 px-4 py-3${i > 0 ? ' border-l border-[#e6e8eb]' : ''}`}>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">{s.label}</p>
            <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums tracking-tight text-[#0f1011]">{s.value}</p>
            <p className="mt-1.5 text-[11px] text-[#8a8f98]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Agent list */}
      <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="table-agents">
        {/* Column header */}
        <div className="grid grid-cols-[1fr_auto_80px_100px] items-center border-b border-[#e6e8eb] bg-[#fafbfb] px-4">
          <div className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Agent</div>
          <div className="h-9 flex items-center text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98] px-3">Triggers</div>
          <div className="h-9 flex items-center justify-end text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Runs</div>
          <div className="h-9 flex items-center justify-end text-[11px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Status</div>
        </div>

        {agents.length === 0 ? (
          <EmptyState
            icon={<Bot size={14} />}
            title="No agents registered"
            description="Define agents in your codebase to automate tasks."
            data-testid="agents-empty"
          />
        ) : (
          <div className="divide-y divide-[#eff0f2]">
            {agents.map((agent: any) => (
              <Link
                key={agent.key}
                href={`/agents/${encodeURIComponent(agent.key)}`}
                className="group grid grid-cols-[1fr_auto_80px_100px] items-center px-4 h-11 hover:bg-[#fafbfb] transition-colors duration-100"
                data-testid={`row-agent-${agent.key}`}
              >
                {/* Name + description */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#E0F7F3] text-[#009E85]">
                    <Bot size={12} />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-[#0f1011] truncate" data-testid={`link-agent-${agent.key}`}>
                      {agent.name}
                    </span>
                    {agent.description && (
                      <span className="block text-[11px] text-[#8a8f98] truncate">{agent.description}</span>
                    )}
                  </div>
                </div>

                {/* Trigger chips */}
                <div className="flex items-center gap-1 px-3">
                  {(agent.triggers ?? []).map((t: any, i: number) => (
                    <TriggerChip key={i} t={t} />
                  ))}
                </div>

                {/* Run count */}
                <div className="text-right text-[12px] tabular-nums text-[#62666d]">
                  {agent.runCount ?? 0}
                </div>

                {/* Status — dot + text, never filled pill */}
                <div className="flex justify-end" data-testid={`badge-status-${agent.key}`}>
                  <StatusDot
                    tone={agent.enabled ? 'success' : 'neutral'}
                    label={agent.enabled ? 'Enabled' : 'Disabled'}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
