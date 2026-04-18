import { registerWorker } from '@hq/jobs';
import { db } from '@hq/db';
import { userPrincipalFromData } from '@hq/auth/middleware';
import { createServiceContext } from '@hq/services';
import { executeImport } from '@hq/objects';

export async function registerImportWorkers(): Promise<void> {
  await registerWorker('object.import', async (job) => {
    const { userId, objectType, format, content, fieldMap } = job.data;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new Error(`Import job ${job.id}: user ${userId} missing or inactive.`);
    }

    const principal = userPrincipalFromData({
      userId: user.id,
      email: user.email,
      dbRole: user.role as 'ADMIN' | 'MEMBER',
    });
    const ctx = createServiceContext(principal);

    const result = await executeImport(
      objectType,
      { format, content, fieldMap },
      ctx,
    );
    // Returned value is persisted as the pg-boss job `output`.
    return result;
  });
}
