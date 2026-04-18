/**
 * Files workers.
 *
 * Registers `files.sweep-temp` — a recurring job that deletes complete files
 * inside `TEMP` folders once they pass the folder's `retentionDays` window.
 * Runs every hour by default; can be tuned via `FILES_SWEEP_CRON`.
 */
import { registerWorker, scheduleRecurring } from '@hq/jobs';
import { sweepTempFiles } from '@hq/files';
import { createServiceContext } from '@hq/services';
import { buildPermissionMap } from '@hq/auth/policy';
import type { AgentPrincipal } from '@hq/auth/types';

const DEFAULT_CRON = '0 * * * *'; // hourly

function systemPrincipal(): AgentPrincipal {
  return {
    kind: 'agent',
    source: 'internal',
    agentKey: 'files.sweep-temp',
    agentName: 'Temp File Sweeper',
    scopes: [],
    permissions: buildPermissionMap('ADMIN'),
  };
}

export async function registerFilesWorkers(): Promise<void> {
  await registerWorker('files.sweep-temp', async (job) => {
    const ctx = createServiceContext(systemPrincipal());
    const result = await sweepTempFiles(ctx);
    ctx.logger.info?.(
      `[files.sweep-temp] ${job.id} scanned=${result.foldersScanned} deleted=${result.filesDeleted} errors=${result.errors.length}`,
    );
    return result;
  });

  const cron = process.env.FILES_SWEEP_CRON?.trim() || DEFAULT_CRON;
  await scheduleRecurring('files.sweep-temp', cron, {});
}
