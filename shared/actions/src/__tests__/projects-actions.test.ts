import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @hq/objects so importing registry doesn't try to load a real DB.
vi.mock('@hq/objects', () => ({
  objects: {},
  objectList: vi.fn(),
  objectGet: vi.fn(),
  objectCreate: vi.fn(),
  objectUpdate: vi.fn(),
  objectDelete: vi.fn(),
  objectBulkUpdate: vi.fn(),
  objectBulkDelete: vi.fn(),
  objectCount: vi.fn(),
}));

// Pull in the registry to access the action definitions after the imports
// below register them.
const { actionRegistry } = await import('../registry.js');

// Register the project/task custom actions under test.
await import('../custom/projects/index.js');

function mkCtx(dbOverrides: Record<string, unknown> = {}) {
  return {
    db: {
      project: {
        findUniqueOrThrow: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      task: {
        count: vi.fn(),
        groupBy: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUniqueOrThrow: vi.fn(),
      },
      inboxItem: {
        create: vi.fn(),
      },
      ...dbOverrides,
    },
    principal: { type: 'user', id: 'u1' },
  } as any;
}

describe('project.stats', () => {
  it('rolls up counts and completion for a project', async () => {
    const action = actionRegistry.get('project.stats')!;
    expect(action).toBeDefined();
    expect(action.scopes).toContain('project.read');

    const ctx = mkCtx();
    ctx.db.project.findUniqueOrThrow.mockResolvedValue({ id: 'p1', name: 'P1', status: 'ACTIVE' });
    ctx.db.task.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(4) // done
      .mockResolvedValueOnce(2) // blocked
      .mockResolvedValueOnce(1); // overdue
    ctx.db.task.groupBy.mockResolvedValue([
      { status: 'TODO', _count: { _all: 3 } },
      { status: 'DONE', _count: { _all: 4 } },
    ]);

    const out: any = await action.handler({ projectId: 'p1' }, ctx);

    expect(out.projectId).toBe('p1');
    expect(out.counts).toEqual({ total: 10, done: 4, blocked: 2, overdue: 1 });
    expect(out.completion).toBeCloseTo(0.4);
    expect(out.byStatus).toEqual({ TODO: 3, DONE: 4 });
  });
});

describe('project.summarize', () => {
  it('builds a markdown summary with sections', async () => {
    const action = actionRegistry.get('project.summarize')!;
    const ctx = mkCtx();
    ctx.db.project.findUniqueOrThrow.mockResolvedValue({
      id: 'p1',
      name: 'Launch',
      summary: 'Top line goal.',
      status: 'ACTIVE',
      priority: 'HIGH',
      owner: { id: 'u1', name: 'Alice', email: 'a@x' },
      targetDate: new Date('2026-05-01T00:00:00Z'),
    });
    // findMany: tasks (for total/done), blocked, overdue, upcoming
    ctx.db.task.findMany
      .mockResolvedValueOnce([
        { status: 'DONE' },
        { status: 'DONE' },
        { status: 'TODO' },
        { status: 'IN_PROGRESS' },
      ])
      .mockResolvedValueOnce([{ title: 'Waiting on DNS', blockedReason: 'DNS change' }])
      .mockResolvedValueOnce([{ title: 'Latency alerts', dueAt: new Date('2026-04-01T00:00:00Z') }])
      .mockResolvedValueOnce([{ title: 'Write runbook', dueAt: new Date('2026-04-20T00:00:00Z') }]);

    const out: any = await action.handler({ projectId: 'p1', lookaheadDays: 7 }, ctx);

    expect(out.projectId).toBe('p1');
    expect(out.counts.total).toBe(4);
    expect(out.counts.done).toBe(2);
    expect(out.completionPct).toBe(50);
    expect(out.summary).toContain('# Launch');
    expect(out.summary).toContain('Status: **ACTIVE**');
    expect(out.summary).toContain('## Blocked');
    expect(out.summary).toContain('## Overdue');
    expect(out.summary).toContain('## Upcoming');
    expect(out.summary).toContain('Waiting on DNS');
  });

  it('handles empty projects without sections', async () => {
    const action = actionRegistry.get('project.summarize')!;
    const ctx = mkCtx();
    ctx.db.project.findUniqueOrThrow.mockResolvedValue({
      id: 'p2',
      name: 'Empty',
      summary: null,
      status: 'PLANNED',
      priority: 'LOW',
      owner: null,
      targetDate: null,
    });
    ctx.db.task.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const out: any = await action.handler({ projectId: 'p2', lookaheadDays: 7 }, ctx);

    expect(out.counts.total).toBe(0);
    expect(out.completionPct).toBe(0);
    expect(out.summary).not.toContain('## Blocked');
    expect(out.summary).not.toContain('## Overdue');
  });
});

describe('project.createStatusUpdate', () => {
  it('appends a dated status line to existing summary', async () => {
    const action = actionRegistry.get('project.createStatusUpdate')!;
    expect(action.scopes).toContain('project.write');
    const ctx = mkCtx();
    ctx.db.project.findUniqueOrThrow.mockResolvedValue({ id: 'p1', summary: 'Existing.' });
    ctx.db.project.update.mockImplementation((args: any) => Promise.resolve({ id: 'p1', ...args.data }));

    const out: any = await action.handler({ projectId: 'p1', body: 'Shipped milestone 1.' }, ctx);

    expect(out.summary).toContain('Existing.');
    expect(out.summary).toContain('Update');
    expect(out.summary).toContain('Shipped milestone 1.');
  });

  it('writes a fresh summary when project had none', async () => {
    const action = actionRegistry.get('project.createStatusUpdate')!;
    const ctx = mkCtx();
    ctx.db.project.findUniqueOrThrow.mockResolvedValue({ id: 'p1', summary: null });
    ctx.db.project.update.mockImplementation((args: any) => Promise.resolve({ id: 'p1', ...args.data }));

    const out: any = await action.handler({ projectId: 'p1', body: 'Kickoff done.' }, ctx);

    expect(out.summary).toContain('Kickoff done.');
    expect(out.summary.startsWith('[')).toBe(true);
  });
});

describe('task.listBlocked', () => {
  it('returns only BLOCKED tasks', async () => {
    const action = actionRegistry.get('task.listBlocked')!;
    expect(action.scopes).toContain('task.read');
    const ctx = mkCtx();
    ctx.db.task.findMany.mockResolvedValue([
      { id: 't1', title: 'A', status: 'BLOCKED' },
      { id: 't2', title: 'B', status: 'BLOCKED' },
    ]);

    const out: any = await action.handler({ limit: 10 }, ctx);

    expect(out.count).toBe(2);
    expect(ctx.db.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'BLOCKED' }),
        take: 10,
      }),
    );
  });

  it('scopes to project when projectId is given', async () => {
    const action = actionRegistry.get('task.listBlocked')!;
    const ctx = mkCtx();
    ctx.db.task.findMany.mockResolvedValue([]);
    await action.handler({ projectId: 'p1', limit: 10 }, ctx);
    expect(ctx.db.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'BLOCKED', projectId: 'p1' }),
      }),
    );
  });
});

