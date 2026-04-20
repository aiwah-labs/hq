import type { ServiceContext } from './context.js';

function assertTaskAccess(
  ctx: ServiceContext,
  scope: 'task.read' | 'task.write' | 'task.delete'
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

export interface ListTasksOptions {
  query?: string;
  projectId?: string;
  status?: string;
  priority?: string;
  assigneeUserId?: string;
  overdue?: boolean;
  limit?: number;
  cursor?: string;
  sortBy?: 'title' | 'status' | 'priority' | 'dueAt' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

export async function listTasks(ctx: ServiceContext, opts?: ListTasksOptions) {
  assertTaskAccess(ctx, 'task.read');

  const where: Record<string, unknown> = {};

  if (opts?.query) {
    where.title = { contains: opts.query, mode: 'insensitive' };
  }
  if (opts?.projectId) where.projectId = opts.projectId;
  if (opts?.status) where.status = opts.status;
  if (opts?.priority) where.priority = opts.priority;
  if (opts?.assigneeUserId) where.assigneeUserId = opts.assigneeUserId;
  if (opts?.overdue) {
    where.dueAt = { lt: ctx.now() };
    where.status = { notIn: ['DONE', 'CANCELLED'] };
  }
  if (opts?.cursor) where.id = { gt: opts.cursor };

  const limit = opts?.limit ?? 50;
  const orderBy = { [opts?.sortBy ?? 'createdAt']: opts?.sortDir ?? 'desc' };

  const [items, total] = await Promise.all([
    ctx.dbClient.task.findMany({ where, orderBy, take: limit }),
    ctx.dbClient.task.count({ where }),
  ]);

  return { items, total };
}

export async function countTasks(
  ctx: ServiceContext,
  opts?: {
    projectId?: string;
    status?: string;
    assigneeUserId?: string;
    overdue?: boolean;
  }
) {
  assertTaskAccess(ctx, 'task.read');

  const where: Record<string, unknown> = {};
  if (opts?.projectId) where.projectId = opts.projectId;
  if (opts?.status) where.status = opts.status;
  if (opts?.assigneeUserId) where.assigneeUserId = opts.assigneeUserId;
  if (opts?.overdue) {
    where.dueAt = { lt: ctx.now() };
    where.status = { notIn: ['DONE', 'CANCELLED'] };
  }

  return ctx.dbClient.task.count({ where });
}

export async function getTask(ctx: ServiceContext, id: string) {
  assertTaskAccess(ctx, 'task.read');

  const task = await ctx.dbClient.task.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, status: true } },
      assignee: { select: { id: true, email: true, name: true } },
    },
  });

  if (!task) throw new Error('Task not found.');
  return task;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigneeUserId?: string;
  dueAt?: Date;
  dueInDays?: number;
}

export async function createTask(ctx: ServiceContext, input: CreateTaskInput) {
  assertTaskAccess(ctx, 'task.write');

  if (!input.title || input.title.trim().length === 0) {
    throw new Error('Title is required.');
  }
  if (input.title.length > 500) {
    throw new Error('Title must be 500 characters or fewer.');
  }

  const project = await ctx.dbClient.project.findUnique({ where: { id: input.projectId } });
  if (!project) throw new Error('Project not found.');

  const dueAt =
    input.dueAt ??
    (input.dueInDays != null
      ? new Date(ctx.now().getTime() + input.dueInDays * 24 * 60 * 60 * 1000)
      : null);

  const task = await ctx.dbClient.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'MEDIUM',
      projectId: input.projectId,
      assigneeUserId: input.assigneeUserId ?? null,
      dueAt,
    },
  });

  if (input.assigneeUserId) {
    await ctx.dbClient.inboxItem.create({
      data: {
        recipientUserId: input.assigneeUserId,
        type: 'task_assigned',
        title: `New task: ${task.title}`,
        body: `Assigned to you in "${(project as any).name}"`,
        sourceType: 'Task',
        sourceId: task.id,
        actionUrl: `/projects/${input.projectId}`,
      },
    });
  }

  return task;
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string;
  description?: string;
  status?: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigneeUserId?: string | null;
  dueAt?: Date | null;
  blockedReason?: string | null;
}

