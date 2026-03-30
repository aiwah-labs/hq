'use server';

import { revalidatePath } from 'next/cache';
import { getSessionApiClient } from '@/lib/api-client';

export async function triggerWorkflowAction(key: string) {
  const api = await getSessionApiClient();
  try {
    await api.post(`/v1/workflows/${encodeURIComponent(key)}/trigger`, {});
  } catch {
    // Input validation failures are expected for workflows that require input.
    // A proper input form will be built later.
  }
  revalidatePath(`/workflows/${key}`);
  revalidatePath('/workflows');
}

export async function cancelRunAction(key: string, runId: string) {
  const api = await getSessionApiClient();
  await api.post(`/v1/workflows/${encodeURIComponent(key)}/runs/${runId}/cancel`);
  revalidatePath(`/workflows/${key}/runs/${runId}`);
  revalidatePath(`/workflows/${key}`);
}

export async function retryRunAction(key: string, runId: string) {
  const api = await getSessionApiClient();
  await api.post(`/v1/workflows/${encodeURIComponent(key)}/runs/${runId}/retry`);
  revalidatePath(`/workflows/${key}/runs/${runId}`);
  revalidatePath(`/workflows/${key}`);
}
