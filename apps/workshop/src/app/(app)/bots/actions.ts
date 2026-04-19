'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { ApiClientError } from '@hq/api-client';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';

function toErrorString(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as ApiClientError).message);
  }

  return 'Request failed.';
}

export async function createBotAction(prevState: unknown, formData: FormData): Promise<{ success?: boolean; error?: string }> {
  await requirePermission(ROUTE_PERMISSIONS.bots);
  const api = await getSessionApiClient();

  try {
    await api.createBot({
      name: String(formData.get('name') ?? ''),
      description: String(formData.get('description') ?? '') || undefined,
    });

    revalidatePath('/bots');
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorString(error) };
  }
}

export async function createBotKeyAction(formData: FormData): Promise<never> {
  await requirePermission(ROUTE_PERMISSIONS.bots);
  const api = await getSessionApiClient();
  const botId = String(formData.get('botId') ?? '');

  try {
    const created = await api.createBotKey({
      botId,
      label: String(formData.get('label') ?? '') || undefined,
    });

    revalidatePath('/bots');
    return redirect(
      `/bots?bot=${encodeURIComponent(botId)}&success=${encodeURIComponent(`Key created (copy now)`)}&key=${encodeURIComponent(created.key)}`
    );
  } catch (error) {
    return redirect(`/bots?bot=${encodeURIComponent(botId)}&error=${encodeURIComponent(toErrorString(error))}`);
  }
}

export async function revokeBotKeyAction(formData: FormData): Promise<never> {
  await requirePermission(ROUTE_PERMISSIONS.bots);
  const api = await getSessionApiClient();
  const botId = String(formData.get('botId') ?? '');

  try {
    await api.revokeBotKey({
      botId,
      keyId: String(formData.get('keyId') ?? ''),
    });
  } catch (error) {
    return redirect(`/bots?bot=${encodeURIComponent(botId)}&error=${encodeURIComponent(toErrorString(error))}`);
  }

  revalidatePath('/bots');
  return redirect(`/bots?bot=${encodeURIComponent(botId)}&success=Key%20revoked`);
}