export async function updateTask(ctx: ServiceContext, input: UpdateTaskInput) {
  assertTaskAccess(ctx, 'task.write');

  const existing = await ctx.dbClient.task.findUnique({ where: { id: input.taskId } });
  if (!existing) throw new Error('Task not found.');

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.status !== undefined) data.status = input.status;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.assigneeUserId !== undefined) data.assigneeUserId = input.assigneeUserId;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt;
  if (input.blockedReason !== undefined) data.blockedReason = input.blockedReason;

  if (Object.keys(data).length === 0) {
    throw new Error('No fields provided to update.');
  }

  return ctx.dbClient.task.update({ where: { id: input.taskId }, data });
}

export async function deleteTask(ctx: ServiceContext, id: string) {
  assertTaskAccess(ctx, 'task.delete');

  const existing = await ctx.dbClient.task.findUnique({ where: { id } });
  if (!existing) throw new Error('Task not found.');

  await ctx.dbClient.task.delete({ where: { id } });
  return { deleted: true };
}

export async function completeTask(ctx: ServiceContext, id: string) {
  assertTaskAccess(ctx, 'task.write');

  const existing = await ctx.dbClient.task.findUnique({ where: { id } });
  if (!existing) throw new Error('Task not found.');

  return ctx.dbClient.task.update({
    where: { id },
    data: { status: 'DONE', blockedReason: null },
  });
}

export async function assignTask(
  ctx: ServiceContext,
  id: string,
  assigneeUserId: string | null
) {
  assertTaskAccess(ctx, 'task.write');

  if (assigneeUserId !== null) {
    const user = await ctx.dbClient.user.findUnique({ where: { id: assigneeUserId } });
    if (!user) throw new Error('User not found.');
  }

  const task = await ctx.dbClient.task.update({
    where: { id },
    data: { assigneeUserId },
    include: { project: { select: { id: true, name: true } } },
  });

  if (assigneeUserId) {
    await ctx.dbClient.inboxItem.create({
      data: {
        recipientUserId: assigneeUserId,
        type: 'task_assigned',
        title: `Task assigned: ${(task as any).title}`,
        body: `In project "${(task as any).project.name}"`,
        sourceType: 'Task',
        sourceId: task.id,
        actionUrl: `/projects/${(task as any).project.id}`,
      },
    });
  }

  return task;
}

export async function markTaskBlocked(
  ctx: ServiceContext,
  id: string,
  reason: string
) {
  assertTaskAccess(ctx, 'task.write');

  const existing = await ctx.dbClient.task.findUnique({ where: { id } });
  if (!existing) throw new Error('Task not found.');

  const task = await ctx.dbClient.task.update({
    where: { id },
    data: { status: 'BLOCKED', blockedReason: reason },
  });

  const ownerId = (existing as any).assigneeUserId;
  if (ownerId) {
    await ctx.dbClient.inboxItem.create({
      data: {
        recipientUserId: ownerId,
        type: 'task_blocked',
        title: `Task blocked: ${(existing as any).title}`,
        body: reason,
        sourceType: 'Task',
        sourceId: id,
        actionUrl: `/projects/${(existing as any).projectId}`,
      },
    });
  }

  return task;
}

export async function listBlockedTasks(
  ctx: ServiceContext,
  opts?: { projectId?: string; limit?: number }
) {
  assertTaskAccess(ctx, 'task.read');

  const where: Record<string, unknown> = { status: 'BLOCKED' };
  if (opts?.projectId) where.projectId = opts.projectId;

  return ctx.dbClient.task.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: opts?.limit ?? 50,
  });
}

export async function listOverdueTasks(
  ctx: ServiceContext,
  opts?: { projectId?: string; assigneeUserId?: string; limit?: number }
) {
  assertTaskAccess(ctx, 'task.read');

  const where: Record<string, unknown> = {
    dueAt: { lt: ctx.now() },
    status: { notIn: ['DONE', 'CANCELLED'] },
  };
  if (opts?.projectId) where.projectId = opts.projectId;
  if (opts?.assigneeUserId) where.assigneeUserId = opts.assigneeUserId;

  return ctx.dbClient.task.findMany({
    where,
    orderBy: { dueAt: 'asc' },
    take: opts?.limit ?? 50,
  });
}
