'use client';

import { useState, useTransition, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pin, PinOff, Trash2, Check, Eye, Edit3 } from 'lucide-react';
import { updateNoteAction, deleteNoteAction } from '../actions';

interface Note {
  id: string;
  title: string;
  body: string;
  slug: string | null;
  tags: string[];
  authorType: string;
  authorId: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function renderMarkdown(md: string): string {
  // Basic markdown → HTML (no external deps)
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-2">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-5 mb-2">$2</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-1">$3</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 text-[13px] font-mono">$1</code>')
    .replace(/^```[\w]*\n([\s\S]*?)```$/gm, '<pre class="rounded-[6px] bg-white/5 p-3 text-[13px] font-mono overflow-x-auto my-3">$1</pre>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-[#009E85] pl-3 text-[#62666d] my-2">$1</blockquote>')
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-[#009E85] underline" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g, '</p><p class="mb-3">')
    .replace(/^(.+)$/gm, (line) => {
      if (line.startsWith('<')) return line;
      return line;
    });
}

export function NoteEditor({ note: initialNote }: { note: Note }) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote);
  const [title, setTitle] = useState(initialNote.title);
  const [body, setBody] = useState(initialNote.body);
  const [tagsInput, setTagsInput] = useState(initialNote.tags.join(', '));
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSave = useCallback((newTitle: string, newBody: string, newTags: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const tags = newTags.split(',').map((t) => t.trim()).filter(Boolean);
      setSaving(true);
      try {
        await updateNoteAction(note.id, { title: newTitle, body: newBody, tags });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch { /* silent */ } finally {
        setSaving(false);
      }
    }, 800);
  }, [note.id]);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    triggerSave(e.target.value, body, tagsInput);
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value);
    triggerSave(title, e.target.value, tagsInput);
  }

  function handleTagsChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTagsInput(e.target.value);
    triggerSave(title, body, e.target.value);
  }

  function handleTogglePin() {
    startTransition(async () => {
      const updated = (await updateNoteAction(note.id, { isPinned: !note.isPinned })) as Note;
      setNote(updated as Note);
    });
  }

  function handleDelete() {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    startTransition(async () => {
      await deleteNoteAction(note.id);
      router.push('/notes');
    });
  }

  return (
    <div className="flex h-full flex-col" data-testid="note-editor">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#e6e8eb] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Link
            href="/notes"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#62666d] transition-colors hover:bg-[var(--hover-bg)] hover:text-[#0f1011]"
            aria-label="Back to notes"
          >
            <ArrowLeft size={14} />
          </Link>
          <span className="text-[12px] text-[#62666d]">
            {saving ? 'Saving…' : saved ? (
              <span className="flex items-center gap-1 text-[#009E85]"><Check size={11} /> Saved</span>
            ) : `Updated ${formatDate(note.updatedAt)}`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Edit / Preview toggle */}
          <div className="flex items-center rounded-[6px] border border-[#e6e8eb] p-0.5">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`flex h-6 items-center gap-1.5 rounded-[4px] px-2 text-[11px] font-medium transition-colors ${mode === 'edit' ? 'bg-[#009E85]/15 text-[#009E85]' : 'text-[#62666d] hover:text-[#0f1011]'}`}
              data-testid="note-edit-tab"
            >
              <Edit3 size={10} /> Edit
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`flex h-6 items-center gap-1.5 rounded-[4px] px-2 text-[11px] font-medium transition-colors ${mode === 'preview' ? 'bg-[#009E85]/15 text-[#009E85]' : 'text-[#62666d] hover:text-[#0f1011]'}`}
              data-testid="note-preview-tab"
            >
              <Eye size={10} /> Preview
            </button>
          </div>

          <button
            type="button"
            onClick={handleTogglePin}
            disabled={isPending}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#62666d] transition-colors hover:bg-[var(--hover-bg)] hover:text-[#0f1011] disabled:opacity-50"
            aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
            data-testid="note-pin-btn"
          >
            {note.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#62666d] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] disabled:opacity-50"
            aria-label="Delete note"
            data-testid="note-delete-btn"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Title */}
        <div className="border-b border-[#e6e8eb] px-8 py-4">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            className="w-full bg-transparent text-[22px] font-semibold text-[#0f1011] placeholder:text-[#62666d] focus:outline-none"
            placeholder="Untitled"
            data-testid="note-title-field"
          />
        </div>

        {/* Tags row */}
        <div className="flex items-center gap-2 border-b border-[#e6e8eb] px-8 py-2">
          <span className="text-[11px] font-medium text-[#62666d]">Tags:</span>
          <input
            type="text"
            value={tagsInput}
            onChange={handleTagsChange}
            placeholder="Add tags, comma separated…"
            className="flex-1 bg-transparent text-[12px] text-[#0f1011] placeholder:text-[#62666d] focus:outline-none"
            data-testid="note-tags-field"
          />
          <span className="text-[11px] text-[#62666d]">
            by {note.authorType.toLowerCase()}:{note.authorId}
          </span>
        </div>

        {/* Body editor / preview */}
        {mode === 'edit' ? (
          <textarea
            value={body}
            onChange={handleBodyChange}
            className="flex-1 resize-none bg-transparent px-8 py-5 font-mono text-[13px] leading-relaxed text-[#0f1011] placeholder:text-[#62666d] focus:outline-none"
            placeholder="Start writing in Markdown…"
            data-testid="note-body-field"
          />
        ) : (
          <div
            className="flex-1 overflow-y-auto px-8 py-5 text-[14px] leading-relaxed text-[#0f1011] prose-invert"
            data-testid="note-preview"
            dangerouslySetInnerHTML={{ __html: `<p class="mb-3">${renderMarkdown(body || '*Nothing to preview.*')}</p>` }}
          />
        )}
      </div>
    </div>
  );
}
