import type { ServiceContext } from './context.js';

function assertProjectAccess(
  ctx: ServiceContext,
  scope: 'project.read' | 'project.write' | 'project.delete'
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

export interface ListProjectsOptions {
  query?: string;
  status?: string;
  priority?: string;
  ownerUserId?: string;
  limit?: number;
  cursor?: string;
  sortBy?: 'name' | 'status' | 'priority' | 'startDate' | 'targetDate' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

export async function listProjects(ctx: ServiceContext, opts?: ListProjectsOptions) {
  assertProjectAccess(ctx, 'project.read');

  const where: Record<string, unknown> = {};

  if (opts?.query) {
    where.name = { contains: opts.query, mode: 'insensitive' };
  }
  if (opts?.status) where.status = opts.status;
  if (opts?.priority) where.priority = opts.priority;
  if (opts?.ownerUserId) where.ownerUserId = opts.ownerUserId;
  if (opts?.cursor) where.id = { gt: opts.cursor };

  const limit = opts?.limit ?? 50;
  const orderBy = { [opts?.sortBy ?? 'updatedAt']: opts?.sortDir ?? 'desc' };

  const [items, total] = await Promise.all([
    ctx.dbClient.project.findMany({ where, orderBy, take: limit }),
    ctx.dbClient.project.count({ where }),
  ]);

  return { items, total };
}

export async function countProjects(
  ctx: ServiceContext,
  opts?: { query?: string; status?: string; priority?: string; ownerUserId?: string }
) {
  assertProjectAccess(ctx, 'project.read');

  const where: Record<string, unknown> = {};
  if (opts?.query) where.name = { contains: opts.query, mode: 'insensitive' };
  if (opts?.status) where.status = opts.status;
  if (opts?.priority) where.priority = opts.priority;
  if (opts?.ownerUserId) where.ownerUserId = opts.ownerUserId;

  return ctx.dbClient.project.count({ where });
}

export async function getProject(ctx: ServiceContext, id: string) {
  assertProjectAccess(ctx, 'project.read');

  const project = await ctx.dbClient.project.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { createdAt: 'asc' } },
      owner: { select: { id: true, email: true, name: true } },
    },
  });

  if (!project) throw new Error('Project not found.');
  return project;
}

export interface CreateProjectInput {
  name: string;
  summary?: string;
  status?: 'PLANNED' | 'ACTIVE' | 'BLOCKED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  startDate?: Date;
  targetDate?: Date;
  targetInDays?: number;
}

export async function createProject(ctx: ServiceContext, input: CreateProjectInput) {
  assertProjectAccess(ctx, 'project.write');

  if (!input.name || input.name.trim().length === 0) {
    throw new Error('Name is required.');
  }
  if (input.name.length > 300) {
    throw new Error('Name must be 300 characters or fewer.');
  }

  const ownerUserId = ctx.actor.kind === 'user' ? ctx.actor.userId : null;

  const targetDate =
    input.targetDate ??
    (input.targetInDays != null
      ? new Date(ctx.now().getTime() + input.targetInDays * 24 * 60 * 60 * 1000)
      : null);

  return ctx.dbClient.project.create({
    data: {
      name: input.name,
      summary: input.summary ?? null,
      status: input.status ?? 'PLANNED',
      priority: input.priority ?? 'MEDIUM',
      ownerUserId,
      startDate: input.startDate ?? ctx.now(),
      targetDate,
    },
  });
}

export interface UpdateProjectInput {
  projectId: string;
  name?: string;
  summary?: string;
  status?: 'PLANNED' | 'ACTIVE' | 'BLOCKED' | 'DONE' | 'CANCELLED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  startDate?: Date | null;
  targetDate?: Date | null;
  ownerUserId?: string | null;
}

export async function updateProject(ctx: ServiceContext, input: UpdateProjectInput) {
  assertProjectAccess(ctx, 'project.write');

  const existing = await ctx.dbClient.project.findUnique({ where: { id: input.projectId } });
  if (!existing) throw new Error('Project not found.');

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.status !== undefined) data.status = input.status;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.startDate !== undefined) data.startDate = input.startDate;
  if (input.targetDate !== undefined) data.targetDate = input.targetDate;
  if (input.ownerUserId !== undefined) data.ownerUserId = input.ownerUserId;

  if (Object.keys(data).length === 0) {
    throw new Error('No fields provided to update.');
  }

  return ctx.dbClient.project.update({ where: { id: input.projectId }, data });
}

export async function deleteProject(ctx: ServiceContext, id: string) {
  assertProjectAccess(ctx, 'project.delete');

  const existing = await ctx.dbClient.project.findUnique({ where: { id } });
  if (!existing) throw new Error('Project not found.');

  await ctx.dbClient.project.delete({ where: { id } });
  return { deleted: true };
}

export async function getProjectStats(ctx: ServiceContext, id: string) {
  assertProjectAccess(ctx, 'project.read');

  const project = await ctx.dbClient.project.findUnique({ where: { id } });
  if (!project) throw new Error('Project not found.');

  const now = ctx.now();

  const [total, done, blocked, overdue, byStatus] = await Promise.all([
    ctx.dbClient.task.count({ where: { projectId: id } }),
    ctx.dbClient.task.count({ where: { projectId: id, status: 'DONE' } }),
    ctx.dbClient.task.count({ where: { projectId: id, status: 'BLOCKED' } }),
    ctx.dbClient.task.count({
      where: {
        projectId: id,
        dueAt: { lt: now },
        status: { notIn: ['DONE', 'CANCELLED'] },
      },
    }),
    ctx.dbClient.task.groupBy({
      by: ['status'],
      where: { projectId: id },
      _count: { _all: true },
    }),
  ]);

  const statusMap = Object.fromEntries(
    (byStatus as Array<{ status: string; _count: { _all: number } }>).map((row) => [
      row.status,
      row._count._all,
    ])
  );

  return {
    projectId: id,
    name: (project as any).name,
    status: (project as any).status,
    counts: { total, done, blocked, overdue },
    byStatus: statusMap,
    completion: total > 0 ? done / total : 0,
  };
}
