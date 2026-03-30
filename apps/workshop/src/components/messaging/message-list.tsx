'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import type { MessageData } from './messaging-workspace';
import { MessageItem } from './message-item';

interface TypingActor { actorType: string; actorId: string; actorName: string; since: number }

interface Props {
  messages: MessageData[];
  isLoading: boolean;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
  jumpToMessageId?: string;
  typingActors?: TypingActor[];
  onReact: (messageId: string, emoji: string, alreadyReacted: boolean) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onViewThread?: (message: MessageData) => void;
}

export const MessageList = memo(function MessageList({
  messages,
  isLoading,
  hasOlder,
  isLoadingOlder,
  onLoadOlder,
  jumpToMessageId,
  typingActors = [],
  onReact,
  onEdit,
  onDelete,
  onViewThread,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const lastMessageCount = useRef(0);
  const isAtBottomRef = useRef(true);

  // Keep ref in sync so rAF loop can read without stale closure
  useEffect(() => { isAtBottomRef.current = isAtBottom; }, [isAtBottom]);

  // Auto-scroll to bottom on new messages if already at bottom
  useEffect(() => {
    if (messages.length > lastMessageCount.current) {
      const added = messages.length - lastMessageCount.current;
      lastMessageCount.current = messages.length;

      if (isAtBottom) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        setNewMessageCount(0);
      } else {
        setNewMessageCount((n) => n + added);
      }
    }
  }, [messages.length, isAtBottom]);

  // Streaming auto-scroll: while any message is streaming and user is at bottom,
  // scroll to bottom on each tick so growing content stays visible.
  // Uses a ref-based active flag to guarantee the loop stops even if a frame
  // is mid-execution when the cleanup runs.
  const hasStreaming = messages.some((m) => m.streamingStatus === 'streaming');
  const scrollLoopActiveRef = useRef(false);
  const lastScrollHeightRef = useRef(0);

  useEffect(() => {
    if (!hasStreaming) {
      scrollLoopActiveRef.current = false;
      lastScrollHeightRef.current = 0;
      return;
    }
    scrollLoopActiveRef.current = true;
    let animId: number;
    const tick = () => {
      if (!scrollLoopActiveRef.current) return; // stopped between schedule and execution
      const container = containerRef.current;
      if (container && isAtBottomRef.current) {
        // Only scroll when content has actually grown — avoids fighting trackpad inertia
        if (container.scrollHeight > lastScrollHeightRef.current) {
          lastScrollHeightRef.current = container.scrollHeight;
          bottomRef.current?.scrollIntoView({ behavior: 'instant' });
        }
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => {
      scrollLoopActiveRef.current = false;
      cancelAnimationFrame(animId);
    };
  }, [hasStreaming]);

  // Scroll to bottom when typing starts (if already near bottom)
  useEffect(() => {
    if (typingActors.length > 0 && isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [typingActors.length, isAtBottom]);

  // After loading older messages, maintain scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isLoadingOlder) return;
    prevScrollHeight.current = container.scrollHeight;
  }, [isLoadingOlder]);

  useEffect(() => {
    if (!isLoadingOlder) {
      const container = containerRef.current;
      if (!container) return;
      const newScrollHeight = container.scrollHeight;
      container.scrollTop += newScrollHeight - prevScrollHeight.current;
    }
  }, [isLoadingOlder, messages.length]);

  // Initial scroll to bottom
  useEffect(() => {
    if (!isLoading) {
      if (jumpToMessageId) {
        const el = document.getElementById(`msg-${jumpToMessageId}`);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.classList.add('ring-2', 'ring-brand-teal/50');
          setTimeout(() => el.classList.remove('ring-2', 'ring-brand-teal/50'), 2000);
        }
      } else {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      }
    }
  }, [isLoading]);

  // Detect scroll position
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distFromBottom < 120;
    setIsAtBottom(atBottom);
    isAtBottomRef.current = atBottom;
    if (atBottom) setNewMessageCount(0);
  }, []);

  // Intersection observer for top sentinel (load older)
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting && hasOlder && !isLoadingOlder) onLoadOlder(); },
      { root: containerRef.current, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasOlder, isLoadingOlder, onLoadOlder]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-teal"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-4 py-4"
        onScroll={handleScroll}
        data-testid="message-list"
      >
        {/* Top sentinel for infinite scroll */}
        <div ref={topSentinelRef} className="h-1" />

        {/* Loading older indicator */}
        {isLoadingOlder ? (
          <div className="mb-4 flex justify-center">
            <span className="text-[12px] text-muted">Loading older messages…</span>
          </div>
        ) : null}

        {/* Messages */}
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[13px] text-muted">No messages yet. Say hello!</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {messages.map((message, index) => {
              const prev = index > 0 ? messages[index - 1] : null;
              const isGrouped =
                prev &&
                prev.contentType !== 'SYSTEM' &&
                prev.senderType === message.senderType &&
                prev.senderId === message.senderId &&
                !prev.isDeleted &&
                new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;

              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  isGrouped={!!isGrouped}
                  onReact={onReact}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onViewThread={onViewThread}
                />
              );
            })}
          </div>
        )}

        {/* Typing indicator — inline in feed, below last message */}
        {typingActors.length > 0 ? (
          <div className="flex items-start gap-3 px-2 py-1" aria-live="polite">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-teal/10 ring-1 ring-brand-teal/20">
              <span className="text-[11px] font-semibold text-brand-teal">
                {typingActors[0]!.actorName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{typingActors.map((a) => a.actorName).join(', ')}</span>
              <div className="flex items-center gap-1 py-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-2 w-2 animate-bounce rounded-full bg-[var(--app-muted)]"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {/* New messages pill */}
      {newMessageCount > 0 && !isAtBottom ? (
        <button
          type="button"
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: hasStreaming ? 'instant' : 'smooth' });
            setNewMessageCount(0);
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-brand-teal px-3 py-1 text-[12px] font-medium text-white shadow-md transition-opacity hover:opacity-90"
        >
          ↓ {newMessageCount} new {newMessageCount === 1 ? 'message' : 'messages'}
        </button>
      ) : null}
    </div>
  );
});
