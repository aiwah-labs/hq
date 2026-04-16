import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import { MessagingWorkspace } from '@/components/messaging/messaging-workspace';

export default async function MessagingPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; message?: string }>;
}) {
  await requirePermission(ROUTE_PERMISSIONS.messaging);
  const api = await getSessionApiClient();
  const { thread: threadId, message: jumpToMessageId } = await searchParams;

  let threads: Record<string, unknown>[] = [];
  try {
    threads = (await api.listThreads({ limit: 30 })) as Record<string, unknown>[];
  } catch {
    threads = [];
  }

  return (
    <MessagingWorkspace
      initialThreads={threads}
      initialThreadId={threadId}
      jumpToMessageId={jumpToMessageId}
    />
  );
}
