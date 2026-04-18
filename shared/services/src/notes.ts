import type { ServiceContext } from './context.js';

function assertNoteAccess(
  ctx: ServiceContext,
  scope: 'note.read' | 'note.write' | 'note.delete'
): void {
  const actor = ctx.actor;
  if (actor.kind === 'user') {
    if (!actor.permissions['workshop.view']) {
      throw new Error("missing permission 'workshop.view'");
    }
  } else {
    if (!actor.scopes.includes(scope)) {
      throw new Error(`missing scope '${scope}'`);
    }
  }
}

export interface ListNotesOptions {
  query?: string;
  tag?: string;
  isPinned?: boolean;
  includeDeleted?: boolean;
  limit?: number;
}

export async function listNotes(ctx: ServiceContext, opts?: ListNotesOptions) {
  assertNoteAccess(ctx, 'note.read');

  const where: Record<string, unknown> = {};

  if (!opts?.includeDeleted) {
    where.deletedAt = null;
  }

  if (opts?.query) {
    where.OR = [
      { title: { contains: opts.query, mode: 'insensitive' } },
      { body: { contains: opts.query, mode: 'insensitive' } },
    ];
  }

  if (opts?.tag !== undefined) {
    where.tags = { has: opts.tag };
  }

  if (opts?.isPinned !== undefined) {
    where.isPinned = opts.isPinned;
  }

  return ctx.dbClient.note.findMany({
    where,
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    take: opts?.limit ?? 50,
  });
}

export async function getNote(ctx: ServiceContext, idOrSlug: string) {
  assertNoteAccess(ctx, 'note.read');

  const note = await ctx.dbClient.note.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });

  if (!note) throw new Error('Note not found.');
  return note;
}

export interface CreateNoteInput {
  title: string;
  body?: string;
  tags?: string[];
  slug?: string;
  isPinned?: boolean;
}

export async function createNote(ctx: ServiceContext, input: CreateNoteInput) {
  assertNoteAccess(ctx, 'note.write');

  if (!input.title || input.title.trim().length === 0) {
    throw new Error('Title is required.');
  }
  if (input.title.length > 300) {
    throw new Error('Title must be 300 characters or fewer.');
  }

  return ctx.dbClient.note.create({
    data: {
      title: input.title,
      body: input.body ?? '',
      tags: input.tags ?? [],
      slug: input.slug ?? null,
      isPinned: input.isPinned ?? false,
    },
  });
}

export interface UpdateNoteInput {
  noteId: string;
  title?: string;
  body?: string;
  tags?: string[];
  slug?: string;
  isPinned?: boolean;
}

export async function updateNote(ctx: ServiceContext, input: UpdateNoteInput) {
  assertNoteAccess(ctx, 'note.write');

  const existing = await ctx.dbClient.note.findFirst({
    where: { OR: [{ id: input.noteId }, { slug: input.noteId }] },
  });
  if (!existing) throw new Error('Note not found.');

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) data.body = input.body;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.isPinned !== undefined) data.isPinned = input.isPinned;

  if (Object.keys(data).length === 0) {
    throw new Error('No fields provided to update.');
  }

  return ctx.dbClient.note.update({ where: { id: (existing as any).id }, data });
}

export async function deleteNote(ctx: ServiceContext, id: string) {
  assertNoteAccess(ctx, 'note.delete');

  const existing = await ctx.dbClient.note.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!existing) throw new Error('Note not found.');

  await ctx.dbClient.note.update({
    where: { id: (existing as any).id },
    data: { deletedAt: ctx.now() },
  });

  return { deleted: true };
}
