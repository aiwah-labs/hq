import { describe, it, expect } from 'vitest';
import {
  isUserPrincipal,
  isBotPrincipal,
  isAgentPrincipal,
  assertUserPrincipal,
  assertBotPrincipal,
  hasScope,
  assertScope,
} from '../principals.js';
import type { UserPrincipal, BotPrincipal, AgentPrincipal } from '../types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const allPerms = {
  'workshop.view': true,
  'content.all': true,
  'settings.view': true,
  'users.view': true,
  'users.manage': true,
  'admin.surface': true,
  'bots.view': true,
  'bots.create': true,
  'bots.manage.any': true,
  'messaging.view': true,
} as const;

const noPerms = Object.fromEntries(Object.keys(allPerms).map((k) => [k, false])) as typeof allPerms;

const userPrincipal: UserPrincipal = {
  kind: 'user',
  source: 'session',
  userId: 'user_1',
  email: 'admin@example.com',
  dbRole: 'ADMIN',
  effectiveRole: 'ADMIN',
  isSuperadmin: false,
  scopes: ['content.read', 'messaging.read'],
  permissions: allPerms,
};

const botPrincipal: BotPrincipal = {
  kind: 'bot',
  source: 'apikey',
  apiKeyId: 'key_1',
  botId: 'bot_1',
  botSlug: 'my-bot',
  botName: 'My Bot',
  createdByUserId: 'user_1',
  createdByEmail: 'admin@example.com',
  scopes: ['note.read', 'note.write'],
  permissions: noPerms,
};

const agentPrincipal: AgentPrincipal = {
  kind: 'agent',
  source: 'internal',
  agentKey: 'workshop-assistant',
  agentName: 'Workshop Assistant',
  scopes: ['company.read', 'messaging.write'],
  permissions: noPerms,
};

// ── Type guard tests ──────────────────────────────────────────────────────────

describe('isUserPrincipal', () => {
  it('returns true for user principals', () => {
    expect(isUserPrincipal(userPrincipal)).toBe(true);
  });

  it('returns false for bot principals', () => {
    expect(isUserPrincipal(botPrincipal)).toBe(false);
  });

  it('returns false for agent principals', () => {
    expect(isUserPrincipal(agentPrincipal)).toBe(false);
  });
});

describe('isBotPrincipal', () => {
  it('returns true for bot principals', () => {
    expect(isBotPrincipal(botPrincipal)).toBe(true);
  });

  it('returns false for user principals', () => {
    expect(isBotPrincipal(userPrincipal)).toBe(false);
  });

  it('returns false for agent principals', () => {
    expect(isBotPrincipal(agentPrincipal)).toBe(false);
  });
});

describe('isAgentPrincipal', () => {
  it('returns true for agent principals', () => {
    expect(isAgentPrincipal(agentPrincipal)).toBe(true);
  });

  it('returns false for user principals', () => {
    expect(isAgentPrincipal(userPrincipal)).toBe(false);
  });

  it('returns false for bot principals', () => {
    expect(isAgentPrincipal(botPrincipal)).toBe(false);
  });
});

// ── Assertion tests ───────────────────────────────────────────────────────────

describe('assertUserPrincipal', () => {
  it('returns the principal when it is a user', () => {
    const result = assertUserPrincipal(userPrincipal);
    expect(result).toBe(userPrincipal);
  });

  it('throws with clear message for bot principals', () => {
    expect(() => assertUserPrincipal(botPrincipal)).toThrow(
      'Forbidden: endpoint requires a user principal.'
    );
  });

  it('throws for agent principals', () => {
    expect(() => assertUserPrincipal(agentPrincipal)).toThrow(
      'Forbidden: endpoint requires a user principal.'
    );
  });
});

describe('assertBotPrincipal', () => {
  it('returns the principal when it is a bot', () => {
    const result = assertBotPrincipal(botPrincipal);
    expect(result).toBe(botPrincipal);
  });

  it('throws with clear message for user principals', () => {
    expect(() => assertBotPrincipal(userPrincipal)).toThrow(
      'Forbidden: endpoint requires a bot principal.'
    );
  });
});

// ── Scope tests ───────────────────────────────────────────────────────────────

describe('hasScope', () => {
  it('returns true when principal has the scope', () => {
    expect(hasScope(userPrincipal, 'content.read')).toBe(true);
    expect(hasScope(botPrincipal, 'note.read')).toBe(true);
    expect(hasScope(agentPrincipal, 'company.read')).toBe(true);
  });

  it('returns false when principal does not have the scope', () => {
    expect(hasScope(userPrincipal, 'note.delete')).toBe(false);
    expect(hasScope(botPrincipal, 'company.read')).toBe(false);
    expect(hasScope(agentPrincipal, 'note.write')).toBe(false);
  });

  it('returns false for empty scopes array', () => {
    const emptyBot: BotPrincipal = { ...botPrincipal, scopes: [] };
    expect(hasScope(emptyBot, 'note.read')).toBe(false);
  });
});

describe('assertScope', () => {
  it('does not throw when scope is present', () => {
    expect(() => assertScope(botPrincipal, 'note.read')).not.toThrow();
  });

  it('throws with scope name in message', () => {
    expect(() => assertScope(botPrincipal, 'company.delete')).toThrow(
      "Forbidden: missing scope 'company.delete'."
    );
  });

  it('throws the exact missing scope name', () => {
    expect(() => assertScope(agentPrincipal, 'note.delete')).toThrow("missing scope 'note.delete'");
  });
});