describe('task.listOverdue', () => {
  it('filters by dueAt < now and excludes DONE/CANCELLED', async () => {
    const action = actionRegistry.get('task.listOverdue')!;
    const ctx = mkCtx();
    ctx.db.task.findMany.mockResolvedValue([{ id: 't1', title: 'A' }]);
    await action.handler({ limit: 5 }, ctx);
    const call = ctx.db.task.findMany.mock.calls[0][0];
    expect(call.where.dueAt).toEqual({ lt: expect.any(Date) });
    expect(call.where.status).toEqual({ notIn: ['DONE', 'CANCELLED'] });
  });

  it('scopes by assigneeUserId when given', async () => {
    const action = actionRegistry.get('task.listOverdue')!;
    const ctx = mkCtx();
    ctx.db.task.findMany.mockResolvedValue([]);
    await action.handler({ assigneeUserId: 'u2', limit: 5 }, ctx);
    expect(ctx.db.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assigneeUserId: 'u2' }),
      }),
    );
  });
});

describe('task.assign', () => {
  it('assigns a task to a user after validating the user exists', async () => {
    const action = actionRegistry.get('task.assign')!;
    expect(action.scopes).toContain('task.write');
    const ctx = mkCtx();
    ctx.db.user.findUniqueOrThrow.mockResolvedValue({ id: 'u2' });
    ctx.db.task.update.mockResolvedValue({
      id: 't1', title: 'Test Task', assigneeUserId: 'u2',
      project: { id: 'p1', name: 'Test Project' },
    });
    ctx.db.inboxItem.create.mockResolvedValue({});

    const out: any = await action.handler({ taskId: 't1', assigneeUserId: 'u2' }, ctx);

    expect(ctx.db.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'u2' } });
    expect(ctx.db.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { assigneeUserId: 'u2' },
      include: { project: { select: { id: true, name: true } } },
    });
    expect(out.assigneeUserId).toBe('u2');
  });

  it('accepts null to clear the assignee', async () => {
    const action = actionRegistry.get('task.assign')!;
    const ctx = mkCtx();
    ctx.db.task.update.mockResolvedValue({ id: 't1', assigneeUserId: null, project: { id: 'p1', name: 'Test Project' } });
    await action.handler({ taskId: 't1', assigneeUserId: null }, ctx);
    expect(ctx.db.user.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(ctx.db.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { assigneeUserId: null },
      include: { project: { select: { id: true, name: true } } },
    });
  });
});

