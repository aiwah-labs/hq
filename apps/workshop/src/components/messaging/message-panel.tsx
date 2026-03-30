'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Info, MessageSquare, Users, Hash, ArrowLeft } from 'lucide-react';
import type { ThreadSummary, MessageData } from './messaging-workspace';
import { MessageList } from './message-list';
import { MessageComposer } from './message-composer';
import { ThreadDetailPanel } from './thread-detail-panel';
import { ThreadView } from './thread-view';
import { useActorCache } from './actor-cache';
import { useStreamingBuffer } from './use-streaming-buffer';
import { getApiBaseUrl, getInternalSecret } from '@/lib/api-url';

interface Props {
  thread: ThreadSummary;
  jumpToMessageId?: string;
  onThreadUpdated: (thread: ThreadSummary) => void;
}

type TypingActor = { actorType: string; actorId: string; actorName: string; since: number };

export function MessagePanel({ thread, jumpToMessageId, onThreadUpdated }: Props) {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [typingActors, setTypingActors] = useState<TypingActor[]>([]);
  const [threadParent, setThreadParent] = useState<MessageData | null>(null);

  const { textDeltaBufRef, reasoningDeltaBufRef, scheduleFlush, flushNow, applyDeltas } = useStreamingBuffer(setMessages);
  const handleViewThread = useCallback((msg: MessageData) => setThreadParent(msg), []);
  const handleCloseThread = useCallback(() => setThreadParent(null), []);
  const apiBase = getApiBaseUrl();
  const { selfId, getActorName } = useActorCache();

  // Fetch initial messages
  useEffect(() => {
    setIsLoading(true);
    fetch(`${apiBase}/v1/messaging/threads/${thread.id}/messages?limit=50&direction=before`, {
      credentials: 'include',
      headers: { 'x-internal-shared-secret': getInternalSecret() },
    })
      .then((r) => r.json())
      .then((data) => {
        const msgs = Array.isArray(data) ? data : [];
        setMessages(msgs);
        setHasOlder(msgs.length === 50);
        setIsLoading(false);

        if (msgs.length > 0) {
          const lastId = msgs[msgs.length - 1]?.id;
          if (lastId) {
            fetch(`${apiBase}/v1/messaging/threads/${thread.id}/read`, {
              method: 'POST', credentials: 'include',
              headers: { 'content-type': 'application/json', 'x-internal-shared-secret': getInternalSecret() },
              body: JSON.stringify({ messageId: lastId }),
            }).catch(() => {});
          }
        }
      })
      .catch(() => setIsLoading(false));
  }, [thread.id, apiBase]);

  // Load older messages
  const loadOlderMessages = useCallback(async () => {
    if (isLoadingOlder || !hasOlder || messages.length === 0) return;
    setIsLoadingOlder(true);
    const oldest = messages[0];
    if (!oldest) { setIsLoadingOlder(false); return; }

    try {
      const res = await fetch(
        `${apiBase}/v1/messaging/threads/${thread.id}/messages?limit=50&direction=before&cursor=${oldest.id}`,
        { credentials: 'include', headers: { 'x-internal-shared-secret': getInternalSecret() } }
      );
      const data = await res.json();
      const older = Array.isArray(data) ? data : [];
      setMessages((prev) => [...older, ...prev]);
      setHasOlder(older.length === 50);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [apiBase, thread.id, messages, isLoadingOlder, hasOlder]);

  // Handle SSE events dispatched from the workspace
  const handleSSEEvent = useCallback((event: CustomEvent) => {
    const e = event.detail;
    if (!e || e.threadId !== thread.id) return;

    switch (e.type) {
      case 'message.created':
        // Replies (parentMessageId set) go to thread view — never to main feed.
        // Also update replyCount on the parent message so the "X replies" button appears.
        if (e.message.parentMessageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === e.message.parentMessageId ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m
            )
          );
          break;
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === e.message.id)) return prev;

          if (e.message.senderType === 'AGENT' || e.message.senderType === 'BOT') {
            // Swap out the client-side pending placeholder in-place (same array index)
            // so the message order stays correct (user msg before agent response).
            const pendingIdx = prev.findIndex(
              (m) => m.id.startsWith('pending-agent-') && m.senderType === e.message.senderType && m.senderId === e.message.senderId
            );
            if (pendingIdx !== -1) {
              const next = [...prev];
              next[pendingIdx] = e.message;
              return next;
            }
          } else if (e.message.senderType === 'USER') {
            // Swap out the optimistic user message in-place — prevents ordering
            // issues caused by the fake agent placeholder already occupying the slot
            // after the optimistic entry.
            const optimisticIdx = prev.findIndex(
              (m) => m.id.startsWith('optimistic-') && m.senderType === 'USER' && m.senderId === e.message.senderId
            );
            if (optimisticIdx !== -1) {
              const next = [...prev];
              next[optimisticIdx] = e.message;
              return next;
            }
          }

          return [...prev, e.message];
        });
        fetch(`${apiBase}/v1/messaging/threads/${thread.id}/read`, {
          method: 'POST', credentials: 'include',
          headers: { 'content-type': 'application/json', 'x-internal-shared-secret': getInternalSecret() },
          body: JSON.stringify({ messageId: e.message.id }),
        }).catch(() => {});
        break;

      case 'message.updated':
        // Discard any buffered streaming deltas — the server's final state is authoritative.
        textDeltaBufRef.current.delete(e.message.id);
        reasoningDeltaBufRef.current.delete(e.message.id);
        setMessages((prev) =>
          prev.map((m) => (m.id === e.message.id ? { ...m, ...e.message } : m))
        );
        break;

      case 'message.deleted':
        setMessages((prev) =>
          prev.map((m) => m.id === e.messageId ? { ...m, isDeleted: true, content: '' } : m)
        );
        break;

      case 'message.streaming': {
        const part = e.part as { type: string; delta?: string; toolCallId?: string; toolName?: string; toolTitle?: string; args?: unknown; result?: unknown; isError?: boolean };

        if (part.type === 'text-delta') {
          textDeltaBufRef.current.set(e.messageId, (textDeltaBufRef.current.get(e.messageId) ?? '') + (part.delta ?? ''));
          scheduleFlush();
        } else if (part.type === 'reasoning-delta') {
          reasoningDeltaBufRef.current.set(e.messageId, (reasoningDeltaBufRef.current.get(e.messageId) ?? '') + (part.delta ?? ''));
          scheduleFlush();
        } else {
          // Tool calls/results are discrete — flush buffered text first, then apply tool event
          const { textDeltas, reasoningDeltas } = flushNow();
          setMessages((prev) => applyDeltas(prev.map((m) => {
            if (m.id !== e.messageId) return m;
            const blocks = [...(m.blocks as Array<Record<string, unknown>>)];
            const rd = reasoningDeltas.get(m.id);
            const td = textDeltas.get(m.id);
            if (rd) {
              const last = blocks[blocks.length - 1];
              if (last?.type === 'thinking') blocks[blocks.length - 1] = { ...last, text: (last.text as string) + rd };
              else blocks.push({ type: 'thinking', text: rd });
            }
            if (td) {
              const last = blocks[blocks.length - 1];
              if (last?.type === 'text') blocks[blocks.length - 1] = { ...last, text: (last.text as string) + td };
              else blocks.push({ type: 'text', text: td });
            }
            if (part.type === 'tool-call') {
              blocks.push({ type: 'tool_call', toolCallId: part.toolCallId, toolName: part.toolName, toolTitle: part.toolTitle, args: part.args });
            } else if (part.type === 'tool-result') {
              blocks.push({ type: 'tool_result', toolCallId: part.toolCallId, toolName: part.toolName, result: part.result, isError: part.isError ?? false });
            }
            // Remove this message from the remaining delta maps so applyDeltas doesn't double-apply
            textDeltas.delete(m.id);
            reasoningDeltas.delete(m.id);
            return { ...m, blocks, streamingStatus: 'streaming' };
          }), textDeltas, reasoningDeltas));
        }
        break;
      }

      case 'reaction.added': {
        const r = e.reaction as { emoji: string; actorType: string; actorId: string };
        // Skip self — already handled optimistically
        if (r.actorType === 'USER' && r.actorId === selfId) break;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== e.messageId) return m;
            const existing = m.reactions.find((x) => x.emoji === r.emoji);
            if (existing) {
              return { ...m, reactions: m.reactions.map((x) => x.emoji === r.emoji ? { ...x, count: x.count + 1 } : x) };
            }
            return { ...m, reactions: [...m.reactions, { emoji: r.emoji, count: 1, selfReacted: false, reactors: [] }] };
          })
        );
        break;
      }
      case 'reaction.removed': {
        // Skip self — already handled optimistically
        if (e.reactorType === 'USER' && e.reactorId === selfId) break;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== e.messageId) return m;
            return {
              ...m,
              reactions: m.reactions
                .map((x) => x.emoji === e.emoji ? { ...x, count: Math.max(0, x.count - 1) } : x)
                .filter((x) => x.count > 0),
            };
          })
        );
        break;
      }

      case 'typing.start':
        // Filter out self-typing
        if (selfId && e.actorType === 'USER' && e.actorId === selfId) break;
        setTypingActors((prev) => {
          const filtered = prev.filter((a) => !(a.actorType === e.actorType && a.actorId === e.actorId));
          return [...filtered, { actorType: e.actorType, actorId: e.actorId, actorName: e.actorName || getActorName(e.actorType, e.actorId), since: Date.now() }];
        });
        break;

      case 'typing.stop':
        setTypingActors((prev) =>
          prev.filter((a) => !(a.actorType === e.actorType && a.actorId === e.actorId))
        );
        break;
    }
  }, [thread.id, apiBase, selfId, getActorName, scheduleFlush, flushNow, applyDeltas]);

  // Auto-clear stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingActors((prev) => prev.filter((a) => now - a.since < 5000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for SSE events forwarded via custom DOM events
  useEffect(() => {
    window.addEventListener('messaging-sse', handleSSEEvent as EventListener);
    return () => window.removeEventListener('messaging-sse', handleSSEEvent as EventListener);
  }, [handleSSEEvent]);

  const handleSendMessage = useCallback(async (content: string, blocks?: unknown[], attachmentIds?: string[]) => {
    if (!content.trim() && !attachmentIds?.length) return;

    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: MessageData = {
      id: optimisticId,
      threadId: thread.id,
      senderType: 'USER',
      senderId: selfId ?? 'me',
      content,
      contentType: 'TEXT',
      blocks: blocks ?? [],
      isEdited: false,
      isDeleted: false,
      parentMessageId: null,
      replyCount: 0,
      sequenceNumber: String(Date.now()),
      streamingStatus: null,
      metadata: {},
      attachments: [],
      reactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // If an agent is already a participant, insert a fake streaming placeholder in the
    // same setState so React renders user message + agent dots in a single frame.
    // This eliminates the ~300ms gap between send and server-created placeholder.
    const agentParticipant = thread.participants.find(
      (p) => p.actorType === 'AGENT' || p.actorType === 'BOT',
    );
    const pendingPlaceholderId = agentParticipant ? `pending-agent-${Date.now()}` : null;
    const pendingPlaceholder: MessageData | null = agentParticipant && pendingPlaceholderId
      ? {
          id: pendingPlaceholderId,
          threadId: thread.id,
          senderType: agentParticipant.actorType,
          senderId: agentParticipant.actorId,
          content: '',
          contentType: 'TEXT',
          blocks: [],
          isEdited: false,
          isDeleted: false,
          parentMessageId: null,
          replyCount: 0,
          sequenceNumber: String(Date.now() + 1),
          streamingStatus: 'streaming',
          metadata: {},
          attachments: [],
          reactions: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null;

    setMessages((prev) => pendingPlaceholder ? [...prev, optimistic, pendingPlaceholder] : [...prev, optimistic]);

    try {
      const res = await fetch(`${apiBase}/v1/messaging/threads/${thread.id}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-internal-shared-secret': getInternalSecret(),
        },
        body: JSON.stringify({ content, blocks, attachmentIds }),
      });
      const real = await res.json();
      setMessages((prev) => {
        const realExists = prev.some((m) => m.id === real.id);
        if (realExists) return prev.filter((m) => m.id !== optimisticId);
        return prev.map((m) => (m.id === optimisticId ? real : m));
      });
    } catch {
      setMessages((prev) =>
        prev.filter((m) => m.id !== optimisticId && m.id !== pendingPlaceholderId)
      );
    }
  }, [thread.id, thread.participants, apiBase, selfId]);

  const handleReact = useCallback(async (messageId: string, emoji: string, alreadyReacted: boolean) => {
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.reactions.find((r) => r.emoji === emoji);
        if (alreadyReacted) {
          return {
            ...m,
            reactions: existing
              ? existing.count <= 1
                ? m.reactions.filter((r) => r.emoji !== emoji)
                : m.reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, selfReacted: false } : r)
              : m.reactions,
          };
        } else {
          return {
            ...m,
            reactions: existing
              ? m.reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, selfReacted: true } : r)
              : [...m.reactions, { emoji, count: 1, selfReacted: true, reactors: [{ type: 'USER', id: 'me' }] }],
          };
        }
      })
    );

    if (alreadyReacted) {
      await fetch(`${apiBase}/v1/messaging/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
        method: 'DELETE', credentials: 'include',
        headers: { 'x-internal-shared-secret': getInternalSecret() },
      });
    } else {
      await fetch(`${apiBase}/v1/messaging/messages/${messageId}/reactions`, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-internal-shared-secret': getInternalSecret() },
        body: JSON.stringify({ emoji }),
      });
    }
  }, [apiBase]);

  const handleEditMessage = useCallback(async (messageId: string, content: string) => {
    const res = await fetch(`${apiBase}/v1/messaging/messages/${messageId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-internal-shared-secret': getInternalSecret() },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...updated } : m)));
    }
  }, [apiBase]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    await fetch(`${apiBase}/v1/messaging/messages/${messageId}`, {
      method: 'DELETE', credentials: 'include',
      headers: { 'x-internal-shared-secret': getInternalSecret() },
    });
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, isDeleted: true, content: '' } : m));
  }, [apiBase]);

  // Resolve thread name for DMs
  let threadName = thread.name ?? '';
  if (!threadName && thread.type === 'DM') {
    const other = thread.participants?.find(
      (p) => !(p.actorType === 'USER' && p.actorId === selfId)
    );
    threadName = other ? getActorName(other.actorType, other.actorId) : 'Direct Message';
  }
  if (!threadName) threadName = thread.type === 'CHANNEL' ? 'Unnamed Channel' : 'Group';

  function ThreadHeaderIcon() {
    if (thread.type === 'DM') {
      const initial = threadName.charAt(0).toUpperCase();
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal/10 text-[12px] font-semibold text-brand-teal ring-1 ring-brand-teal/20">
          {initial}
        </div>
      );
    }
    if (thread.type === 'CHANNEL') {
      return <span className="text-[16px] font-semibold text-[var(--app-muted)]">#</span>;
    }
    return <Users className="h-[18px] w-[18px] text-[var(--app-muted)]" />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-[var(--app-bg)]" data-testid="message-panel">
      {/* Panel header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-divider px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              // Hacky way to dispatch deselect thread event, 
              // the parent component will handle this
              window.dispatchEvent(new CustomEvent('messaging-deselect-thread'));
            }}
            className="flex h-7 w-7 shrink-0 md:hidden items-center justify-center rounded-[6px] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)] mr-1"
            aria-label="Back to threads"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="shrink-0"><ThreadHeaderIcon /></div>
          <div className="min-w-0">
            <h3 className="font-display text-[14px] font-semibold leading-tight tracking-tight truncate">{threadName}</h3>
            {thread.description ? (
              <p className="text-[11px] text-[var(--app-muted)] truncate">{thread.description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowDetailPanel((v) => !v)}
            aria-label="Thread details"
            data-testid="thread-detail-btn"
            className={`flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors ${showDetailPanel ? 'bg-brand-teal/10 text-brand-teal' : 'text-[var(--app-muted)] hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]'}`}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Thread view OR Messages + composer */}
        {threadParent ? (
          <ThreadView
            parentMessage={threadParent}
            threadId={thread.id}
            onBack={handleCloseThread}
            onReact={handleReact}
            onEdit={handleEditMessage}
            onDelete={handleDeleteMessage}
          />
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <MessageList
              messages={messages}
              isLoading={isLoading}
              hasOlder={hasOlder}
              isLoadingOlder={isLoadingOlder}
              onLoadOlder={loadOlderMessages}
              jumpToMessageId={jumpToMessageId}
              typingActors={typingActors}
              onReact={handleReact}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
              onViewThread={handleViewThread}
            />

            <MessageComposer
              threadId={thread.id}
              onSend={handleSendMessage}
            />
          </div>
        )}

        {/* Detail panel */}
        {showDetailPanel ? (
          <ThreadDetailPanel
            thread={thread}
            onClose={() => setShowDetailPanel(false)}
            onThreadUpdated={onThreadUpdated}
          />
        ) : null}
      </div>
    </div>
  );
}
