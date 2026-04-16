import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mock all DB-touching modules before importing routes ──────────────────────

vi.mock('@hq/db', () => ({
  db: {},
  Prisma: { NoteWhereInput: {} },
}));

vi.mock('@hq/auth/middleware', () => ({
  resolveAuth: vi.fn(),
}));

vi.mock('@hq/services', () => ({
  listNotes: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  createServiceContext: vi.fn().mockReturnValue({ actor: {}, dbClient: {}, now: () => new Date(), logger: console }),
}));

// Mock requireAuth — default to success, tests override for 401/403 paths
const requireAuthMock = vi.fn().mockResolvedValue({
  kind: 'user', source: 'session',
  userId: 'user_1', email: 'test@test.com',
  dbRole: 'MEMBER', effectiveRole: 'MEMBER',
  isSuperadmin: false, scopes: ['note.read', 'note.write', 'note.delete'],
  permissions: {
    'workshop.view': true, 'content.all': true, 'settings.view': true,
    'users.view': false, 'users.manage': false, 'admin.surface': false,
    'bots.view': true, 'bots.create': true, 'bots.manage.any': false, 'messaging.view': true,
  },
});

vi.mock('../../lib/auth.js', () => ({
  requireAuth: requireAuthMock,
  requireUser: vi.fn(),
}));

// Now import services and route registration
const { listNotes, getNote, createNote, updateNote, deleteNote } = await import('@hq/services');
const { registerNotesRoutes } = await import('../../routes/v1/notes.js');
const { ApiError } = await import('../../lib/errors.js');
const { inferStatusFromError, inferCodeFromStatus } = await import('../../lib/errors.js');

// ── App setup — uses production-equivalent error handler ─────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });

  // Mirror the REAL error handler from apps/api/src/app.ts
  app.setErrorHandler((error, request, reply) => {
    const statusCode = inferStatusFromError(error);
    const code = error instanceof ApiError ? error.code : inferCodeFromStatus(statusCode);
    return reply.code(statusCode).send({
      error: {
        code,
        message: error instanceof Error ? error.message : 'Unexpected error.',
        details: error instanceof ApiError ? error.details : undefined,
      },
    });
  });

  await registerNotesRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to default success mock
  requireAuthMock.mockResolvedValue({
    kind: 'user', source: 'session',
    userId: 'user_1', email: 'test@test.com',
    dbRole: 'MEMBER', effectiveRole: 'MEMBER',
    isSuperadmin: false, scopes: ['note.read', 'note.write', 'note.delete'],
    permissions: {
      'workshop.view': true, 'content.all': true, 'settings.view': true,
      'users.view': false, 'users.manage': false, 'admin.surface': false,
      'bots.view': true, 'bots.create': true, 'bots.manage.any': false, 'messaging.view': true,
    },
  });
});

// ── Auth enforcement ─────────────────────────────────────────────────────────

describe('Auth enforcement', () => {
  it('returns 401 when requireAuth rejects', async () => {
    requireAuthMock.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.'));

    const res = await app.inject({ method: 'GET', url: '/v1/notes' });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 403 when bot lacks required scope', async () => {
    requireAuthMock.mockRejectedValue(new ApiError(403, 'FORBIDDEN', "Missing required bot scope 'note.read'."));

    const res = await app.inject({ method: 'GET', url: '/v1/notes' });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('calls requireAuth on every endpoint', async () => {
    vi.mocked(listNotes).mockResolvedValue([]);
    vi.mocked(getNote).mockResolvedValue({ id: 'n1' } as any);
    vi.mocked(createNote).mockResolvedValue({ id: 'n1' } as any);
    vi.mocked(updateNote).mockResolvedValue({ id: 'n1' } as any);
    vi.mocked(deleteNote).mockResolvedValue({ deleted: true });

    await app.inject({ method: 'GET', url: '/v1/notes' });
    await app.inject({ method: 'POST', url: '/v1/notes', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'X' }) });
    await app.inject({ method: 'GET', url: '/v1/notes/n1' });
    await app.inject({ method: 'PATCH', url: '/v1/notes/n1', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Y' }) });
    await app.inject({ method: 'DELETE', url: '/v1/notes/n1' });

    expect(requireAuthMock).toHaveBeenCalledTimes(5);
  });

  it('passes correct botScope for each endpoint', async () => {
    vi.mocked(listNotes).mockResolvedValue([]);
    vi.mocked(getNote).mockResolvedValue({ id: 'n1' } as any);
    vi.mocked(createNote).mockResolvedValue({ id: 'n1' } as any);
    vi.mocked(updateNote).mockResolvedValue({ id: 'n1' } as any);
    vi.mocked(deleteNote).mockResolvedValue({ deleted: true });

    await app.inject({ method: 'GET', url: '/v1/notes' });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'note.read' });

    await app.inject({ method: 'POST', url: '/v1/notes', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'X' }) });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'note.write' });

    await app.inject({ method: 'GET', url: '/v1/notes/n1' });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'note.read' });

    await app.inject({ method: 'PATCH', url: '/v1/notes/n1', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Y' }) });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'note.write' });

    await app.inject({ method: 'DELETE', url: '/v1/notes/n1' });
    expect(requireAuthMock).toHaveBeenLastCalledWith(expect.anything(), { botScope: 'note.delete' });
  });
});

