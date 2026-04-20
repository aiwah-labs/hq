import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import { EmptyState, Button } from '@/components/ui';
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
  return stripped.length > 120 ? `${stripped.slice(0, 120)}…` : stripped || 'No content.';
}

interface SearchParams { q?: string; tag?: string; }
interface Props { searchParams: Promise<SearchParams>; }
interface Note {
  id: string; title: string; body: string; slug: string | null;
  tags: string[]; authorType: string; authorId: string;
  isPinned: boolean; createdAt: string; updatedAt: string;
}

export default async function NotesPage({ searchParams }: Props) {
  await requirePermission(ROUTE_PERMISSIONS.notes);
  const sp = await searchParams;
  const client = await getSessionApiClient();
  const notes = (await client.listNotes({ q: sp.q, tag: sp.tag, limit: 200 })) as Note[];

  const pinnedNotes = notes.filter((n) => n.isPinned);
  const regularNotes = notes.filter((n) => !n.isPinned);

  return (
    <div className="space-y-4" data-testid="notes-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
            <span className="font-medium">Home</span>
            <span className="text-[#d0d6e0]">/</span>
            <span>Notes</span>
          </div>
          <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Notes</h1>
          <p className="mt-2 text-[12.5px] text-[#62666d]">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            {sp.q ? ` matching "${sp.q}"` : ''}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <CreateNoteModal />
        </div>
      </div>

      {/* Search */}
      <form method="GET" className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Search notes…"
          className="h-8 w-56 rounded-md border border-[#e6e8eb] bg-white px-3 text-[12.5px] text-[#0f1011] placeholder:text-[#8a8f98] focus:outline-none focus:ring-2 focus:ring-[#009E85]/40 focus:ring-offset-1 transition-colors"
          data-testid="notes-search"
        />
        {sp.q && (
          <Link href="/notes" className="text-[12px] text-[#62666d] hover:text-[#0f1011] transition-colors">
            Clear
          </Link>
        )}
      </form>

      {notes.length === 0 ? (
        <div className="rounded-lg border border-[#e6e8eb] bg-white">
          <EmptyState
            title={sp.q ? `No notes matching "${sp.q}"` : 'No notes yet'}
            description={sp.q ? undefined : 'Create your first note to get started.'}
            action={sp.q ? undefined : <CreateNoteModal />}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {pinnedNotes.length > 0 && (
            <div>
              <div className="mb-2.5 flex items-baseline gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Pinned</h2>
                <p className="text-[11px] text-[#8a8f98]">&mdash; {pinnedNotes.length}</p>
              </div>
              <NoteGrid notes={pinnedNotes} />
            </div>
          )}
          {regularNotes.length > 0 && (
            <div>
              {pinnedNotes.length > 0 && (
                <div className="mb-2.5 flex items-baseline gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">All notes</h2>
                  <p className="text-[11px] text-[#8a8f98]">&mdash; {regularNotes.length}</p>
                </div>
              )}
              <NoteGrid notes={regularNotes} />
            </div>
          )}
        </div>
      )}
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
          className="group relative flex flex-col rounded-lg border border-[#e6e8eb] bg-white p-4 hover:bg-[#fafbfb] hover:border-[#d0d6e0] transition-colors duration-100"
        >
          {note.isPinned && (
            <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-[#009E85]" aria-label="Pinned" />
          )}
          <h3 className="mb-1.5 pr-4 text-[12.5px] font-medium leading-snug text-[#0f1011] line-clamp-2">
            {note.title}
          </h3>
          <p className="flex-1 text-[12px] leading-relaxed text-[#62666d] line-clamp-3">
            {notePreview(note.body)}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {note.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-[#E0F7F3] px-1.5 py-0.5 text-[10.5px] font-medium text-[#007A66]"
                >
                  {tag}
                </span>
              ))}
            </div>
            <span className="shrink-0 text-[11px] text-[#8a8f98]">{formatDate(note.updatedAt)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
