'use server';

import { revalidatePath } from 'next/cache';
import { createServiceContext } from '@hq/services';
import {
  createConnection,
  deleteConnection,
  startOAuthFlow,
  updateConnection,
  type CreateConnectionInput,
} from '@hq/integrations';
import { requireAuth, requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';

export async function connectStaticAction(input: CreateConnectionInput) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.integrations);
  const ctx = createServiceContext(principal);
  await createConnection(ctx, input);
  revalidatePath('/settings/integrations');
}

export async function disconnectAction(id: string) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.integrations);
  const ctx = createServiceContext(principal);
  await deleteConnection(ctx, id);
  revalidatePath('/settings/integrations');
}

export async function updateConnectionAction(input: {
  id: string;
  label?: string;
  allowedUserIds?: string[];
  allowedRoles?: string[];
}) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.integrations);
  const ctx = createServiceContext(principal);
  await updateConnection(ctx, input);
  revalidatePath('/settings/integrations');
}

export async function startOAuthAction(input: {
  integrationKey: string;
  redirectUri: string;
  label?: string;
}): Promise<{ authorizeUrl: string }> {
  const principal = await requireAuth();
  const ctx = createServiceContext(principal);
  const { authorizeUrl } = await startOAuthFlow(ctx, input);
  return { authorizeUrl };
}
