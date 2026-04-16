import { Badge, Card, CardBody, CardHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import Link from 'next/link';
import { ArrowLeft, Bot, User, Wrench } from 'lucide-react';

function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function MessageBubble({ msg, index }: { msg: any; index: number }) {
  const role = msg.role as string;
  const isAssistant = role === 'assistant';
  const isTool = role === 'tool';
  const isSystem = role === 'system';

  const content = typeof msg.content === 'string'
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content.map((p: any) => {
          if (p.type === 'text') return p.text;
          if (p.type === 'tool-call') return `[Tool call: ${p.toolName}(${JSON.stringify(p.input).slice(0, 100)})]`;
          if (p.type === 'tool-result') return `[Tool result: ${JSON.stringify(p.output).slice(0, 200)}]`;
          return JSON.stringify(p).slice(0, 200);
        }).join('\n')
      : JSON.stringify(msg.content).slice(0, 500);

  return (
    <div
      className={`flex gap-3 ${isAssistant ? '' : ''} ${isSystem ? 'opacity-60' : ''}`}
      data-testid={`msg-${index}`}
    >
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] ${
        isAssistant ? 'bg-brand-teal/10 text-brand-teal' :
        isTool ? 'bg-amber-500/10 text-amber-600' :
        isSystem ? 'bg-[var(--app-bg-elevated)] text-[var(--app-muted)]' :
        'bg-[var(--app-bg-elevated)] text-[var(--app-fg)]'
      }`}>
        {isAssistant ? <Bot className="h-3.5 w-3.5" /> :
         isTool ? <Wrench className="h-3.5 w-3.5" /> :
         <User className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-muted)]">
          {role}
        </p>
        <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
          {content || <span className="italic text-[var(--app-muted)]">(empty)</span>}
        </div>
      </div>
    </div>
  );
}

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ key: string; threadId: string }>;
}) {
  await requirePermission(ROUTE_PERMISSIONS.agents);
  const { key, threadId } = await params;
  const api = await getSessionApiClient();

  const thread = await api.get<any>(`/v1/agents/${encodeURIComponent(key)}/threads/${threadId}`);
  const messages = (thread.messages ?? []) as any[];
  const meta = (thread.metadata ?? {}) as Record<string, any>;

  return (
    <section className="mx-auto max-w-4xl space-y-6 px-6 py-8" data-testid="thread-detail-page">
      <header>
        <Link
          href={`/agents/${encodeURIComponent(key)}`}
          className="mb-3 inline-flex items-center gap-1 text-[12px] text-[var(--app-muted)] hover:text-[var(--app-fg)]"
          data-testid="link-back-agent"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to agent
        </Link>
        <h1 className="text-[18px] font-semibold" data-testid="thread-title">
          Thread {threadId.slice(0, 12)}…
        </h1>
        <div className="mt-1 flex items-center gap-3 text-[12px] text-[var(--app-muted)]">
          <Badge tone={thread.status === 'active' ? 'success' : 'neutral'}>{thread.status}</Badge>
          {thread.channelRef && <span>Channel: {thread.channelRef}</span>}
          <span>{messages.length} messages</span>
          {meta.totalCostUsd != null && <span>Cost: ${Number(meta.totalCostUsd).toFixed(4)}</span>}
          {meta.turnCount != null && <span>{meta.turnCount} turns</span>}
        </div>
      </header>

      {/* Summary */}
      {thread.summary && (
        <Card data-testid="card-summary">
          <CardHeader>Compacted Summary</CardHeader>
          <CardBody>
            <p className="text-[12px] leading-relaxed text-[var(--app-muted)]">{thread.summary}</p>
          </CardBody>
        </Card>
      )}

      {/* Messages */}
      <Card data-testid="card-messages">
        <CardHeader>Messages ({messages.length})</CardHeader>
        <CardBody>
          {messages.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--app-muted)]">No messages in this thread.</p>
          ) : (
            <div className="space-y-4">
              {messages.map((msg: any, i: number) => (
                <MessageBubble key={i} msg={msg} index={i} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
