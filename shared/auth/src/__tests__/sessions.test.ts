import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// ── Mock @hq/db ───────────────────────────────────────────────────────────────

const mockDb = {
  session: {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock('@hq/db', () => ({ db: mockDb }));

const { createSession, getSessionUser, validateSession, revokeSession, revokeAllSessionsForUser, hashToken } =
  await import('../sessions.js');

beforeEach(() => {
  vi.clearAllMocks();
});

// ── hashToken ─────────────────────────────────────────────────────────────────

describe('hashToken', () => {
  it('returns SHA-256 hex of the input', () => {
    const expected = createHash('sha256').update('abc').digest('hex');
    expect(hashToken('abc')).toBe(expected);
  });
});

// ── createSession ─────────────────────────────────────────────────────────────

describe('createSession', () => {
  it('stores only the hashed token and returns the raw token', async () => {
    mockDb.session.create.mockResolvedValueOnce({});
    const token = await createSession('user-1', { ipAddress: '1.2.3.4', userAgent: 'ua' });

    expect(typeof token).toBe('string');
    expect(token).toHaveLength(64); // 32 bytes hex

    const call = mockDb.session.create.mock.calls[0][0];
    expect(call.data.userId).toBe('user-1');
    expect(call.data.tokenHash).toBe(hashToken(token));
    expect(call.data.ipAddress).toBe('1.2.3.4');
    expect(call.data.userAgent).toBe('ua');
    expect(call.data.expiresAt).toBeInstanceOf(Date);
    expect(call.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('honors a custom TTL', async () => {
    mockDb.session.create.mockResolvedValueOnce({});
    const before = Date.now();
    await createSession('user-1', { ttlMs: 60_000 });
    const call = mockDb.session.create.mock.calls[0][0];
    expect(call.data.expiresAt.getTime() - before).toBeLessThanOrEqual(61_000);
  });
});

// ── getSessionUser ────────────────────────────────────────────────────────────

describe('getSessionUser', () => {
  const activeUser = { id: 'u1', status: 'ACTIVE', deletedAt: null };

  it('returns the user for a valid session', async () => {
    mockDb.session.findUnique.mockResolvedValueOnce({
      id: 's1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    const user = await getSessionUser('raw');
    expect(user).toEqual(activeUser);
    expect(mockDb.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('raw') },
      include: { user: true },
    });
  });

  it('returns null when no session row matches', async () => {
    mockDb.session.findUnique.mockResolvedValueOnce(null);
    expect(await getSessionUser('raw')).toBeNull();
  });

  it('returns null when revoked', async () => {
    mockDb.session.findUnique.mockResolvedValueOnce({
      id: 's1',
      userId: 'u1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    expect(await getSessionUser('raw')).toBeNull();
  });

  it('returns null when expired', async () => {
    mockDb.session.findUnique.mockResolvedValueOnce({
      id: 's1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
      user: activeUser,
    });
    expect(await getSessionUser('raw')).toBeNull();
  });

  it('returns null when the user is inactive', async () => {
    mockDb.session.findUnique.mockResolvedValueOnce({
      id: 's1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', status: 'INACTIVE', deletedAt: null },
    });
    expect(await getSessionUser('raw')).toBeNull();
  });

  it('returns null when the user is soft-deleted', async () => {
    mockDb.session.findUnique.mockResolvedValueOnce({
      id: 's1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', status: 'ACTIVE', deletedAt: new Date() },
    });
    expect(await getSessionUser('raw')).toBeNull();
  });
});

// ── validateSession ───────────────────────────────────────────────────────────

describe('validateSession', () => {
  it('returns the session (with user) when valid', async () => {
    const session = {
      id: 's1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', status: 'ACTIVE', deletedAt: null },
    };
    mockDb.session.findUnique.mockResolvedValueOnce(session);
    expect(await validateSession('raw')).toBe(session);
  });
});

// ── revokeSession / revokeAllSessionsForUser ──────────────────────────────────

describe('revokeSession', () => {
  it('soft-revokes by token hash (sets revokedAt)', async () => {
    mockDb.session.updateMany.mockResolvedValueOnce({ count: 1 });
    await revokeSession('raw');
    const call = mockDb.session.updateMany.mock.calls[0][0];
    expect(call.where.tokenHash).toBe(hashToken('raw'));
    expect(call.where.revokedAt).toBeNull();
    expect(call.data.revokedAt).toBeInstanceOf(Date);
  });
});

describe('revokeAllSessionsForUser', () => {
  it('soft-revokes every live session for a user', async () => {
    mockDb.session.updateMany.mockResolvedValueOnce({ count: 3 });
    await revokeAllSessionsForUser('u1');
    expect(mockDb.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
