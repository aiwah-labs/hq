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
