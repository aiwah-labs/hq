import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listNotes, getNote, createNote, updateNote, deleteNote } from '../notes.js';
import type { ServiceContext } from '../context.js';
import type { BotPrincipal, UserPrincipal, AgentPrincipal } from '@hq/auth/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const noPerms = {
  'workshop.view': false,
  'content.all': false,
  'settings.view': false,
  'users.view': false,
  'users.manage': false,
  'admin.surface': false,
  'bots.view': false,
  'bots.create': false,
  'bots.manage.any': false,
  'messaging.view': false,
} as const;

const workshopPerms = { ...noPerms, 'workshop.view': true } as const;
const allPerms = Object.fromEntries(Object.keys(noPerms).map((k) => [k, true])) as typeof workshopPerms;

const userActor: UserPrincipal = {
  kind: 'user', source: 'session',
  userId: 'user_1', email: 'u@test.com',
  dbRole: 'MEMBER', effectiveRole: 'MEMBER',
  isSuperadmin: false, scopes: [], permissions: workshopPerms,
};

const botActor: BotPrincipal = {
  kind: 'bot', source: 'apikey',
  apiKeyId: 'k1', botId: 'b1', botSlug: 'my-bot', botName: 'My Bot',
  createdByUserId: 'u1', createdByEmail: 'a@b.com',
  scopes: ['note.read', 'note.write', 'note.delete'],
  permissions: noPerms,
};

const agentActor: AgentPrincipal = {
  kind: 'agent', source: 'internal',
  agentKey: 'workshop-assistant', agentName: 'Workshop Assistant',
  scopes: ['note.read', 'note.write', 'note.delete'],
  permissions: noPerms,
};

const botNoPerms: BotPrincipal = { ...botActor, scopes: [] };

const userNoWorkshop: UserPrincipal = {
  ...userActor,
  permissions: { ...noPerms },
};

// ── Mock DB ───────────────────────────────────────────────────────────────────

const noteStore = new Map<string, any>();
let idCounter = 0;

