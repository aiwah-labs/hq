'use client';

import { Hash } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useActorCache } from './actor-cache';
import type { ThreadSummary } from './messaging-workspace';

interface Props {
  thread: ThreadSummary;
  isActive: boolean;
  onClick: () => void;
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 6) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'now';
}

/** Avatar for DMs shows a User icon; groups show Users icon; channels show # */
function ThreadAvatar({ thread, name }: { thread: ThreadSummary; name: string }) {
  if (thread.type === 'CHANNEL') {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--app-bg)] text-[14px] font-semibold text-[var(--app-muted)] ring-1 ring-[var(--app-border)]">
        #
      </div>
    );
  }

  if (thread.type === 'DM') {
    // Single-user avatar with initial
    const initial = name.charAt(0).toUpperCase();
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-teal/10 text-[13px] font-semibold text-brand-teal ring-1 ring-brand-teal/20">
        {initial}
      </div>
    );
  }

  // Group — initial letter of the group name, same treatment as DM but neutral palette
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--app-muted)]/10 text-[13px] font-semibold text-[var(--app-muted)] ring-1 ring-[var(--app-border)]">
      {initial}
    </div>
  );
}

export function ThreadListItem({ thread, isActive, onClick }: Props) {
  const { getActorName, selfId } = useActorCache();
  const hasUnread = (thread.unreadCount ?? 0) > 0;
  const lastMsg = thread.lastMessage;

  // Resolve name
  let name = thread.name ?? '';
  if (!name && thread.type === 'DM') {
    const other = thread.participants?.find((p) => !(p.actorType === 'USER' && p.actorId === selfId));
    name = other ? getActorName(other.actorType, other.actorId) : 'Direct Message';
  }
  if (!name) name = thread.type === 'CHANNEL' ? 'Unnamed Channel' : 'Group';

  // Channels display with # prefix
  const displayName = thread.type === 'CHANNEL' ? `# ${name}` : name;

  const preview = lastMsg
    ? lastMsg.contentType === 'SYSTEM'
      ? lastMsg.content
      : (lastMsg.content
          .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
          .replace(/\*(.+?)\*/g, '$1')        // italic
          .replace(/`(.+?)`/g, '$1')          // inline code
          .replace(/~~(.+?)~~/g, '$1')        // strikethrough
          .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
          .replace(/^#{1,6}\s+/gm, '')        // headings
          .replace(/\n+/g, ' ')               // newlines → space
          .trim()
          .slice(0, 60)) || 'Sent an attachment'
    : 'No messages yet';

  return (
    <button
      type="button" role="listitem" onClick={onClick}
      data-testid={`thread-item-${thread.id}`}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative flex w-full items-center gap-3 px-4 py-2.5 text-left',
        isActive
          ? 'bg-brand-teal/10 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-[3px] before:rounded-r-full before:bg-brand-teal before:content-[""]'
          : 'hover:bg-white/5'
      )}
    >
      <ThreadAvatar thread={thread} name={name} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <span className={cn('truncate text-[13px]', hasUnread ? 'font-semibold' : 'font-medium')}>
            {displayName}
          </span>
          {lastMsg?.createdAt ? (
            <span className="shrink-0 text-[11px] text-[var(--app-muted)]">{formatTime(lastMsg.createdAt)}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <p className={cn('flex-1 truncate text-[12px]', hasUnread ? 'text-[var(--app-fg)]/80' : 'text-[var(--app-muted)]')}>
            {preview}
          </p>
          {hasUnread ? (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-teal px-1 text-[10px] font-bold text-white">
              {thread.unreadCount! > 99 ? '99+' : thread.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
