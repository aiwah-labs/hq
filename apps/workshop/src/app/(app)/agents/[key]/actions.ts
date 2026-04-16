'use server';

import { revalidatePath } from 'next/cache';
import { getSessionApiClient } from '@/lib/api-client';

export async function enableAgentAction(key: string) {
  const api = await getSessionApiClient();
  await api.post(`/v1/agents/${encodeURIComponent(key)}/enable`);
  revalidatePath(`/agents/${key}`);
  revalidatePath('/agents');
}

export async function disableAgentAction(key: string) {
  const api = await getSessionApiClient();
  await api.post(`/v1/agents/${encodeURIComponent(key)}/disable`);
  revalidatePath(`/agents/${key}`);
  revalidatePath('/agents');
}

export async function triggerAgentAction(key: string) {
  const api = await getSessionApiClient();
  await api.post(`/v1/agents/${encodeURIComponent(key)}/message`, {
    text: 'Manual trigger from Workshop UI',
  });
  revalidatePath(`/agents/${key}`);
}
