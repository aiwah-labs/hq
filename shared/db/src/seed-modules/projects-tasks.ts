/**
 * Seed — Projects & Tasks example module.
 *
 * Idempotent: running repeatedly converges on the same state. Projects are
 * keyed by name; tasks by (projectId, title). Ownership is assigned to the
 * first admin user the seed finds — adjust to your deployment's real users
 * when you fork.
 */
import type { db as Db } from '../client.js';

interface SeedTask {
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueInDays?: number; // negative = overdue, positive = future
  blockedReason?: string;
  unassigned?: boolean;
}

interface SeedProject {
  name: string;
  summary: string;
  status: 'PLANNED' | 'ACTIVE' | 'BLOCKED' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  startInDays?: number;
  targetInDays?: number;
  tasks: SeedTask[];
}

const PROJECTS: SeedProject[] = [
  {
    name: 'Launch revenue engine',
    summary: 'Stand up a repeatable outbound funnel and hit first 100 MRR.',
    status: 'ACTIVE',
    priority: 'HIGH',
    startInDays: -30,
    targetInDays: 45,
    tasks: [
      { title: 'Draft ICP brief', status: 'DONE', priority: 'HIGH', dueInDays: -20 },
      { title: 'Build prospect list (500)', status: 'IN_PROGRESS', priority: 'HIGH', dueInDays: 3 },
      { title: 'Ship cold-email sequence', status: 'TODO', priority: 'HIGH', dueInDays: 10 },
      { title: 'Warm up two new sending domains', status: 'BLOCKED', priority: 'URGENT', dueInDays: -2, blockedReason: 'Waiting on DNS change from IT' },
      { title: 'Set up landing page for email CTA', status: 'TODO', priority: 'MEDIUM', dueInDays: 14 },
    ],
  },
  {
    name: 'Customer onboarding v2',
    summary: 'Cut time-to-first-value from 14 days to 3 for new accounts.',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    startInDays: -14,
    targetInDays: 30,
    tasks: [
      { title: 'Interview 5 recent customers', status: 'DONE', priority: 'MEDIUM', dueInDays: -7 },
      { title: 'Rewrite welcome email sequence', status: 'IN_PROGRESS', priority: 'MEDIUM', dueInDays: 5 },
      { title: 'Ship in-app checklist', status: 'TODO', priority: 'HIGH', dueInDays: 12 },
      { title: 'Unblock Stripe integration for trials', status: 'BLOCKED', priority: 'HIGH', dueInDays: -1, blockedReason: 'Need finance sign-off on pricing plan' },
    ],
  },
  {
    name: 'Q2 strategy offsite',
    summary: 'Align leadership + deliver written plan by end of quarter.',
    status: 'PLANNED',
    priority: 'MEDIUM',
    startInDays: 7,
    targetInDays: 21,
    tasks: [
      { title: 'Book venue', status: 'TODO', priority: 'MEDIUM', dueInDays: 4, unassigned: true },
      { title: 'Draft agenda', status: 'TODO', priority: 'LOW', dueInDays: 10 },
      { title: 'Pre-read from each lead', status: 'TODO', priority: 'LOW', dueInDays: 14, unassigned: true },
      { title: 'Write strategy doc post-offsite', status: 'TODO', priority: 'HIGH', dueInDays: 25 },
    ],
  },
  {
    name: 'Platform reliability sprint',
    summary: 'Get API error-rate under 0.5% and set up proper alerting.',
    status: 'BLOCKED',
    priority: 'URGENT',
    startInDays: -7,
    targetInDays: 14,
    tasks: [
      { title: 'Audit top 10 error sources', status: 'DONE', priority: 'HIGH', dueInDays: -3 },
      { title: 'Instrument p95 latency alerts', status: 'IN_PROGRESS', priority: 'URGENT', dueInDays: -4 }, // overdue
      { title: 'Fix N+1 in customer list endpoint', status: 'TODO', priority: 'HIGH', dueInDays: 2 },
      { title: 'Decide on tracing vendor', status: 'BLOCKED', priority: 'MEDIUM', dueInDays: -5, blockedReason: 'Vendor selection pending budget approval' },
      { title: 'Write runbook for DB failover', status: 'TODO', priority: 'MEDIUM', dueInDays: 9 },
    ],
  },
];

export async function seedProjectsTasks(db: typeof Db): Promise<void> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // Assign ownership/assignment to the first admin found. In a real deployment,
  // swap in your real users.
  const owner = await db.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (!owner) {
    console.warn('Seed projects-tasks: no admin user found, skipping.');
    return;
  }

  for (const p of PROJECTS) {
    const existing = await db.project.findFirst({ where: { name: p.name } });
    const project = existing
      ? existing
      : await db.project.create({
          data: {
            name: p.name,
            summary: p.summary,
            status: p.status,
            priority: p.priority,
            ownerUserId: owner.id,
            startDate: p.startInDays != null ? new Date(now + p.startInDays * day) : null,
            targetDate: p.targetInDays != null ? new Date(now + p.targetInDays * day) : null,
          },
        });

    for (const t of p.tasks) {
      const existingTask = await db.task.findFirst({
        where: { projectId: project.id, title: t.title },
      });
      if (existingTask) continue;
      await db.task.create({
        data: {
          title: t.title,
          description: t.description ?? null,
          status: t.status,
          priority: t.priority,
          projectId: project.id,
          assigneeUserId: t.unassigned ? null : owner.id,
          dueAt: t.dueInDays != null ? new Date(now + t.dueInDays * day) : null,
          blockedReason: t.blockedReason ?? null,
        },
      });
    }
  }

  const totalProjects = await db.project.count();
  const totalTasks = await db.task.count();
  console.log(`Seeded example module: projects-tasks (${totalProjects} projects, ${totalTasks} tasks).`);
}
