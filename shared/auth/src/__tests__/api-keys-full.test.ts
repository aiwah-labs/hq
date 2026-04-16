import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @hq/db ───────────────────────────────────────────────────────────

const mockDb = {
  apiKey: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  apiKeyEvent: {
    create: vi.fn(),
    createMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('@hq/db', () => ({
  db: mockDb,
  ApiKeyEventType: {
    CREATED: 'CREATED',
    AUTH_SUCCESS: 'AUTH_SUCCESS',
    AUTH_FAILURE: 'AUTH_FAILURE',
    REVOKED: 'REVOKED',
  },
  BotStatus: {
    ACTIVE: 'ACTIVE',
    ARCHIVED: 'ARCHIVED',
  },
}));

const { generateApiKey, createApiKey, validateApiKey, revokeApiKey } = await import('../api-keys.js');
const { BOT_SCOPES } = await import('../types.js');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_KEY_PEPPER = 'test-pepper';
});

// ── generateApiKey ───────────────────────────────────────────────────────────

describe('generateApiKey', () => {
  it('returns key with aiwah_ prefix', () => {
    const { key } = generateApiKey();
    expect(key).toMatch(/^aiwah_[a-f0-9]{12}_/);
  });

  it('returns a 12-char hex prefix', () => {
    const { prefix } = generateApiKey();
    expect(prefix).toMatch(/^[a-f0-9]{12}$/);
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateApiKey().key));
    expect(keys.size).toBe(20);
  });
});

// ── createApiKey ─────────────────────────────────────────────────────────────

describe('createApiKey', () => {
  it('creates an API key with hashed value in DB', async () => {
    mockDb.apiKey.create.mockResolvedValue({ id: 'key_1' });
    mockDb.apiKeyEvent.create.mockResolvedValue({});

    const result = await createApiKey({
      botId: 'bot_1',
      createdByUserId: 'user_1',
      name: 'Test Key',
      scopes: ['note.read', 'note.write'],
    });

    expect(result.id).toBe('key_1');
    expect(result.key).toMatch(/^aiwah_/);
    expect(result.prefix).toMatch(/^[a-f0-9]{12}$/);

    // Verify DB was called with hashed key (not raw)
    const createCall = mockDb.apiKey.create.mock.calls[0][0].data;
    expect(createCall.keyHash).not.toContain('aiwah_');
    expect(createCall.keyHash.startsWith('$2')).toBe(true); // bcrypt hash
    expect(createCall.botId).toBe('bot_1');
    expect(createCall.scopes).toEqual(['note.read', 'note.write']);
  });

  it('logs a CREATED event', async () => {
    mockDb.apiKey.create.mockResolvedValue({ id: 'key_2' });
    mockDb.apiKeyEvent.create.mockResolvedValue({});

    await createApiKey({
      botId: 'bot_1',
      createdByUserId: 'user_1',
      name: 'Test',
    });

    expect(mockDb.apiKeyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        apiKeyId: 'key_2',
        eventType: 'CREATED',
      }),
    });
  });

  it('filters invalid scopes', async () => {
    mockDb.apiKey.create.mockResolvedValue({ id: 'key_3' });
    mockDb.apiKeyEvent.create.mockResolvedValue({});

    await createApiKey({
      botId: 'bot_1',
      createdByUserId: 'user_1',
      name: 'Test',
      scopes: ['note.read', 'INVALID_SCOPE' as any],
    });

    const scopes = mockDb.apiKey.create.mock.calls[0][0].data.scopes;
    expect(scopes).toEqual(['note.read']);
  });

  it('deduplicates scopes', async () => {
    mockDb.apiKey.create.mockResolvedValue({ id: 'key_4' });
    mockDb.apiKeyEvent.create.mockResolvedValue({});

    await createApiKey({
      botId: 'bot_1',
      createdByUserId: 'user_1',
      name: 'Test',
      scopes: ['note.read', 'note.read', 'note.write'],
    });

    const scopes = mockDb.apiKey.create.mock.calls[0][0].data.scopes;
    expect(scopes).toEqual(['note.read', 'note.write']);
  });
});

// ── validateApiKey ───────────────────────────────────────────────────────────

