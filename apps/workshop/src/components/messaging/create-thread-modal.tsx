'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, Users, Hash, User, Bot, X, Search, Cpu } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiBaseUrl, getInternalSecret } from '@/lib/api-url';
import type { ThreadSummary } from './messaging-workspace';

interface Props {
  onClose: () => void;
  onCreated: (thread: ThreadSummary) => void;
}

type ThreadTypeOption = 'DM' | 'GROUP' | 'CHANNEL';

interface ActorOption {
  type: 'USER' | 'BOT' | 'AGENT';
  id: string;        // userId / botId / agentKey
  label: string;
  sublabel?: string;
}

const THREAD_TYPES: { value: ThreadTypeOption; label: string; icon: typeof MessageSquare }[] = [
  { value: 'DM', label: 'Direct Message', icon: MessageSquare },
  { value: 'GROUP', label: 'Group', icon: Users },
  { value: 'CHANNEL', label: 'Channel', icon: Hash },
];

export function CreateThreadModal({ onClose, onCreated }: Props) {
  const [threadType, setThreadType] = useState<ThreadTypeOption>('DM');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [actorSearch, setActorSearch] = useState('');
  const [selectedActors, setSelectedActors] = useState<ActorOption[]>([]);
  const [allActors, setAllActors] = useState<ActorOption[]>([]);
  const [isLoadingActors, setIsLoadingActors] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiBase = getApiBaseUrl();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Load all users + bots on mount
  useEffect(() => {
    async function loadActors() {
      setIsLoadingActors(true);
      try {
        const headers = { 'x-internal-shared-secret': getInternalSecret() };
        const [usersRes, botsRes, agentsRes] = await Promise.all([
          fetch(`${apiBase}/v1/users?limit=200`, { credentials: 'include', headers }),
          fetch(`${apiBase}/v1/bots?limit=200`, { credentials: 'include', headers }),
          fetch(`${apiBase}/v1/agents`, { credentials: 'include', headers }),
        ]);
        const usersRaw = usersRes.ok ? await usersRes.json() : [];
        const botsRaw = botsRes.ok ? await botsRes.json() : [];
        const agentsRaw = agentsRes.ok ? await agentsRes.json() : [];

        const botsList = Array.isArray(botsRaw) ? botsRaw : botsRaw.items ?? [];

        const agentActors: ActorOption[] = (Array.isArray(agentsRaw) ? agentsRaw : [])
          .filter((a: { enabled?: boolean }) => a.enabled !== false)
          .map((a: { key: string; name?: string; description?: string }) => ({
            type: 'AGENT' as const,
            id: a.key,
            label: a.name ?? a.key,
            sublabel: a.description ?? 'AI Agent',
          }));

        const botActors: ActorOption[] = botsList
          .map((b: { id: string; name?: string; description?: string }) => ({
            type: 'BOT' as const,
            id: b.id,
            label: b.name ?? `Bot ${b.id.slice(0, 8)}`,
            sublabel: b.description ?? 'Bot',
          }));

        const userActors: ActorOption[] = (Array.isArray(usersRaw) ? usersRaw : [])
          .map((u: { id: string; name?: string; email?: string }) => ({
            type: 'USER' as const,
            id: u.id,
            label: u.name ?? u.email ?? `User ${u.id.slice(0, 8)}`,
            sublabel: u.email,
          }));

        setAllActors([...agentActors, ...botActors, ...userActors]);
      } finally {
        setIsLoadingActors(false);
      }
    }
    loadActors();
  }, [apiBase]);

  // Filter actors by search query
  const visibleActors = actorSearch.trim()
    ? allActors.filter((a) =>
        a.label.toLowerCase().includes(actorSearch.toLowerCase()) ||
        a.sublabel?.toLowerCase().includes(actorSearch.toLowerCase())
      )
    : allActors;

  const handleSearchChange = (value: string) => {
    setActorSearch(value);
  };

  const toggleActor = (actor: ActorOption) => {
    setSelectedActors((prev) => {
      const exists = prev.find((a) => a.id === actor.id && a.type === actor.type);
      if (exists) return prev.filter((a) => !(a.id === actor.id && a.type === actor.type));
      if (threadType === 'DM') return [actor];
      return [...prev, actor];
    });
    setActorSearch('');
  };

  const handleCreate = async () => {
    if (threadType !== 'DM' && !name.trim()) {
      setError('Name is required for groups and channels.');
      return;
    }
    if (selectedActors.length === 0 && threadType === 'DM') {
      setError('Select someone to message.');
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/v1/messaging/threads`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-internal-shared-secret': getInternalSecret() },
        body: JSON.stringify({
          type: threadType,
          name: name || null,
          description: description || null,
          iconEmoji: null,
          // Agents are first-class participants — use AGENT type with agentKey as id
          participants: selectedActors.map((a) => ({ type: a.type, id: a.id })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message ?? 'Failed to create thread.');
        return;
      }
      const thread: ThreadSummary = await res.json();
      onCreated(thread);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="New conversation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-[460px] flex-col rounded-[12px] border border-[var(--app-border)] bg-[var(--app-bg-elevated)] shadow-2xl mx-4 sm:mx-0">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--app-border)] px-5">
          <span className="font-display text-[15px] font-semibold">New Conversation</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--app-muted)] hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2">
            {THREAD_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setThreadType(t.value); setSelectedActors([]); }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-[8px] border px-3 py-3 text-center transition-colors',
                    threadType === t.value
                      ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                      : 'border-divider hover:border-brand-teal/30 hover:bg-[var(--app-bg)]',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[11px] font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Name (for group/channel) */}
          {threadType !== 'DM' ? (
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium" htmlFor="thread-name">Name</label>
              <Input
                id="thread-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={threadType === 'CHANNEL' ? 'engineering, marketing...' : 'Team standup...'}
                autoFocus
              />
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
              />
            </div>
          ) : null}

          {/* Participant search */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium" htmlFor="actor-search">
              {threadType === 'DM' ? 'Send to' : 'Add members'}
            </label>

            {/* Selected actors */}
            {selectedActors.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedActors.map((a) => (
                  <span
                    key={`${a.type}-${a.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-teal/30 bg-brand-teal/10 px-2.5 py-1 text-[12px] text-brand-teal"
                  >
                    {a.type === 'AGENT' ? <Cpu className="h-3 w-3" /> : a.type === 'BOT' ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    <span>{a.label}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${a.label}`}
                      onClick={() => toggleActor(a)}
                      className="hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--app-muted)]" />
              <input
                id="actor-search"
                type="text"
                value={actorSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search agents, users or bots..."
                className="w-full rounded-[6px] border border-divider bg-[var(--app-input-bg)] py-2 pl-8 pr-3 text-[13px] placeholder:text-[var(--app-muted)] focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                autoComplete="off"
                data-testid="actor-search-input"
              />
              {isLoadingActors ? (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-3 w-3 animate-spin rounded-full border border-brand-teal border-t-transparent" />
                </div>
              ) : null}
            </div>

            {/* Actor list — always visible, filtered by search */}
            <div className="max-h-48 overflow-y-auto rounded-[8px] border border-divider bg-[var(--app-bg-elevated)] shadow-sm">
              {isLoadingActors ? (
                <div className="flex items-center justify-center py-6 text-[12px] text-[var(--app-muted)]">Loading...</div>
              ) : visibleActors.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-[12px] text-[var(--app-muted)]">
                  {actorSearch ? `No results for "${actorSearch}"` : 'No users or bots found'}
                </div>
              ) : (
                visibleActors.map((actor) => {
                  const isSelected = selectedActors.some((a) => a.id === actor.id && a.type === actor.type);
                  return (
                    <button
                      key={`${actor.type}-${actor.id}`}
                      type="button"
                      onClick={() => toggleActor(actor)}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--app-bg)]',
                        isSelected && 'bg-brand-teal/5',
                      )}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--app-bg-elevated)] ring-1 ring-divider">
                        {actor.type === 'AGENT' ? <Cpu className="h-3.5 w-3.5 text-purple-400" />
                          : actor.type === 'BOT' ? <Bot className="h-3.5 w-3.5 text-brand-teal" />
                          : <User className="h-3.5 w-3.5 text-[var(--app-muted)]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[12px] font-medium">{actor.label}</p>
                          <span className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                            actor.type === 'AGENT'
                              ? 'bg-purple-400/10 text-purple-400'
                              : actor.type === 'BOT'
                              ? 'bg-brand-teal/10 text-brand-teal'
                              : 'bg-[var(--app-bg)] text-[var(--app-muted)]'
                          )}>
                            {actor.type === 'AGENT' ? 'agent' : actor.type === 'BOT' ? 'bot' : 'user'}
                          </span>
                        </div>
                        {actor.sublabel ? <p className="truncate text-[11px] text-[var(--app-muted)]">{actor.sublabel}</p> : null}
                      </div>
                      {isSelected ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-brand-teal">
                          <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Error */}
          {error ? (
            <p className="rounded-[6px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-500">{error}</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-4">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={isCreating}
            data-testid="create-thread-btn"
          >
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
