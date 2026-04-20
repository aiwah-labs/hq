import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listTasks,
  countTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  assignTask,
  markTaskBlocked,
  listBlockedTasks,
  listOverdueTasks,
} from '../tasks.js';
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
  scopes: ['task.read', 'task.write', 'task.delete'],
  permissions: noPerms,
};

const botNoPerms: BotPrincipal = { ...botActor, scopes: [] };

// ── Mock DB ───────────────────────────────────────────────────────────────────

let idCounter = 0;

function makeTask(overrides: Record<string, unknown> = {}) {
  const id = `task_${++idCounter}`;
  return {
    id,
    title: 'Test Task',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    projectId: 'proj_1',
    assigneeUserId: null,
    dueAt: null,
    blockedReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj_1',
    name: 'Test Project',
    status: 'ACTIVE',
    ...overrides,
  };
}

const mockDb = {
  task: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  inboxItem: {
    create: vi.fn(),
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
});

// ── listTasks ─────────────────────────────────────────────────────────────────

describe('listTasks', () => {
  it('returns items and total for authorised user', async () => {
    const task = makeTask();
    mockDb.task.findMany.mockResolvedValue([task]);
    mockDb.task.count.mockResolvedValue(1);

    const result = await listTasks(makeCtx(userActor));
    expect(result).toEqual({ items: [task], total: 1 });
  });

  it('denies bot without task.read scope', async () => {
    await expect(listTasks(makeCtx(botNoPerms))).rejects.toThrow("missing scope 'task.read'");
  });

  it('denies user without workshop.view', async () => {
    const restricted = { ...userActor, permissions: { ...noPerms } };
    await expect(listTasks(makeCtx(restricted))).rejects.toThrow("missing permission 'workshop.view'");
  });
});

// ── countTasks ────────────────────────────────────────────────────────────────

describe('countTasks', () => {
  it('returns count', async () => {
    mockDb.task.count.mockResolvedValue(3);
    const result = await countTasks(makeCtx(userActor));
    expect(result).toBe(3);
  });

  it('denies bot without scope', async () => {
    await expect(countTasks(makeCtx(botNoPerms))).rejects.toThrow("missing scope 'task.read'");
  });
});

// ── getTask ───────────────────────────────────────────────────────────────────

describe('getTask', () => {
  it('returns task when found', async () => {
    const task = makeTask();
    mockDb.task.findUnique.mockResolvedValue(task);
    const result = await getTask(makeCtx(userActor), task.id);
    expect(result).toEqual(task);
  });

  it('throws when not found', async () => {
    mockDb.task.findUnique.mockResolvedValue(null);
    await expect(getTask(makeCtx(userActor), 'missing')).rejects.toThrow('Task not found.');
  });
});

// ── createTask ────────────────────────────────────────────────────────────────

describe('createTask', () => {
  it('creates task in a valid project', async () => {
    const task = makeTask();
    mockDb.project.findUnique.mockResolvedValue(makeProject());
    mockDb.task.create.mockResolvedValue(task);

    const result = await createTask(makeCtx(userActor), { projectId: 'proj_1', title: 'Test Task' });
    expect(result).toEqual(task);
    expect(mockDb.inboxItem.create).not.toHaveBeenCalled();
  });

  it('sends inbox notification when assignee provided', async () => {
    const task = makeTask({ assigneeUserId: 'user_2' });
    mockDb.project.findUnique.mockResolvedValue(makeProject());
    mockDb.task.create.mockResolvedValue(task);
    mockDb.inboxItem.create.mockResolvedValue({});

    await createTask(makeCtx(userActor), { projectId: 'proj_1', title: 'Test Task', assigneeUserId: 'user_2' });
    expect(mockDb.inboxItem.create).toHaveBeenCalledOnce();
    const inboxData = mockDb.inboxItem.create.mock.calls[0][0].data;
    expect(inboxData.recipientUserId).toBe('user_2');
    expect(inboxData.type).toBe('task_assigned');
  });

  it('throws on empty title', async () => {
    await expect(createTask(makeCtx(userActor), { projectId: 'proj_1', title: '' })).rejects.toThrow('Title is required.');
  });

  it('throws when project not found', async () => {
    mockDb.project.findUnique.mockResolvedValue(null);
    await expect(createTask(makeCtx(userActor), { projectId: 'bad_proj', title: 'Task' })).rejects.toThrow('Project not found.');
  });

  it('denies bot without write scope', async () => {
    await expect(createTask(makeCtx(botNoPerms), { projectId: 'proj_1', title: 'Task' })).rejects.toThrow("missing scope 'task.write'");
  });

  it('computes dueAt from dueInDays', async () => {
    const task = makeTask();
    mockDb.project.findUnique.mockResolvedValue(makeProject());
    mockDb.task.create.mockResolvedValue(task);

    await createTask(makeCtx(userActor), { projectId: 'proj_1', title: 'Task', dueInDays: 7 });
    const callData = mockDb.task.create.mock.calls[0][0].data;
    const expectedDate = new Date('2025-01-08T00:00:00Z');
    expect(callData.dueAt?.getTime()).toBe(expectedDate.getTime());
  });
});

// ── updateTask ────────────────────────────────────────────────────────────────

