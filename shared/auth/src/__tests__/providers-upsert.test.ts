import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @hq/db ───────────────────────────────────────────────────────────────

const mockDb = {
  identityAccount: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('@hq/db', () => ({ db: mockDb }));

const { upsertUserFromIdentity } = await import('../providers/upsert.js');
import type { AuthenticatedIdentity, UpsertOptions } from '../providers/types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseOpts: UpsertOptions = {
  allowAutoProvision: true,
  defaultRole: 'MEMBER',
  adminEmails: [],
  adminGroups: [],
  allowedDomains: [],
};

function makeIdentity(overrides: Partial<AuthenticatedIdentity> = {}): AuthenticatedIdentity {
  return {
    providerId: 'google',
    providerType: 'oidc',
    subject: 'google|abc',
    email: 'user@example.com',
    name: 'User',
    rawProfile: { sub: 'google|abc', email: 'user@example.com' },
    groups: ['hq-members'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Existing identity → reuse user ────────────────────────────────────────────

describe('existing IdentityAccount', () => {
  it('returns the linked user without auto-provisioning', async () => {
    mockDb.identityAccount.findFirst.mockResolvedValueOnce({
      id: 'ia-1',
      userId: 'u-1',
      user: { id: 'u-1', status: 'ACTIVE', deletedAt: null },
    });
    mockDb.identityAccount.update.mockResolvedValueOnce({});

    const result = await upsertUserFromIdentity(makeIdentity(), baseOpts);

    expect(result).toEqual({ kind: 'ok', userId: 'u-1', created: false });
    expect(mockDb.identityAccount.update).toHaveBeenCalledWith({
      where: { id: 'ia-1' },
      data: { email: 'user@example.com', rawProfile: expect.anything() },
    });
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });

  it('denies when the linked user is inactive', async () => {
    mockDb.identityAccount.findFirst.mockResolvedValueOnce({
      id: 'ia-1',
      userId: 'u-1',
      user: { id: 'u-1', status: 'INACTIVE', deletedAt: null },
    });
    const result = await upsertUserFromIdentity(makeIdentity(), baseOpts);
    expect(result).toEqual({ kind: 'denied', reason: 'inactive' });
  });

  it('denies when the linked user is soft-deleted', async () => {
    mockDb.identityAccount.findFirst.mockResolvedValueOnce({
      id: 'ia-1',
      userId: 'u-1',
      user: { id: 'u-1', status: 'ACTIVE', deletedAt: new Date() },
    });
    const result = await upsertUserFromIdentity(makeIdentity(), baseOpts);
    expect(result).toEqual({ kind: 'denied', reason: 'inactive' });
  });
});

// ── Email match → link identity ───────────────────────────────────────────────

describe('email match', () => {
  beforeEach(() => {
    mockDb.identityAccount.findFirst.mockResolvedValueOnce(null);
  });

  it('links an OIDC identity to an existing local user', async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({ id: 'u-2', status: 'ACTIVE', deletedAt: null });
    mockDb.identityAccount.create.mockResolvedValueOnce({});

    const result = await upsertUserFromIdentity(makeIdentity(), baseOpts);

    expect(result).toEqual({ kind: 'ok', userId: 'u-2', created: false });
    expect(mockDb.identityAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-2',
        provider: 'OIDC',
        providerId: 'google',
        subject: 'google|abc',
      }),
    });
  });

  it('does not create an IdentityAccount for local-provider matches', async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({ id: 'u-2', status: 'ACTIVE', deletedAt: null });

    const result = await upsertUserFromIdentity(
      makeIdentity({ providerType: 'local', providerId: 'local', subject: 'local:u-2' }),
      baseOpts,
    );
    expect(result).toEqual({ kind: 'ok', userId: 'u-2', created: false });
    expect(mockDb.identityAccount.create).not.toHaveBeenCalled();
  });

  it('denies an inactive matched user', async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({ id: 'u-2', status: 'INACTIVE', deletedAt: null });
    const result = await upsertUserFromIdentity(makeIdentity(), baseOpts);
    expect(result).toEqual({ kind: 'denied', reason: 'inactive' });
  });
});

// ── Auto-provision ────────────────────────────────────────────────────────────

describe('auto-provision', () => {
  beforeEach(() => {
    mockDb.identityAccount.findFirst.mockResolvedValueOnce(null);
    mockDb.user.findUnique.mockResolvedValueOnce(null);
  });

  it('creates a new User + IdentityAccount when auto-provision is on', async () => {
    mockDb.user.create.mockResolvedValueOnce({ id: 'u-new' });
    mockDb.identityAccount.create.mockResolvedValueOnce({});

    const result = await upsertUserFromIdentity(makeIdentity(), baseOpts);

    expect(result).toEqual({ kind: 'ok', userId: 'u-new', created: true });
    expect(mockDb.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'user@example.com',
        role: 'MEMBER',
        status: 'ACTIVE',
        passwordHash: null,
      }),
    });
    expect(mockDb.identityAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-new',
        provider: 'OIDC',
        providerId: 'google',
      }),
    });
  });

  it('promotes to ADMIN when email matches AUTH_ADMIN_EMAILS', async () => {
    mockDb.user.create.mockResolvedValueOnce({ id: 'u-new' });
    mockDb.identityAccount.create.mockResolvedValueOnce({});

    await upsertUserFromIdentity(makeIdentity(), {
      ...baseOpts,
      adminEmails: ['user@example.com'],
    });
    expect(mockDb.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'ADMIN' }) }),
    );
  });

  it('promotes to ADMIN when a group matches AUTH_ADMIN_GROUPS', async () => {
    mockDb.user.create.mockResolvedValueOnce({ id: 'u-new' });
    mockDb.identityAccount.create.mockResolvedValueOnce({});

    await upsertUserFromIdentity(
      makeIdentity({ groups: ['hq-admins'] }),
      { ...baseOpts, adminGroups: ['hq-admins'] },
    );
    expect(mockDb.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'ADMIN' }) }),
    );
  });

  it('denies when auto-provision is disabled', async () => {
    const result = await upsertUserFromIdentity(makeIdentity(), { ...baseOpts, allowAutoProvision: false });
    expect(result).toEqual({ kind: 'denied', reason: 'no_auto_provision' });
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });

  it('denies when email domain is not in AUTH_OIDC_ALLOWED_DOMAINS', async () => {
    const result = await upsertUserFromIdentity(makeIdentity({ email: 'user@other.com' }), {
      ...baseOpts,
      allowedDomains: ['example.com'],
    });
    expect(result).toEqual({ kind: 'denied', reason: 'domain' });
  });

  it('allows when email domain is in the list (case-insensitive)', async () => {
    mockDb.user.create.mockResolvedValueOnce({ id: 'u-new' });
    mockDb.identityAccount.create.mockResolvedValueOnce({});

    const result = await upsertUserFromIdentity(makeIdentity({ email: 'user@Example.com' }), {
      ...baseOpts,
      allowedDomains: ['EXAMPLE.COM'],
    });
    expect(result.kind).toBe('ok');
  });
});