// ── GET /v1/notes ─────────────────────────────────────────────────────────────

describe('GET /v1/notes', () => {
  it('returns 200 with empty array', async () => {
    vi.mocked(listNotes).mockResolvedValue([]);
    const res = await app.inject({ method: 'GET', url: '/v1/notes' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('returns list of notes', async () => {
    const notes = [
      { id: 'n1', title: 'Note 1', body: '', tags: [], authorType: 'USER', authorId: 'u1', isPinned: false, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, slug: null },
    ];
    vi.mocked(listNotes).mockResolvedValue(notes as any);
    const res = await app.inject({ method: 'GET', url: '/v1/notes' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('n1');
  });

  it('passes q query param to listNotes', async () => {
    vi.mocked(listNotes).mockResolvedValue([]);
    await app.inject({ method: 'GET', url: '/v1/notes?q=search' });
    expect(listNotes).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ query: 'search' }));
  });

  it('passes tag filter to listNotes', async () => {
    vi.mocked(listNotes).mockResolvedValue([]);
    await app.inject({ method: 'GET', url: '/v1/notes?tag=strategy' });
    expect(listNotes).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tag: 'strategy' }));
  });

  it('transforms isPinned string to boolean', async () => {
    vi.mocked(listNotes).mockResolvedValue([]);
    await app.inject({ method: 'GET', url: '/v1/notes?isPinned=true' });
    expect(listNotes).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ isPinned: true }));
  });
});

// ── POST /v1/notes ────────────────────────────────────────────────────────────

describe('POST /v1/notes', () => {
  it('creates a note and returns 200', async () => {
    const note = { id: 'n_new', title: 'New Note', body: '', tags: [], authorType: 'USER', authorId: 'u1', isPinned: false, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, slug: null };
    vi.mocked(createNote).mockResolvedValue(note as any);

    const res = await app.inject({
      method: 'POST', url: '/v1/notes',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New Note', body: 'Content', tags: ['test'] }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('n_new');
  });

  it('returns 400 for empty title', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/notes',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when title is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/notes',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /v1/notes/:noteId ─────────────────────────────────────────────────────

describe('GET /v1/notes/:noteId', () => {
  it('returns the note', async () => {
    const note = { id: 'n1', title: 'Found Note', body: '', tags: [] };
    vi.mocked(getNote).mockResolvedValue(note as any);

    const res = await app.inject({ method: 'GET', url: '/v1/notes/n1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('n1');
  });

  it('returns 404 when service throws "Note not found."', async () => {
    vi.mocked(getNote).mockRejectedValue(new Error('Note not found.'));
    const res = await app.inject({ method: 'GET', url: '/v1/notes/missing' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
  });
});

// ── PATCH /v1/notes/:noteId ───────────────────────────────────────────────────

describe('PATCH /v1/notes/:noteId', () => {
  it('updates a note and returns the updated note', async () => {
    const note = { id: 'n1', title: 'Updated' };
    vi.mocked(updateNote).mockResolvedValue(note as any);

    const res = await app.inject({
      method: 'PATCH', url: '/v1/notes/n1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).title).toBe('Updated');
  });

  it('passes noteId and body fields to updateNote', async () => {
    vi.mocked(updateNote).mockResolvedValue({ id: 'n1' } as any);

    await app.inject({
      method: 'PATCH', url: '/v1/notes/n1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New Title', tags: ['a'] }),
    });

    expect(updateNote).toHaveBeenCalledWith(expect.anything(), {
      noteId: 'n1', title: 'New Title', tags: ['a'],
    });
  });
});

// ── DELETE /v1/notes/:noteId ──────────────────────────────────────────────────

describe('DELETE /v1/notes/:noteId', () => {
  it('deletes a note and returns result', async () => {
    vi.mocked(deleteNote).mockResolvedValue({ deleted: true });
    const res = await app.inject({ method: 'DELETE', url: '/v1/notes/n1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
  });
});