describe('updateTask', () => {
  it('updates task fields', async () => {
    const task = makeTask();
    const updated = { ...task, status: 'IN_PROGRESS' };
    mockDb.task.findUnique.mockResolvedValue(task);
    mockDb.task.update.mockResolvedValue(updated);

    const result = await updateTask(makeCtx(userActor), { taskId: task.id, status: 'IN_PROGRESS' });
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('throws when not found', async () => {
    mockDb.task.findUnique.mockResolvedValue(null);
    await expect(updateTask(makeCtx(userActor), { taskId: 'missing', title: 'New' })).rejects.toThrow('Task not found.');
  });

  it('throws when no fields provided', async () => {
    const task = makeTask();
    mockDb.task.findUnique.mockResolvedValue(task);
    await expect(updateTask(makeCtx(userActor), { taskId: task.id })).rejects.toThrow('No fields provided to update.');
  });
});

// ── deleteTask ────────────────────────────────────────────────────────────────

describe('deleteTask', () => {
  it('deletes task and returns deleted: true', async () => {
    const task = makeTask();
    mockDb.task.findUnique.mockResolvedValue(task);
    mockDb.task.delete.mockResolvedValue(task);

    const result = await deleteTask(makeCtx(userActor), task.id);
    expect(result).toEqual({ deleted: true });
  });

  it('throws when not found', async () => {
    mockDb.task.findUnique.mockResolvedValue(null);
    await expect(deleteTask(makeCtx(userActor), 'missing')).rejects.toThrow('Task not found.');
  });

  it('denies bot without delete scope', async () => {
    await expect(deleteTask(makeCtx(botNoPerms), 'task_1')).rejects.toThrow("missing scope 'task.delete'");
  });
});

// ── completeTask ──────────────────────────────────────────────────────────────

describe('completeTask', () => {
  it('sets status to DONE and clears blockedReason', async () => {
    const task = makeTask({ status: 'IN_PROGRESS' });
    const completed = { ...task, status: 'DONE', blockedReason: null };
    mockDb.task.findUnique.mockResolvedValue(task);
    mockDb.task.update.mockResolvedValue(completed);

    const result = await completeTask(makeCtx(userActor), task.id);
    expect(result.status).toBe('DONE');
    const updateData = mockDb.task.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('DONE');
    expect(updateData.blockedReason).toBeNull();
  });

  it('throws when not found', async () => {
    mockDb.task.findUnique.mockResolvedValue(null);
    await expect(completeTask(makeCtx(userActor), 'missing')).rejects.toThrow('Task not found.');
  });
});

// ── assignTask ────────────────────────────────────────────────────────────────

describe('assignTask', () => {
  it('assigns task and sends inbox notification', async () => {
    const task = makeTask({ project: { id: 'proj_1', name: 'Test Project' } });
    mockDb.user.findUnique.mockResolvedValue({ id: 'user_2', email: 'b@test.com', name: 'User B' });
    mockDb.task.update.mockResolvedValue(task);
    mockDb.inboxItem.create.mockResolvedValue({});

    await assignTask(makeCtx(userActor), task.id, 'user_2');
    expect(mockDb.inboxItem.create).toHaveBeenCalledOnce();
  });

  it('clears assignee without sending notification when null', async () => {
    const task = makeTask();
    mockDb.task.update.mockResolvedValue(task);

    await assignTask(makeCtx(userActor), task.id, null);
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
    expect(mockDb.inboxItem.create).not.toHaveBeenCalled();
  });

  it('throws when assignee user not found', async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    await expect(assignTask(makeCtx(userActor), 'task_1', 'bad_user')).rejects.toThrow('User not found.');
  });
});

// ── markTaskBlocked ───────────────────────────────────────────────────────────

describe('markTaskBlocked', () => {
  it('sets status to BLOCKED with reason', async () => {
    const task = makeTask({ assigneeUserId: null });
    const blocked = { ...task, status: 'BLOCKED', blockedReason: 'Waiting on design' };
    mockDb.task.findUnique.mockResolvedValue(task);
    mockDb.task.update.mockResolvedValue(blocked);

    const result = await markTaskBlocked(makeCtx(userActor), task.id, 'Waiting on design');
    expect(result.status).toBe('BLOCKED');
  });

  it('sends inbox notification to assignee when set', async () => {
    const task = makeTask({ assigneeUserId: 'user_2' });
    mockDb.task.findUnique.mockResolvedValue(task);
    mockDb.task.update.mockResolvedValue(task);
    mockDb.inboxItem.create.mockResolvedValue({});

    await markTaskBlocked(makeCtx(userActor), task.id, 'Blocked reason');
    expect(mockDb.inboxItem.create).toHaveBeenCalledOnce();
    const inboxData = mockDb.inboxItem.create.mock.calls[0][0].data;
    expect(inboxData.type).toBe('task_blocked');
  });

  it('throws when not found', async () => {
    mockDb.task.findUnique.mockResolvedValue(null);
    await expect(markTaskBlocked(makeCtx(userActor), 'missing', 'reason')).rejects.toThrow('Task not found.');
  });
});

// ── listBlockedTasks ──────────────────────────────────────────────────────────

describe('listBlockedTasks', () => {
  it('returns blocked tasks', async () => {
    const task = makeTask({ status: 'BLOCKED' });
    mockDb.task.findMany.mockResolvedValue([task]);

    const result = await listBlockedTasks(makeCtx(userActor));
    expect(result).toEqual([task]);
    const whereArg = mockDb.task.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe('BLOCKED');
  });
});

// ── listOverdueTasks ──────────────────────────────────────────────────────────

describe('listOverdueTasks', () => {
  it('returns overdue tasks', async () => {
    const task = makeTask({ dueAt: new Date('2024-12-01') });
    mockDb.task.findMany.mockResolvedValue([task]);

    const result = await listOverdueTasks(makeCtx(userActor));
    expect(result).toEqual([task]);
    const whereArg = mockDb.task.findMany.mock.calls[0][0].where;
    expect(whereArg.dueAt.lt).toBeDefined();
  });
});
