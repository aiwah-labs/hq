import { db } from '@hq/db';

export async function listNotes(opts?: { tag?: string; query?: string }) {
  return db.note.findMany({
    where: {
      ...(opts?.tag ? { tags: { has: opts.tag } } : {}),
    },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
  });
}

export async function createNote(data: { title: string; body?: string; tags?: string[] }) {
  return db.note.create({ data: { title: data.title, body: data.body ?? '', tags: data.tags ?? [] } });
}
