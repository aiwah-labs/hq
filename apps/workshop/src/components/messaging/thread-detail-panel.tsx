'use client';

import { useState, useEffect } from 'react';
import { X, User, Bot, Pin, FileText, MessageSquare, Users, Hash, Clock, Shield, Archive } from 'lucide-react';
import { TabList, Tab, TabPanel } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useActorCache } from './actor-cache';
import type { ThreadSummary, MessageData } from './messaging-workspace';
import { getApiBaseUrl, getInternalSecret } from '@/lib/api-url';

interface Props {
  thread: ThreadSummary;
  onClose: () => void;
  onThreadUpdated: (thread: ThreadSummary) => void;
}

type TabValue = 'info' | 'members' | 'pins' | 'files';

interface PinnedMsg {
  id: string;
  content: string;
  senderType: string;
  createdAt: string;
  pinnedAt: string;
}

interface FilesAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url?: string;
  createdAt: string;
}

interface Participant {
  actorType: string;
  actorId: string;
  role: string;
  joinedAt: string;
}

function ThreadTypeIcon({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' };
  const cls = `${sizeMap[size]} text-[var(--app-muted)]`;
  if (type === 'DM') return <MessageSquare className={cls} />;
  if (type === 'CHANNEL') return <Hash className={cls} />;
  return <Users className={cls} />;
}

export function ThreadDetailPanel({ thread, onClose, onThreadUpdated }: Props) {
  const [tab, setTab] = useState<TabValue>('info');
  const [pins, setPins] = useState<PinnedMsg[]>([]);
  const [files, setFiles] = useState<FilesAttachment[]>([]);
  const [members, setMembers] = useState<Participant[]>([]);
  const [isLoadingTab, setIsLoadingTab] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(thread.name ?? '');
  const [descInput, setDescInput] = useState(thread.description ?? '');
  const apiBase = getApiBaseUrl();
  const { getActorName, selfId } = useActorCache();

  useEffect(() => {
    if (tab === 'pins') loadPins();
    else if (tab === 'files') loadFiles();
    else if (tab === 'members') loadMembers();
  }, [tab]);

  const loadPins = async () => {
    setIsLoadingTab(true);
    try {
      const res = await fetch(`${apiBase}/v1/messaging/threads/${thread.id}/pins`, {
        credentials: 'include', headers: { 'x-internal-shared-secret': getInternalSecret() },
      });
      if (res.ok) setPins(await res.json());
    } finally { setIsLoadingTab(false); }
  };

  const loadFiles = async () => {
    setIsLoadingTab(true);
    try {
      const res = await fetch(`${apiBase}/v1/messaging/threads/${thread.id}/messages?limit=100&direction=before`, {
        credentials: 'include', headers: { 'x-internal-shared-secret': getInternalSecret() },
      });
      if (res.ok) {
        const msgs: MessageData[] = await res.json();
        setFiles(msgs.flatMap((m) => m.attachments.map((a) => ({
          id: a.id, originalName: a.originalName, mimeType: a.mimeType ?? '', size: a.size,
          url: a.url ?? undefined, createdAt: m.createdAt,
        }))));
      }
    } finally { setIsLoadingTab(false); }
  };

  const loadMembers = async () => {
    setIsLoadingTab(true);
    try {
      const res = await fetch(`${apiBase}/v1/messaging/threads/${thread.id}/participants`, {
        credentials: 'include', headers: { 'x-internal-shared-secret': getInternalSecret() },
      });
      if (res.ok) setMembers(await res.json());
    } finally { setIsLoadingTab(false); }
  };

  const handleSaveInfo = async () => {
    const res = await fetch(`${apiBase}/v1/messaging/threads/${thread.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-internal-shared-secret': getInternalSecret() },
      body: JSON.stringify({ name: nameInput || null, description: descInput || null }),
    });
    if (res.ok) {
      onThreadUpdated(await res.json());
      setEditingName(false);
    }
  };

  const handleUnpin = async (messageId: string) => {
    await fetch(`${apiBase}/v1/messaging/messages/${messageId}/pin`, {
      method: 'DELETE', credentials: 'include', headers: { 'x-internal-shared-secret': getInternalSecret() },
    });
    setPins((prev) => prev.filter((p) => p.id !== messageId));
  };

  // Resolve thread name
  let threadName = thread.name ?? '';
  if (!threadName && thread.type === 'DM') {
    const other = thread.participants?.find((p) => !(p.actorType === 'USER' && p.actorId === selfId));
    threadName = other ? getActorName(other.actorType, other.actorId) : 'Direct Message';
  }
  if (!threadName) threadName = thread.type === 'CHANNEL' ? 'Unnamed Channel' : 'Group';

  const memberCount = thread.participants?.length ?? 0;

  return (
    <div className="flex w-[300px] shrink-0 flex-col border-l border-[var(--app-border)] bg-[var(--app-bg-elevated)]" data-testid="thread-detail-panel">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--app-border)] px-4">
        <span className="font-display text-[14px] font-semibold tracking-tight">Details</span>
        <button
          type="button" aria-label="Close details" onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--app-muted)] hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Profile card */}
      <div className="border-b border-[var(--app-border)] px-4 py-5">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--app-bg)] ring-1 ring-[var(--app-border)]">
            <ThreadTypeIcon type={thread.type} size="lg" />
          </div>

          {editingName ? (
            <div className="flex w-full flex-col gap-2">
              <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Thread name" autoFocus className="text-center" />
              <Input value={descInput} onChange={(e) => setDescInput(e.target.value)} placeholder="Description (optional)" />
              <div className="flex gap-2">
                <Button variant="primary" size="xs" onClick={handleSaveInfo} className="flex-1">Save</Button>
                <Button variant="secondary" size="xs" onClick={() => { setEditingName(false); setNameInput(thread.name ?? ''); setDescInput(thread.description ?? ''); }} className="flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => setEditingName(true)}
                className="font-display text-[15px] font-semibold hover:text-brand-teal transition-colors text-center leading-tight" aria-label="Edit thread name">
                {threadName}
              </button>
              {thread.description ? <p className="text-[12px] text-[var(--app-muted)] text-center leading-relaxed">{thread.description}</p> : null}
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{thread.type === 'DM' ? 'Direct Message' : thread.type === 'CHANNEL' ? 'Channel' : 'Group'}</Badge>
                <span className="text-[11px] text-[var(--app-muted)]">{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <TabList>
        <Tab value="info" activeTab={tab} onClick={(v) => setTab(v as TabValue)}>Info</Tab>
        <Tab value="members" activeTab={tab} onClick={(v) => setTab(v as TabValue)}>Members</Tab>
        <Tab value="pins" activeTab={tab} onClick={(v) => setTab(v as TabValue)}>Pins</Tab>
        <Tab value="files" activeTab={tab} onClick={(v) => setTab(v as TabValue)}>Files</Tab>
      </TabList>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <TabPanel value="info" activeTab={tab}>
          <div className="p-4 space-y-3">
            <InfoRow icon={<ThreadTypeIcon type={thread.type} size="sm" />} label="Type" value={thread.type === 'DM' ? 'Direct Message' : thread.type === 'CHANNEL' ? 'Channel' : 'Group'} />
            <InfoRow icon={<Users className="h-4 w-4 text-[var(--app-muted)]" />} label="Members" value={String(memberCount)} />
            {thread.lastMessage ? (
              <InfoRow icon={<Clock className="h-4 w-4 text-[var(--app-muted)]" />} label="Last activity" value={formatRelativeDate(thread.lastMessage.createdAt)} />
            ) : null}
            <InfoRow icon={thread.isArchived ? <Archive className="h-4 w-4 text-[var(--app-muted)]" /> : <Shield className="h-4 w-4 text-[var(--app-muted)]" />} label="Status" value={thread.isArchived ? 'Archived' : 'Active'} />
          </div>
        </TabPanel>

        <TabPanel value="members" activeTab={tab}>
          <MembersTab members={members} isLoading={isLoadingTab} participants={thread.participants} />
        </TabPanel>

        <TabPanel value="pins" activeTab={tab}>
          <PinsTab pins={pins} isLoading={isLoadingTab} onUnpin={handleUnpin} />
        </TabPanel>

        <TabPanel value="files" activeTab={tab}>
          <FilesTab files={files} isLoading={isLoadingTab} />
        </TabPanel>
      </div>
    </div>
  );
}

/* ── Shared sub-components ─────────────────────────────────────────────────── */

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[6px] px-2 py-2 hover:bg-[var(--app-bg)]/60 transition-colors">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-[var(--app-muted)]">{label}</p>
        <p className="text-[13px] font-medium">{value}</p>
      </div>
    </div>
  );
}

function MembersTab({ members, isLoading, participants }: {
  members: Participant[]; isLoading: boolean; participants?: ThreadSummary['participants'];
}) {
  const { getActorName } = useActorCache();

  const list = members.length > 0
    ? members.map((m) => ({ actorType: m.actorType, actorId: m.actorId, role: m.role }))
    : (participants ?? []).map((p) => ({ actorType: p.actorType, actorId: p.actorId, role: p.role }));

  if (isLoading && list.length === 0) return <LoadingSpinner />;
  if (list.length === 0) return <EmptyState icon={Users} text="No members" />;

  return (
    <div className="p-3 space-y-0.5">
      {list.map((m) => (
        <div key={`${m.actorType}-${m.actorId}`} className="flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 hover:bg-[var(--app-bg)]/60 transition-colors">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--app-bg)] ring-1 ring-[var(--app-border)]">
            {m.actorType === 'BOT' ? <Bot className="h-4 w-4 text-brand-teal" /> : <User className="h-4 w-4 text-[var(--app-muted)]" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{getActorName(m.actorType, m.actorId)}</p>
          </div>
          <Badge tone={m.role === 'ADMIN' ? 'teal' : 'neutral'}>{m.role.toLowerCase()}</Badge>
        </div>
      ))}
    </div>
  );
}

function PinsTab({ pins, isLoading, onUnpin }: { pins: PinnedMsg[]; isLoading: boolean; onUnpin: (id: string) => void }) {
  if (isLoading) return <LoadingSpinner />;
  if (pins.length === 0) return <EmptyState icon={Pin} text="No pinned messages" />;
  return (
    <div className="p-3 space-y-2">
      {pins.map((p) => (
        <div key={p.id} className="group relative rounded-[8px] border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5">
          <p className="line-clamp-3 text-[12px] leading-relaxed">{p.content}</p>
          <p className="mt-1.5 text-[10px] text-[var(--app-muted)]">Pinned {new Date(p.pinnedAt).toLocaleDateString()}</p>
          <button type="button" onClick={() => onUnpin(p.id)} aria-label="Unpin" className="absolute right-2 top-2 hidden rounded-[4px] p-1 text-[var(--app-muted)] hover:text-red-500 hover:bg-red-500/10 group-hover:flex transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function FilesTab({ files, isLoading }: { files: FilesAttachment[]; isLoading: boolean }) {
  if (isLoading) return <LoadingSpinner />;
  if (files.length === 0) return <EmptyState icon={FileText} text="No files shared" />;

  return (
    <div className="p-3 space-y-1.5">
      {files.map((f) => (
        <a key={f.id} href={f.url ?? '#'} download={f.originalName}
          className="flex items-center gap-2.5 rounded-[6px] border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5 text-[12px] hover:bg-[var(--app-bg-elevated)] transition-colors">
          <FileText className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{f.originalName}</p>
            <p className="text-[10px] text-[var(--app-muted)]">{formatFileSize(f.size)} · {new Date(f.createdAt).toLocaleDateString()}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-teal" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Pin; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--app-bg)] ring-1 ring-[var(--app-border)]">
        <Icon className="h-5 w-5 text-[var(--app-muted)]" />
      </div>
      <p className="text-[12px] text-[var(--app-muted)]">{text}</p>
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