describe('validateApiKey', () => {
  it('returns null for undefined key', async () => {
    expect(await validateApiKey(undefined)).toBeNull();
  });

  it('returns null for null key', async () => {
    expect(await validateApiKey(null)).toBeNull();
  });

  it('returns null for non-aiwah key', async () => {
    expect(await validateApiKey('sk_test_abc')).toBeNull();
  });

  it('returns null when no candidates found', async () => {
    mockDb.apiKey.findMany.mockResolvedValue([]);
    expect(await validateApiKey('aiwah_abcdef012345_secret')).toBeNull();
  });

  it('returns null when hash does not match', async () => {
    mockDb.apiKey.findMany.mockResolvedValue([{
      id: 'key_1',
      keyHash: '$2a$12$invalidhash000000000000000000000000000000000000000',
      bot: { status: 'ACTIVE', archivedAt: null },
      createdByUser: { email: 'a@b.com' },
    }]);
    mockDb.apiKeyEvent.createMany.mockResolvedValue({});

    const result = await validateApiKey('aiwah_abcdef012345_wrongsecret');
    expect(result).toBeNull();
    expect(mockDb.apiKeyEvent.createMany).toHaveBeenCalled();
  });

  it('returns null when bot is not active', async () => {
    // First create a real key so we can match the hash
    const bcrypt = await import('bcryptjs');
    const raw = 'aiwah_abcdef012345_testsecret123456789012';
    const hash = await bcrypt.hash(`${raw}.test-pepper`, 12);

    mockDb.apiKey.findMany.mockResolvedValue([{
      id: 'key_1',
      keyHash: hash,
      bot: { status: 'ARCHIVED', archivedAt: new Date() },
      createdByUser: { email: 'a@b.com' },
    }]);
    mockDb.apiKeyEvent.create.mockResolvedValue({});

    const result = await validateApiKey(raw);
    expect(result).toBeNull();
    expect(mockDb.apiKeyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'AUTH_FAILURE',
        detail: 'bot_not_active',
      }),
    });
  });

  it('returns the candidate and logs AUTH_SUCCESS on valid key', async () => {
    const bcrypt = await import('bcryptjs');
    const raw = 'aiwah_abcdef012345_validsecret12345678901';
    const hash = await bcrypt.hash(`${raw}.test-pepper`, 4); // low rounds for speed

    const candidate = {
      id: 'key_ok',
      keyHash: hash,
      botId: 'bot_1',
      bot: { status: 'ACTIVE', archivedAt: null, slug: 'my-bot', name: 'My Bot' },
      createdByUserId: 'u1',
      createdByUser: { email: 'a@b.com' },
      scopes: ['note.read'],
    };
    mockDb.apiKey.findMany.mockResolvedValue([candidate]);
    mockDb.$transaction.mockResolvedValue([]);

    const result = await validateApiKey(raw, { ipAddress: '1.2.3.4', userAgent: 'test' });
    expect(result).toBe(candidate);
    expect(mockDb.$transaction).toHaveBeenCalledOnce();
  });
});

// ── revokeApiKey ─────────────────────────────────────────────────────────────

describe('revokeApiKey', () => {
  it('sets revokedAt and logs event', async () => {
    mockDb.apiKey.updateMany.mockResolvedValue({ count: 1 });
    mockDb.apiKeyEvent.create.mockResolvedValue({});

    await revokeApiKey('key_1');

    expect(mockDb.apiKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'key_1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockDb.apiKeyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        apiKeyId: 'key_1',
        eventType: 'REVOKED',
      }),
    });
  });

  it('does not log event if key was already revoked', async () => {
    mockDb.apiKey.updateMany.mockResolvedValue({ count: 0 });

    await revokeApiKey('already_revoked');

    expect(mockDb.apiKeyEvent.create).not.toHaveBeenCalled();
  });
});

// ── Pepper handling ──────────────────────────────────────────────────────────

describe('API key pepper', () => {
  it('throws in production when API_KEY_PEPPER is not set', async () => {
    const origPepper = process.env.API_KEY_PEPPER;
    const origEnv = process.env.NODE_ENV;
    delete process.env.API_KEY_PEPPER;
    process.env.NODE_ENV = 'production';

    mockDb.apiKey.create.mockResolvedValue({ id: 'key_x' });
    mockDb.apiKeyEvent.create.mockResolvedValue({});

    await expect(createApiKey({
      botId: 'bot_1',
      createdByUserId: 'user_1',
      name: 'Test',
    })).rejects.toThrow('API_KEY_PEPPER is required in production');

    process.env.API_KEY_PEPPER = origPepper;
    process.env.NODE_ENV = origEnv;
  });

  it('uses dev default pepper when not in production', async () => {
    const origPepper = process.env.API_KEY_PEPPER;
    delete process.env.API_KEY_PEPPER;
    process.env.NODE_ENV = 'test';

    mockDb.apiKey.create.mockResolvedValue({ id: 'key_dev' });
    mockDb.apiKeyEvent.create.mockResolvedValue({});

    // Should not throw — uses dev default pepper
    const result = await createApiKey({
      botId: 'bot_1',
      createdByUserId: 'user_1',
      name: 'Dev Key',
    });
    expect(result.id).toBe('key_dev');

    process.env.API_KEY_PEPPER = origPepper;
  });
});

// ── BOT_SCOPES contract tests ────────────────────────────────────────────────

describe('BOT_SCOPES', () => {
  const scopes = BOT_SCOPES as readonly string[];

  it('has no duplicate scopes', () => {
    expect(new Set(scopes).size).toBe(scopes.length);
  });

  it('all scopes follow namespace.action pattern', () => {
    for (const scope of scopes) {
      expect(scope).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });

  it('includes required CRM scopes', () => {
    for (const ns of ['company', 'contact', 'campaign', 'prospect']) {
      expect(scopes).toContain(`${ns}.read`);
      expect(scopes).toContain(`${ns}.write`);
    }
  });

  it('includes note scopes', () => {
    expect(scopes).toContain('note.read');
    expect(scopes).toContain('note.write');
    expect(scopes).toContain('note.delete');
  });

  it('includes workflow scopes', () => {
    expect(scopes).toContain('workflow.read');
    expect(scopes).toContain('workflow.execute');
  });

  it('includes integration.execute', () => {
    expect(scopes).toContain('integration.execute');
  });
});