function makeNote(overrides: Record<string, unknown> = {}) {
  const id = `note_${++idCounter}`;
  return {
    id,
    title: 'Test Note',
    body: 'Body content',
    slug: null,
    tags: [],
    authorType: 'USER',
    authorId: 'user_1',
    isPinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

const mockDb = {
  note: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

function makeContext(actor: typeof userActor | typeof botActor | typeof agentActor | typeof botNoPerms): ServiceContext {
  return {
    actor: actor as any,
    dbClient: mockDb as any,
    now: () => new Date('2026-03-29T10:00:00Z'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  noteStore.clear();
  idCounter = 0;
});

// ── listNotes ─────────────────────────────────────────────────────────────────

describe('listNotes', () => {
  it('returns notes for user with workshop.view permission', async () => {
    const notes = [makeNote(), makeNote()];
    mockDb.note.findMany.mockResolvedValue(notes);

    const result = await listNotes(makeContext(userActor));
    expect(result).toHaveLength(2);
    expect(mockDb.note.findMany).toHaveBeenCalledOnce();
  });

  it('returns notes for bot with note.read scope', async () => {
    mockDb.note.findMany.mockResolvedValue([makeNote()]);
    const result = await listNotes(makeContext(botActor));
    expect(result).toHaveLength(1);
  });

  it('returns notes for agent with note.read scope', async () => {
    mockDb.note.findMany.mockResolvedValue([]);
    await listNotes(makeContext(agentActor));
    expect(mockDb.note.findMany).toHaveBeenCalledOnce();
  });

  it('throws for bot without note.read scope', async () => {
    await expect(listNotes(makeContext(botNoPerms))).rejects.toThrow("missing scope 'note.read'");
  });

  it('throws for user without workshop.view permission', async () => {
    await expect(listNotes(makeContext(userNoWorkshop))).rejects.toThrow("missing permission 'workshop.view'");
  });

  it('passes search query as OR filter', async () => {
    mockDb.note.findMany.mockResolvedValue([]);
    await listNotes(makeContext(userActor), { query: 'search term' });

    const [call] = mockDb.note.findMany.mock.calls;
    expect(call[0].where.OR).toBeDefined();
  });

  it('passes tag filter', async () => {
    mockDb.note.findMany.mockResolvedValue([]);
    await listNotes(makeContext(userActor), { tag: 'strategy' });

    const [call] = mockDb.note.findMany.mock.calls;
    expect(call[0].where.tags).toEqual({ has: 'strategy' });
  });

  it('passes isPinned filter', async () => {
    mockDb.note.findMany.mockResolvedValue([]);
    await listNotes(makeContext(userActor), { isPinned: true });

    const [call] = mockDb.note.findMany.mock.calls;
    expect(call[0].where.isPinned).toBe(true);
  });

  it('excludes deleted notes by default', async () => {
    mockDb.note.findMany.mockResolvedValue([]);
    await listNotes(makeContext(userActor));

    const [call] = mockDb.note.findMany.mock.calls;
    expect(call[0].where.deletedAt).toBeNull();
  });

  it('includes deleted notes when includeDeleted: true', async () => {
    mockDb.note.findMany.mockResolvedValue([]);
    await listNotes(makeContext(userActor), { includeDeleted: true });

    const [call] = mockDb.note.findMany.mock.calls;
    expect(call[0].where.deletedAt).toBeUndefined();
  });

  it('defaults to limit 50', async () => {
    mockDb.note.findMany.mockResolvedValue([]);
    await listNotes(makeContext(userActor));

    const [call] = mockDb.note.findMany.mock.calls;
    expect(call[0].take).toBe(50);
  });
});

// ── getNote ───────────────────────────────────────────────────────────────────

describe('getNote', () => {
  it('returns note by id', async () => {
    const note = makeNote({ id: 'note_x' });
    mockDb.note.findFirst.mockResolvedValue(note);

    const result = await getNote(makeContext(userActor), 'note_x');
    expect(result.id).toBe('note_x');
  });

  it('queries by both id and slug', async () => {
    mockDb.note.findFirst.mockResolvedValue(makeNote());
    await getNote(makeContext(userActor), 'some-slug');

    const [call] = mockDb.note.findFirst.mock.calls;
    const orClauses = call[0].where.OR;
    expect(orClauses.some((c: any) => 'id' in c)).toBe(true);
    expect(orClauses.some((c: any) => 'slug' in c)).toBe(true);
  });

  it('throws when note not found', async () => {
    mockDb.note.findFirst.mockResolvedValue(null);
    await expect(getNote(makeContext(userActor), 'missing')).rejects.toThrow('Note not found.');
  });

  it('throws for bot without note.read scope', async () => {
    await expect(getNote(makeContext(botNoPerms), 'n1')).rejects.toThrow("missing scope 'note.read'");
  });
});

// ── createNote ────────────────────────────────────────────────────────────────

describe('createNote', () => {
  it('creates note with correct author info for user', async () => {
    const note = makeNote();
    mockDb.note.create.mockResolvedValue(note);

    await createNote(makeContext(userActor), { title: 'My Note' });

    const [call] = mockDb.note.create.mock.calls;
    expect(call[0].data.authorType).toBe('USER');
    expect(call[0].data.authorId).toBe('user_1');
  });

  it('creates note with BOT author info', async () => {
    mockDb.note.create.mockResolvedValue(makeNote());
    await createNote(makeContext(botActor), { title: 'Bot Note' });

    const [call] = mockDb.note.create.mock.calls;
    expect(call[0].data.authorType).toBe('BOT');
    expect(call[0].data.authorId).toBe('my-bot');
  });

  it('creates note with AGENT author info', async () => {
    mockDb.note.create.mockResolvedValue(makeNote());
    await createNote(makeContext(agentActor), { title: 'Agent Note' });

    const [call] = mockDb.note.create.mock.calls;
    expect(call[0].data.authorType).toBe('AGENT');
    expect(call[0].data.authorId).toBe('workshop-assistant');
  });

  it('defaults body to empty string', async () => {
    mockDb.note.create.mockResolvedValue(makeNote());
    await createNote(makeContext(userActor), { title: 'No Body' });

    const [call] = mockDb.note.create.mock.calls;
    expect(call[0].data.body).toBe('');
  });

  it('defaults tags to empty array', async () => {
    mockDb.note.create.mockResolvedValue(makeNote());
    await createNote(makeContext(userActor), { title: 'No Tags' });

    const [call] = mockDb.note.create.mock.calls;
    expect(call[0].data.tags).toEqual([]);
  });

  it('stores provided slug', async () => {
    mockDb.note.create.mockResolvedValue(makeNote());
    await createNote(makeContext(userActor), { title: 'Slugged', slug: 'my-slug' });

    const [call] = mockDb.note.create.mock.calls;
    expect(call[0].data.slug).toBe('my-slug');
  });

  it('throws for bot without note.write scope', async () => {
    await expect(createNote(makeContext(botNoPerms), { title: 'X' })).rejects.toThrow("missing scope 'note.write'");
  });

  it('throws for empty title', async () => {
    await expect(createNote(makeContext(userActor), { title: '' })).rejects.toThrow();
  });

  it('throws for title exceeding 300 chars', async () => {
    await expect(createNote(makeContext(userActor), { title: 'a'.repeat(301) })).rejects.toThrow();
  });
});

// ── updateNote ────────────────────────────────────────────────────────────────

describe('updateNote', () => {
  it('updates only the provided fields', async () => {
    mockDb.note.findFirst.mockResolvedValue(makeNote({ id: 'n1' }));
    mockDb.note.update.mockResolvedValue(makeNote({ id: 'n1', title: 'Updated' }));

    await updateNote(makeContext(userActor), { noteId: 'n1', title: 'Updated' });

    const [call] = mockDb.note.update.mock.calls;
    expect(call[0].data.title).toBe('Updated');
    expect(call[0].data.body).toBeUndefined();
  });

  it('can update multiple fields at once', async () => {
    mockDb.note.findFirst.mockResolvedValue(makeNote({ id: 'n1' }));
    mockDb.note.update.mockResolvedValue(makeNote());

    await updateNote(makeContext(userActor), {
      noteId: 'n1',
      title: 'New Title',
      tags: ['a', 'b'],
      isPinned: true,
    });

    const [call] = mockDb.note.update.mock.calls;
    expect(call[0].data.title).toBe('New Title');
    expect(call[0].data.tags).toEqual(['a', 'b']);
    expect(call[0].data.isPinned).toBe(true);
  });

  it('throws when note not found', async () => {
    mockDb.note.findFirst.mockResolvedValue(null);
    await expect(updateNote(makeContext(userActor), { noteId: 'missing', title: 'X' })).rejects.toThrow('Note not found.');
  });

  it('throws when no fields provided', async () => {
    mockDb.note.findFirst.mockResolvedValue(makeNote({ id: 'n1' }));
    await expect(updateNote(makeContext(userActor), { noteId: 'n1' })).rejects.toThrow('No fields provided');
  });

  it('throws for bot without note.write scope', async () => {
    await expect(updateNote(makeContext(botNoPerms), { noteId: 'n1', title: 'X' })).rejects.toThrow("missing scope 'note.write'");
  });
});

// ── deleteNote ────────────────────────────────────────────────────────────────

describe('deleteNote', () => {
  it('soft-deletes a note by setting deletedAt', async () => {
    mockDb.note.findFirst.mockResolvedValue(makeNote({ id: 'n1' }));
    mockDb.note.update.mockResolvedValue(makeNote());

    const result = await deleteNote(makeContext(userActor), 'n1');

    expect(result).toEqual({ deleted: true });
    const [call] = mockDb.note.update.mock.calls;
    expect(call[0].data.deletedAt).toBeInstanceOf(Date);
    expect(call[0].data.deletedAt).toEqual(new Date('2026-03-29T10:00:00Z'));
  });

  it('uses context.now() for the deletedAt timestamp', async () => {
    const customNow = new Date('2025-01-01');
    const ctxCustomNow = { ...makeContext(userActor), now: () => customNow };
    mockDb.note.findFirst.mockResolvedValue(makeNote({ id: 'n1' }));
    mockDb.note.update.mockResolvedValue(makeNote());

    await deleteNote(ctxCustomNow as any, 'n1');

    const [call] = mockDb.note.update.mock.calls;
    expect(call[0].data.deletedAt).toEqual(customNow);
  });

  it('throws when note not found', async () => {
    mockDb.note.findFirst.mockResolvedValue(null);
    await expect(deleteNote(makeContext(userActor), 'missing')).rejects.toThrow('Note not found.');
  });

  it('throws for bot without note.delete scope', async () => {
    await expect(deleteNote(makeContext(botNoPerms), 'n1')).rejects.toThrow("missing scope 'note.delete'");
  });
});
