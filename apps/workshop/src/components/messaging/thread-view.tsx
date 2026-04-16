'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useActorCache } from './actor-cache';
import { MessageItem } from './message-item';
import { useStreamingBuffer } from './use-streaming-buffer';
import type { MessageData } from './messaging-workspace';
import { getApiBaseUrl, getInternalSecret } from '@/lib/api-url';

interface Props {
  parentMessage: MessageData;
  threadId: string;
  onBack: () => void;
  onReact: (messageId: string, emoji: string, alreadyReacted: boolean) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
}

export function ThreadView({ parentMessage, threadId, onBack, onReact, onEdit, onDelete }: Props) {
  const [replies, setReplies] = useState<MessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState('');
  const apiBase = getApiBaseUrl();
  const { selfId } = useActorCache();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch replies using the dedicated replies endpoint
  useEffect(() => {
    setIsLoading(true);
    fetch(`${apiBase}/v1/messaging/messages/${parentMessage.id}/replies?limit=100`, {
      credentials: 'include',
      headers: { 'x-internal-shared-secret': getInternalSecret() },
    })
      .then((r) => r.json())
      .then((data) => {
        setReplies(Array.isArray(data) ? data : []);
        setIsLoading(false);
        bottomRef.current?.scrollIntoView();
      })
      .catch(() => setIsLoading(false));
  }, [parentMessage.id, apiBase]);

  const { textDeltaBufRef, reasoningDeltaBufRef, scheduleFlush, flushNow, applyDeltas } = useStreamingBuffer(setReplies);

  // Listen for SSE events relevant to this thread's replies
  useEffect(() => {
    const handleSSE = (event: Event) => {
      const e = (event as CustomEvent).detail;
      if (!e || e.threadId !== threadId) return;

      if (e.type === 'message.created' && e.message.parentMessageId === parentMessage.id) {
        setReplies((prev) => {
          if (prev.some((m) => m.id === e.message.id)) return prev;
          return [...prev, e.message];
        });
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else if (e.type === 'message.updated') {
        textDeltaBufRef.current.delete(e.message.id);
        reasoningDeltaBufRef.current.delete(e.message.id);
        setReplies((prev) => prev.map((m) => m.id === e.message.id ? { ...m, ...e.message } : m));
      } else if (e.type === 'message.streaming') {
        const part = e.part as { type: string; delta?: string; toolCallId?: string; toolName?: string; toolTitle?: string; args?: unknown; result?: unknown; isError?: boolean };
        if (part.type === 'text-delta') {
          textDeltaBufRef.current.set(e.messageId, (textDeltaBufRef.current.get(e.messageId) ?? '') + (part.delta ?? ''));
          scheduleFlush();
        } else if (part.type === 'reasoning-delta') {
          reasoningDeltaBufRef.current.set(e.messageId, (reasoningDeltaBufRef.current.get(e.messageId) ?? '') + (part.delta ?? ''));
          scheduleFlush();
        } else {
          // Tool calls/results: flush buffered text first, then apply tool event
          const { textDeltas, reasoningDeltas } = flushNow();
          setReplies((prev) => applyDeltas(prev.map((m) => {
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
            textDeltas.delete(m.id);
            reasoningDeltas.delete(m.id);
            return { ...m, blocks, streamingStatus: 'streaming' };
          }), textDeltas, reasoningDeltas));
        }
      }
    };
    window.addEventListener('messaging-sse', handleSSE);
    return () => window.removeEventListener('messaging-sse', handleSSE);
  }, [parentMessage.id, threadId, scheduleFlush, flushNow, applyDeltas]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [content]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const optimisticId = `optimistic-reply-${Date.now()}`;
    const optimistic: MessageData = {
      id: optimisticId, threadId, senderType: 'USER', senderId: selfId ?? 'me',
      content: trimmed, contentType: 'TEXT', blocks: [], isEdited: false, isDeleted: false,
      parentMessageId: parentMessage.id, replyCount: 0, sequenceNumber: String(Date.now()),
      streamingStatus: null, metadata: {}, attachments: [], reactions: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setReplies((prev) => [...prev, optimistic]);
    setContent('');
    bottomRef.current?.scrollIntoView();

    // Optimistically update replyCount on the parent in the main message list
    window.dispatchEvent(new CustomEvent('messaging-sse', {
      detail: { type: 'message.created', threadId, message: optimistic },
    }));

    try {
      const res = await fetch(`${apiBase}/v1/messaging/threads/${threadId}/messages`, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-internal-shared-secret': getInternalSecret() },
        body: JSON.stringify({ content: trimmed, parentMessageId: parentMessage.id }),
      });
      const real = await res.json();
      setReplies((prev) => {
        const realExists = prev.some((m) => m.id === real.id);
        if (realExists) return prev.filter((m) => m.id !== optimisticId);
        return prev.map((m) => (m.id === optimisticId ? real : m));
      });
    } catch {
      setReplies((prev) => prev.filter((m) => m.id !== optimisticId));
    }
  }, [content, apiBase, threadId, parentMessage.id, selfId]);

  const replyCount = replies.length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-[var(--app-bg)]" data-testid="thread-view">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--app-border)] px-4">
        <button type="button" onClick={onBack} aria-label="Back to conversation"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h3 className="font-display text-[14px] font-semibold leading-tight">Thread</h3>
          <p className="text-[11px] text-[var(--app-muted)]">{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Parent message */}
        <div className="mb-4 rounded-[8px] border border-[var(--app-border)] p-3">
          <MessageItem message={parentMessage} isGrouped={false} onReact={onReact} onEdit={onEdit} onDelete={onDelete} />
        </div>

        {/* Divider */}
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-divider" />
          <span className="text-[11px] text-[var(--app-muted)]">{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
          <div className="h-px flex-1 bg-divider" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (<div key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-teal" style={{ animationDelay: `${i * 0.15}s` }} />))}
            </div>
          </div>
        ) : null}

        <div className="space-y-0.5">
          {replies.map((reply, index) => {
            const prev = index > 0 ? replies[index - 1] : null;
            const isGrouped = prev && prev.senderType === reply.senderType && prev.senderId === reply.senderId
              && !prev.isDeleted && new Date(reply.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
            return <MessageItem key={reply.id} message={reply} isGrouped={!!isGrouped} onReact={onReact} onEdit={onEdit} onDelete={onDelete} />;
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Reply composer */}
      <div className="shrink-0 border-t border-[var(--app-border)] px-4 py-3">
        <div className="flex flex-col rounded-[10px] border border-divider bg-[var(--app-input-bg)] transition-colors focus-within:border-brand-teal/60">
          <textarea ref={textareaRef} value={content} onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Reply in thread..." rows={1}
            className="max-h-[120px] min-h-[40px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-relaxed placeholder:text-[var(--app-muted)] focus:outline-none"
            aria-label="Reply input" data-testid="thread-reply-input" />
          <div className="flex items-center justify-end px-2 pb-2">
            <button type="button" onClick={handleSend} disabled={!content.trim()} aria-label="Send reply" data-testid="thread-send-btn"
              className={cn('flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors',
                content.trim() ? 'bg-brand-teal text-white hover:bg-brand-teal/90' : 'text-[var(--app-muted)]')}>
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
