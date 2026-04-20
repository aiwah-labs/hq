'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { createServiceContext } from '@hq/services';
import { markRead, archiveItem, markAllRead } from '@hq/services';

export async function markReadAction(id: string) {
  const principal = await requireAuth();
  const ctx = createServiceContext(principal);
  await markRead(ctx, id);
  revalidatePath('/dashboard');
  revalidatePath('/inbox');
}

export async function archiveAction(id: string) {
  const principal = await requireAuth();
  const ctx = createServiceContext(principal);
  await archiveItem(ctx, id);
  revalidatePath('/dashboard');
  revalidatePath('/inbox');
}

export async function markAllReadAction() {
  const principal = await requireAuth();
  const ctx = createServiceContext(principal);
  await markAllRead(ctx);
  revalidatePath('/dashboard');
  revalidatePath('/inbox');
}
