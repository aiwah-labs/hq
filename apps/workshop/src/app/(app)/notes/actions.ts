'use server';

import { revalidatePath } from 'next/cache';
import { getSessionApiClient } from '@/lib/api-client';

export async function createNoteAction(formData: FormData) {
  const title = (formData.get('title') as string | null)?.trim();
  const body = (formData.get('body') as string | null) ?? '';
  const tagsRaw = (formData.get('tags') as string | null) ?? '';

  if (!title) throw new Error('Title is required.');

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const client = await getSessionApiClient();
  const note = (await client.createNote({ title, body, tags })) as { id: string };
  revalidatePath('/notes');
  return note;
}

export async function updateNoteAction(noteId: string, data: {
  title?: string;
  body?: string;
  tags?: string[];
  isPinned?: boolean;
}) {
  const client = await getSessionApiClient();
  const note = await client.updateNote(noteId, data);
  revalidatePath('/notes');
  revalidatePath(`/notes/${noteId}`);
  return note;
}

export async function deleteNoteAction(noteId: string) {
  const client = await getSessionApiClient();
  await client.deleteNote(noteId);
  revalidatePath('/notes');
}
