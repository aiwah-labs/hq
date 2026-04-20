import { Badge } from '@/components/ui';
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
        isAssistant ? 'bg-[#E0F7F3] text-[#009E85]' :
        isTool ? 'bg-amber-500/10 text-amber-600' :
        isSystem ? 'bg-[#ffffff] text-[#62666d]' :
        'bg-[#ffffff] text-[#0f1011]'
      }`}>
        {isAssistant ? <Bot className="h-3.5 w-3.5" /> :
         isTool ? <Wrench className="h-3.5 w-3.5" /> :
         <User className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#62666d]">
          {role}
        </p>
        <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
          {content || <span className="italic text-[#62666d]">(empty)</span>}
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
    <div className="space-y-4" data-testid="thread-detail-page">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
          <Link href="/agents" className="font-medium hover:text-[#0f1011] transition-colors">Agents</Link>
          <span className="text-[#d0d6e0]">/</span>
          <Link
            href={`/agents/${encodeURIComponent(key)}`}
            className="hover:text-[#0f1011] transition-colors"
            data-testid="link-back-agent"
          >
            {key}
          </Link>
          <span className="text-[#d0d6e0]">/</span>
          <span>Thread</span>
        </div>
        <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]" data-testid="thread-title">
          Thread <span className="font-mono text-[15px] text-[#8a8f98]">{threadId.slice(0, 12)}…</span>
        </h1>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-[#62666d]">
          <Badge tone={thread.status === 'active' ? 'success' : 'neutral'}>{thread.status}</Badge>
          {thread.channelRef && <span>Channel: {thread.channelRef}</span>}
          <span>{messages.length} messages</span>
          {meta.totalCostUsd != null && <span>Cost: ${Number(meta.totalCostUsd).toFixed(4)}</span>}
          {meta.turnCount != null && <span>{meta.turnCount} turns</span>}
        </div>
      </div>

      {/* Summary */}
      {thread.summary && (
        <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="card-summary">
          <div className="border-b border-[#e6e8eb] px-4 py-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Compacted Summary</h2>
          </div>
          <div className="p-4">
            <p className="text-[12px] leading-relaxed text-[#62666d]">{thread.summary}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="overflow-hidden rounded-lg border border-[#e6e8eb] bg-white" data-testid="card-messages">
        <div className="border-b border-[#e6e8eb] px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Messages ({messages.length})</h2>
        </div>
        <div className="p-4">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#62666d]">No messages in this thread.</p>
          ) : (
            <div className="space-y-4">
              {messages.map((msg: any, i: number) => (
                <MessageBubble key={i} msg={msg} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
