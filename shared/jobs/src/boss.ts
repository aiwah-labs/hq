import PgBoss from 'pg-boss';
import type { JobData, JobMap, JobName } from './types.js';

let _boss: PgBoss | null = null;

export function createBoss(): PgBoss {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for pg-boss');

  return new PgBoss({
    connectionString,
    schema: 'pgboss',
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    deleteAfterDays: 7,
    monitorStateIntervalSeconds: 30,
  });
}

export async function getBoss(): Promise<PgBoss> {
  if (!_boss) {
    _boss = createBoss();
    await _boss.start();
  }
  return _boss;
}

export async function stopBoss(): Promise<void> {
  if (_boss) {
    await _boss.stop();
    _boss = null;
  }
}

export async function scheduleJob<T extends JobName>(
  name: T,
  data: JobData<T>,
  options?: PgBoss.SendOptions
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, data as object, options ?? {});
}

export async function scheduleJobIn<T extends JobName>(
  name: T,
  data: JobData<T>,
  delaySeconds: number
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, data as object, { startAfter: delaySeconds });
}

/** Alias for scheduleJob — clearer name for one-off jobs. */
export async function enqueueJob<T extends JobName>(
  name: T,
  data: JobData<T>,
  options?: PgBoss.SendOptions
): Promise<string | null> {
  return scheduleJob(name, data, options);
}

export async function cancelJob(id: string): Promise<void> {
  const boss = await getBoss();
  await boss.cancel(id);
}

export interface JobRunSummary {
  id: string;
  name: string;
  state: string;
  createdOn: Date;
  startedOn?: Date;
  completedOn?: Date;
  retryCount: number;
  output?: unknown;
}

export async function listJobRuns(opts?: {
  name?: string;
  state?: string;
  limit?: number;
}): Promise<JobRunSummary[]> {
  const boss = await getBoss();
  // pg-boss v10: use getJobs to query jobs across queues
  const jobs = await boss.getJobs(opts?.name ?? '*', {
    state: opts?.state as any,
    limit: opts?.limit ?? 50,
  } as any).catch(() => []);
  return (jobs as any[]).map((j) => ({
    id: j.id,
    name: j.name,
    state: j.state,
    createdOn: j.createdOn ?? j.createdon,
    startedOn: j.startedOn ?? j.startedon,
    completedOn: j.completedOn ?? j.completedon,
    retryCount: j.retryCount ?? j.retrycount ?? 0,
    output: j.output,
  }));
}

/** Register a recurring cron schedule for a job. */
export async function scheduleRecurring<T extends JobName>(
  name: T,
  cron: string,
  data: JobData<T>,
  options?: PgBoss.ScheduleOptions
): Promise<void> {
  const boss = await getBoss();
  await boss.createQueue(name);
  await boss.schedule(name, cron, data as object, options ?? {});
}

export type WorkerHandler<T extends JobName> = (job: { id: string; name: string; data: JobData<T> }) => Promise<void>;

export async function registerWorker<T extends JobName>(
  name: T,
  handler: WorkerHandler<T>,
  options?: PgBoss.WorkOptions
): Promise<void> {
  const boss = await getBoss();
  // pg-boss v10: queues must be created explicitly before work() or send()
  await boss.createQueue(name);
  await boss.work<JobData<T>>(
    name,
    options ?? {},
    async (jobs) => {
      // pg-boss v10 passes an array; we process one at a time
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      if (!job) return;
      await handler({ id: job.id, name: job.name, data: job.data });
    }
  );
}
