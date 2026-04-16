import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import { NoteEditor } from './note-editor';

interface Props {
  params: Promise<{ id: string }>;
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

export default async function NoteDetailPage({ params }: Props) {
  await requirePermission(ROUTE_PERMISSIONS.notes);
  const { id } = await params;
  const client = await getSessionApiClient();
  const note = (await client.getNote(id)) as Note;

  return <NoteEditor note={note} />;
}
