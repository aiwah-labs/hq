'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import type { ThreadSummary } from './messaging-workspace';
import { ThreadListItem } from './thread-list-item';

interface Props {
  threads: ThreadSummary[];
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
  eventSource: EventSource | null;
}

export function ThreadList({ threads, activeThreadId, onSelectThread }: Props) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? threads.filter((t) => {
        const name = t.name ?? '';
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : threads;

  const active = filtered.filter((t) => !t.isArchived);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="thread-list">
      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--app-muted)]" />
          <input
            type="text"
            placeholder="Search threads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[6px] border border-divider bg-[var(--app-input-bg)] py-1.5 pl-8 pr-3 text-[12px] placeholder:text-[var(--app-muted)] focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
            aria-label="Search threads"
            data-testid="thread-search"
          />
        </div>
      </div>

      {/* Thread items */}
      <div className="flex-1 overflow-y-auto py-1" role="list" aria-label="Threads">
        {active.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-[var(--app-muted)]">
            {search ? 'No threads found.' : 'No conversations yet.'}
          </p>
        ) : (
          active.map((thread) => (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              onClick={() => onSelectThread(thread.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
