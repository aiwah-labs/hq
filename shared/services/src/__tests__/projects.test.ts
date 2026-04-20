import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listProjects,
  countProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectStats,
} from '../projects.js';
import type { ServiceContext } from '../context.js';
import type { BotPrincipal, UserPrincipal } from '@hq/auth/types';

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

const userActor: UserPrincipal = {
  kind: 'user', source: 'session',
  userId: 'user_1', email: 'u@test.com',
  dbRole: 'MEMBER', effectiveRole: 'MEMBER',
  isSuperadmin: false, scopes: [], permissions: workshopPerms,
};

const botActor: BotPrincipal = {
  kind: 'bot', source: 'apikey',
  apiKeyId: 'k1', botId: 'b1', botName: 'My Bot',
  scopes: ['project.read', 'project.write', 'project.delete'],
  permissions: noPerms,
};

const botNoPerms: BotPrincipal = { ...botActor, scopes: [] };

// ── Mock DB ───────────────────────────────────────────────────────────────────

const projectStore = new Map<string, any>();
let idCounter = 0;

function makeProject(overrides: Record<string, unknown> = {}) {
  const id = `proj_${++idCounter}`;
  return {
    id,
    name: 'Test Project',
    summary: null,
    status: 'PLANNED',
    priority: 'MEDIUM',
    ownerUserId: null,
    startDate: new Date(),
    targetDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const mockDb = {
  project: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    groupBy: vi.fn(),
  },
  task: {
    count: vi.fn(),
    groupBy: vi.fn(),
  },
} as any;

function makeCtx(actor: UserPrincipal | BotPrincipal): ServiceContext {
  return {
    actor,
    dbClient: mockDb,
    now: () => new Date('2025-01-01T00:00:00Z'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  projectStore.clear();
});

// ── listProjects ──────────────────────────────────────────────────────────────

describe('listProjects', () => {
  it('returns items and total for authorised user', async () => {
    const proj = makeProject();
    mockDb.project.findMany.mockResolvedValue([proj]);
    mockDb.project.count.mockResolvedValue(1);

    const result = await listProjects(makeCtx(userActor));
    expect(result).toEqual({ items: [proj], total: 1 });
  });

  it('denies bot without project.read scope', async () => {
    await expect(listProjects(makeCtx(botNoPerms))).rejects.toThrow("missing scope 'project.read'");
  });

  it('denies user without workshop.view permission', async () => {
    const restricted = { ...userActor, permissions: { ...noPerms } };
    await expect(listProjects(makeCtx(restricted))).rejects.toThrow("missing permission 'workshop.view'");
  });
});

// ── countProjects ─────────────────────────────────────────────────────────────

describe('countProjects', () => {
  it('returns count for authorised user', async () => {
    mockDb.project.count.mockResolvedValue(5);
    const result = await countProjects(makeCtx(userActor));
    expect(result).toBe(5);
  });

  it('denies bot without scope', async () => {
    await expect(countProjects(makeCtx(botNoPerms))).rejects.toThrow("missing scope 'project.read'");
  });
});

// ── getProject ────────────────────────────────────────────────────────────────

describe('getProject', () => {
  it('returns project when found', async () => {
    const proj = makeProject();
    mockDb.project.findUnique.mockResolvedValue(proj);
    const result = await getProject(makeCtx(userActor), proj.id);
    expect(result).toEqual(proj);
  });

  it('throws when not found', async () => {
    mockDb.project.findUnique.mockResolvedValue(null);
    await expect(getProject(makeCtx(userActor), 'missing')).rejects.toThrow('Project not found.');
  });
});

// ── createProject ─────────────────────────────────────────────────────────────

describe('createProject', () => {
  it('creates project with ownerUserId set for user actor', async () => {
    const proj = makeProject({ ownerUserId: 'user_1' });
    mockDb.project.create.mockResolvedValue(proj);

    const result = await createProject(makeCtx(userActor), { name: 'Test Project' });
    expect(result).toEqual(proj);
    const callData = mockDb.project.create.mock.calls[0][0].data;
    expect(callData.ownerUserId).toBe('user_1');
  });

  it('sets ownerUserId to null for bot actor', async () => {
    const proj = makeProject();
    mockDb.project.create.mockResolvedValue(proj);

    await createProject(makeCtx(botActor), { name: 'Test Project' });
    const callData = mockDb.project.create.mock.calls[0][0].data;
    expect(callData.ownerUserId).toBeNull();
  });

  it('throws on empty name', async () => {
    await expect(createProject(makeCtx(userActor), { name: '' })).rejects.toThrow('Name is required.');
  });

  it('throws on name too long', async () => {
    await expect(createProject(makeCtx(userActor), { name: 'x'.repeat(301) })).rejects.toThrow('Name must be 300 characters or fewer.');
  });

  it('denies bot without write scope', async () => {
    await expect(createProject(makeCtx(botNoPerms), { name: 'Test' })).rejects.toThrow("missing scope 'project.write'");
  });

  it('computes targetDate from targetInDays', async () => {
    const proj = makeProject();
    mockDb.project.create.mockResolvedValue(proj);

    await createProject(makeCtx(userActor), { name: 'Test', targetInDays: 30 });
    const callData = mockDb.project.create.mock.calls[0][0].data;
    const expectedDate = new Date('2025-01-31T00:00:00Z');
    expect(callData.targetDate?.getTime()).toBe(expectedDate.getTime());
  });
});

// ── updateProject ─────────────────────────────────────────────────────────────

describe('updateProject', () => {
  it('updates project fields', async () => {
    const proj = makeProject();
    const updated = { ...proj, status: 'ACTIVE' };
    mockDb.project.findUnique.mockResolvedValue(proj);
    mockDb.project.update.mockResolvedValue(updated);

    const result = await updateProject(makeCtx(userActor), { projectId: proj.id, status: 'ACTIVE' });
    expect(result.status).toBe('ACTIVE');
  });

  it('throws when project not found', async () => {
    mockDb.project.findUnique.mockResolvedValue(null);
    await expect(updateProject(makeCtx(userActor), { projectId: 'missing', name: 'New' })).rejects.toThrow('Project not found.');
  });

  it('throws when no fields provided', async () => {
    const proj = makeProject();
    mockDb.project.findUnique.mockResolvedValue(proj);
    await expect(updateProject(makeCtx(userActor), { projectId: proj.id })).rejects.toThrow('No fields provided to update.');
  });
});

// ── deleteProject ─────────────────────────────────────────────────────────────

describe('deleteProject', () => {
  it('deletes project and returns deleted: true', async () => {
    const proj = makeProject();
    mockDb.project.findUnique.mockResolvedValue(proj);
    mockDb.project.delete.mockResolvedValue(proj);

    const result = await deleteProject(makeCtx(userActor), proj.id);
    expect(result).toEqual({ deleted: true });
  });

  it('throws when not found', async () => {
    mockDb.project.findUnique.mockResolvedValue(null);
    await expect(deleteProject(makeCtx(userActor), 'missing')).rejects.toThrow('Project not found.');
  });

  it('denies bot without delete scope', async () => {
    await expect(deleteProject(makeCtx(botNoPerms), 'proj_1')).rejects.toThrow("missing scope 'project.delete'");
  });
});

// ── getProjectStats ───────────────────────────────────────────────────────────

describe('getProjectStats', () => {
  it('returns rolled-up stats', async () => {
    const proj = makeProject({ name: 'My Project', status: 'ACTIVE' });
    mockDb.project.findUnique.mockResolvedValue(proj);
    mockDb.task.count
      .mockResolvedValueOnce(10)  // total
      .mockResolvedValueOnce(4)   // done
      .mockResolvedValueOnce(2)   // blocked
      .mockResolvedValueOnce(1);  // overdue
    mockDb.task.groupBy.mockResolvedValue([
      { status: 'DONE', _count: { _all: 4 } },
      { status: 'TODO', _count: { _all: 4 } },
      { status: 'BLOCKED', _count: { _all: 2 } },
    ]);

    const result = await getProjectStats(makeCtx(userActor), proj.id);
    expect(result.counts).toEqual({ total: 10, done: 4, blocked: 2, overdue: 1 });
    expect(result.completion).toBe(0.4);
    expect(result.byStatus['DONE']).toBe(4);
  });

  it('throws when project not found', async () => {
    mockDb.project.findUnique.mockResolvedValue(null);
    await expect(getProjectStats(makeCtx(userActor), 'missing')).rejects.toThrow('Project not found.');
  });
});