describe('task.markBlocked', () => {
  it('sets status=BLOCKED and stores the reason', async () => {
    const action = actionRegistry.get('task.markBlocked')!;
    const ctx = mkCtx();
    ctx.db.task.update.mockResolvedValue({ id: 't1', status: 'BLOCKED', blockedReason: 'Waiting on Legal' });
    await action.handler({ taskId: 't1', reason: 'Waiting on Legal' }, ctx);
    expect(ctx.db.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'BLOCKED', blockedReason: 'Waiting on Legal' },
    });
  });

  it('rejects empty reason via zod parse', async () => {
    const action = actionRegistry.get('task.markBlocked')!;
    const res = action.parameters.safeParse({ taskId: 't1', reason: '' });
    expect(res.success).toBe(false);
  });
});

describe('task.complete', () => {
  it('sets status=DONE and clears blockedReason', async () => {
    const action = actionRegistry.get('task.complete')!;
    const ctx = mkCtx();
    ctx.db.task.update.mockResolvedValue({ id: 't1', status: 'DONE' });
    await action.handler({ taskId: 't1' }, ctx);
    expect(ctx.db.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'DONE', blockedReason: null },
    });
  });
});

describe('registry wiring', () => {
  it('registers all eight project/task actions', () => {
    const names = [
      'project.stats',
      'project.summarize',
      'project.createStatusUpdate',
      'task.listBlocked',
      'task.listOverdue',
      'task.assign',
      'task.markBlocked',
      'task.complete',
    ];
    for (const n of names) {
      expect(actionRegistry.get(n), n).toBeDefined();
    }
  });

  it('all are categorised as custom', () => {
    const names = [
      'project.stats',
      'project.summarize',
      'project.createStatusUpdate',
      'task.listBlocked',
      'task.listOverdue',
      'task.assign',
      'task.markBlocked',
      'task.complete',
    ];
    for (const n of names) {
      expect(actionRegistry.get(n)!.category).toBe('custom');
    }
  });
});
