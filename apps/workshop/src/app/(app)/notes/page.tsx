import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import { CreateNoteModal } from './create-note-modal';

function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function notePreview(body: string): string {
  const stripped = body.replace(/^#+\s+.*/gm, '').replace(/[*_`#>[\]]/g, '').trim();
  return stripped.length > 140 ? `${stripped.slice(0, 140)}…` : stripped || 'No content.';
}

interface SearchParams {
  q?: string;
  tag?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

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

export default async function NotesPage({ searchParams }: Props) {
  await requirePermission(ROUTE_PERMISSIONS.notes);
  const sp = await searchParams;
  const client = await getSessionApiClient();
  const notes = (await client.listNotes({ q: sp.q, tag: sp.tag, limit: 200 })) as Note[];

  const pinnedNotes = notes.filter((n) => n.isPinned);
  const regularNotes = notes.filter((n) => !n.isPinned);

  return (
    <div className="flex h-full flex-col" data-testid="notes-page">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--fg)]">Notes</h1>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}{sp.q ? ` matching "${sp.q}"` : ''}
          </p>
        </div>
        <CreateNoteModal />
      </div>

      {/* Search bar */}
      <form method="GET" className="flex items-center gap-2 border-b border-[var(--border)] px-6 py-3">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Search notes…"
          className="h-8 w-64 rounded-[6px] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-[13px] text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-teal)]"
          data-testid="notes-search"
        />
        {sp.q && (
          <Link href="/notes" className="text-[12px] text-[var(--muted)] hover:text-[var(--fg)]">
            Clear
          </Link>
        )}
      </form>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {notes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-[15px] font-medium text-[var(--fg)]">No notes yet</p>
            <p className="mt-1 text-[13px] text-[var(--muted)]">Create your first note to get started</p>
          </div>
        )}

        {pinnedNotes.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Pinned</h2>
            <NoteGrid notes={pinnedNotes} />
          </section>
        )}

        {regularNotes.length > 0 && (
          <section>
            {pinnedNotes.length > 0 && (
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">All Notes</h2>
            )}
            <NoteGrid notes={regularNotes} />
          </section>
        )}
      </div>
    </div>
  );
}

function NoteGrid({ notes }: { notes: Note[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="notes-grid">
      {notes.map((note) => (
        <Link
          key={note.id}
          href={`/notes/${note.id}`}
          data-testid={`note-card-${note.id}`}
          className="group relative flex flex-col rounded-[8px] border border-[var(--border)] bg-[var(--card-bg)] p-4 transition-colors hover:border-[var(--color-brand-teal)]/40 hover:bg-[var(--card-bg-hover)]"
        >
          {note.isPinned && (
            <span className="absolute right-3 top-3 text-[10px] text-[var(--muted)]">📌</span>
          )}
          <h3 className="mb-1.5 pr-5 text-[14px] font-semibold leading-snug text-[var(--fg)] line-clamp-2">
            {note.title}
          </h3>
          <p className="flex-1 text-[12px] leading-relaxed text-[var(--muted)] line-clamp-3">
            {notePreview(note.body)}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {note.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[var(--color-brand-teal)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-brand-teal)]"
                >
                  {tag}
                </span>
              ))}
            </div>
            <span className="text-[11px] text-[var(--muted)]">{formatDate(note.updatedAt)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
