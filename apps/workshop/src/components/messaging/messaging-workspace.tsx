'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ThreadList } from './thread-list';
import { MessagePanel } from './message-panel';
import { CreateThreadModal } from './create-thread-modal';
import { ActorCacheProvider } from './actor-cache';
import { getApiBaseUrl, getInternalSecret } from '@/lib/api-url';
import { cn } from '@/lib/cn';

export type ThreadSummary = {
  id: string;
  type: string;
  name?: string | null;
  description?: string | null;
  iconEmoji?: string | null;
  isArchived: boolean;
  lastMessageAt?: string | null;
  unreadCount?: number;
  lastMessage?: {
    id: string;
    content: string;
    senderType: string;
    senderId: string;
    contentType: string;
    createdAt: string;
  } | null;
  participants: Array<{
    id: string;
    actorType: string;
    actorId: string;
    role: string;
    isMuted: boolean;
  }>;
};

export type MessageData = {
  id: string;
  threadId: string;
  senderType: string;
  senderId: string;
  content: string;
  contentType: string;
  blocks: unknown[];
  isEdited: boolean;
  isDeleted: boolean;
  parentMessageId?: string | null;
  replyCount: number;
  sequenceNumber: string;
  streamingStatus?: string | null;
  metadata: Record<string, unknown>;
  attachments: Array<{
    id: string;
    type: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url?: string | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
  }>;
  reactions: Array<{
    emoji: string;
    count: number;
    selfReacted: boolean;
    reactors: Array<{ type: string; id: string }>;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type SSEEvent =
  | { type: 'message.created'; threadId: string; message: MessageData }
  | { type: 'message.updated'; threadId: string; message: Partial<MessageData> & { id: string } }
  | { type: 'message.deleted'; threadId: string; messageId: string }
  | { type: 'message.streaming'; threadId: string; messageId: string; part:
      | { type: 'text-delta'; delta: string }
      | { type: 'reasoning-delta'; delta: string }
      | { type: 'tool-call'; toolCallId: string; toolName: string; toolTitle?: string; args: unknown }
      | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
    }
  | { type: 'reaction.added'; threadId: string; messageId: string; reaction: Record<string, unknown> }
  | { type: 'reaction.removed'; threadId: string; messageId: string; emoji: string }
  | { type: 'thread.updated'; thread: Record<string, unknown> }
  | { type: 'typing.start'; threadId: string; actorType: string; actorId: string; actorName: string }
  | { type: 'typing.stop'; threadId: string; actorType: string; actorId: string }
  | { type: 'notification'; recipientType: string; recipientId: string; notification: Record<string, unknown> }
  | { type: 'connected'; actorType: string; actorId: string };

interface Props {
  initialThreads: Record<string, unknown>[];
  initialThreadId?: string;
  jumpToMessageId?: string;
}

export function MessagingWorkspace({ initialThreads, initialThreadId, jumpToMessageId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialActive = initialThreadId ?? (initialThreads[0] as ThreadSummary | undefined)?.id;
  const [threads, setThreads] = useState<ThreadSummary[]>(
    // Zero unreadCount for the initially active thread so there's no stale badge on load
    (initialThreads as ThreadSummary[]).map((t) =>
      t.id === initialActive ? { ...t, unreadCount: 0 } : t
    )
  );
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(initialActive);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const activeThreadIdRef = useRef(activeThreadId);

  // Keep ref in sync
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // SSE connection
  useEffect(() => {
    const apiUrl = getApiBaseUrl();
    const es = new EventSource(`${apiUrl}/v1/messaging/stream?_secret=${getInternalSecret()}`, { withCredentials: true });
    eventSourceRef.current = es;

    const eventTypes = [
      'message.created', 'message.updated', 'message.deleted', 'message.streaming',
      'reaction.added', 'reaction.removed', 'thread.updated',
      'typing.start', 'typing.stop', 'notification', 'connected',
    ];

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const event = { type: eventType, ...data } as SSEEvent;
          handleSSEEvent(event);
        } catch {
          // ignore parse errors
        }
      });
    }

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const handleSelectThread = useCallback((threadId: string | null) => {
    setActiveThreadId(threadId ?? undefined);
    if (threadId) {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t))
      );
      activeThreadIdRef.current = threadId;
      router.replace(`/messaging?thread=${threadId}`, { scroll: false });
    }
  }, [router]);

  // Handle back button on mobile
  useEffect(() => {
    const handleDeselect = () => handleSelectThread(null);
    window.addEventListener('messaging-deselect-thread', handleDeselect);
    return () => window.removeEventListener('messaging-deselect-thread', handleDeselect);
  }, [handleSelectThread]);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    // Forward all events to the active message panel via custom DOM event
    window.dispatchEvent(new CustomEvent('messaging-sse', { detail: event }));

    switch (event.type) {
      case 'connected': {
        setSelfId(event.actorId);
        break;
      }
      case 'message.created': {
        // Replies (parentMessageId set) don't update thread preview or unread counts
        if (event.message.parentMessageId) break;

        const isActive = event.threadId === activeThreadIdRef.current;
        setThreads((prev) =>
          prev
            .map((t) =>
              t.id === event.threadId
                ? {
                    ...t,
                    lastMessageAt: event.message.createdAt,
                    lastMessage: {
                      id: event.message.id,
                      content: event.message.content,
                      senderType: event.message.senderType,
                      senderId: event.message.senderId,
                      contentType: event.message.contentType,
                      createdAt: event.message.createdAt,
                    },
                    // Active thread: always 0. Inactive: increment.
                    unreadCount: isActive ? 0 : (t.unreadCount ?? 0) + 1,
                  }
                : t
            )
            .sort((a, b) => {
              if (!a.lastMessageAt) return 1;
              if (!b.lastMessageAt) return -1;
              return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
            })
        );
        break;
      }
      case 'thread.updated': {
        const updated = event.thread as ThreadSummary;
        setThreads((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
        break;
      }
    }
  }, []);


  const handleThreadCreated = useCallback((thread: ThreadSummary) => {
    setThreads((prev) => {
      const exists = prev.some((t) => t.id === thread.id);
      return exists ? prev : [thread, ...prev];
    });
    setActiveThreadId(thread.id);
    setShowCreateModal(false);
    router.replace(`/messaging?thread=${thread.id}`, { scroll: false });
  }, [router]);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  return (
    <ActorCacheProvider selfId={selfId}>
      <div className="flex h-[calc(100vh-0px)] -my-4 -mx-4 md:-mx-6 relative" data-testid="messaging-workspace">
        {/* Thread list sidebar */}
        <div className={cn(
          "w-full md:w-[280px] shrink-0 flex-col border-r border-divider bg-[var(--app-bg-elevated)] transition-all",
          activeThreadId ? "hidden md:flex" : "flex"
        )}>
          {/* Sidebar header */}
          <div className="flex h-14 items-center justify-between border-b border-divider px-4">
            <h2 className="font-display text-[15px] font-semibold tracking-tight">Messages</h2>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              aria-label="New thread"
              data-testid="new-thread-btn"
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Thread list */}
          <ThreadList
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectThread={handleSelectThread}
            eventSource={eventSourceRef.current}
          />
        </div>

        {/* Message panel */}
        <div className={cn(
          "min-w-0 flex-1 flex-col bg-[var(--app-bg)] relative z-10",
          !activeThreadId ? "hidden md:flex" : "flex w-full absolute inset-0 md:static md:w-auto"
        )}>
          {activeThread ? (
            <MessagePanel
              key={activeThread.id}
              thread={activeThread}
              jumpToMessageId={jumpToMessageId}
              onThreadUpdated={(updated) =>
                setThreads((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))
              }
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--app-bg-elevated)] ring-1 ring-divider">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--app-muted)]">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-[14px] font-medium">No thread selected</p>
                <p className="mt-1 text-[13px] text-[var(--app-muted)]">Select a thread or create a new one</p>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-[7px] bg-brand-teal px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  New thread
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Create thread modal */}
        {showCreateModal ? (
          <CreateThreadModal
            onClose={() => setShowCreateModal(false)}
            onCreated={handleThreadCreated}
          />
        ) : null}
      </div>
    </ActorCacheProvider>
  );
}
