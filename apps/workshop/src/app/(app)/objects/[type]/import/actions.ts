'use server';

import { revalidatePath } from 'next/cache';
import { objects, previewImport, executeImport, type ImportPreview } from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { enqueueJob } from '@hq/jobs';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';

function toError(err: unknown): string {
  return err instanceof Error ? err.message : 'Import failed.';
}

export async function previewImportAction(
  type: string,
  format: 'csv' | 'json',
  content: string,
): Promise<{ preview?: ImportPreview; error?: string }> {
  try {
    const principal = await requirePermission(PERMISSIONS.workshopView);
    if (!objects[type]) return { error: `Unknown object type: ${type}` };
    const ctx = createServiceContext(principal);
    const preview = await previewImport(type, { format, content }, ctx);
    return { preview };
  } catch (err) {
    return { error: toError(err) };
  }
}

export async function runImportAction(
  type: string,
  format: 'csv' | 'json',
  content: string,
  mode: 'sync' | 'async',
): Promise<{ created?: number; failed?: number; jobId?: string | null; error?: string }> {
  try {
    const principal = await requirePermission(PERMISSIONS.workshopView);
    if (!objects[type]) return { error: `Unknown object type: ${type}` };

    if (mode === 'async') {
      if (principal.kind !== 'user') return { error: 'Async imports require a user actor.' };
      const jobId = await enqueueJob('object.import', {
        userId: principal.userId,
        objectType: type,
        format,
        content,
      });
      revalidatePath(`/jobs`);
      return { jobId };
    }

    const ctx = createServiceContext(principal);
    const result = await executeImport(type, { format, content }, ctx);
    revalidatePath(`/objects/${type}`);
    return { created: result.created, failed: result.failed };
  } catch (err) {
    return { error: toError(err) };
  }
}
