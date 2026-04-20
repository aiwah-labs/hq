import { db } from '@hq/db';

interface Props {
  objectType?: string;
  objectId?: string;
  correlationId?: string;
  limit?: number;
}

function formatTime(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleString();
}

/**
 * Server component. Renders the most recent events that match the given
 * filter. Intended to be dropped into any detail page:
 *
 *   <ActivityTimeline objectType="Project" objectId={id} />
 */
export async function ActivityTimeline({
  objectType,
  objectId,
  correlationId,
  limit = 50,
}: Props) {
  const events = await db.platformEvent.findMany({
    where: { objectType, objectId, correlationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  if (events.length === 0) {
    return (
      <div
        className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-4 py-6 text-[13px] text-[#62666d]"
        data-testid="activity-empty"
      >
        No activity recorded yet.
      </div>
    );
  }

  return (
    <ol className="divide-y divide-[#e6e8eb] rounded-md border border-[#e6e8eb] bg-[#ffffff]" data-testid="activity-timeline">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 px-4 py-3" data-testid={`event-${e.id}`}>
          <span className="mt-0.5 flex h-5 min-w-[60px] items-center justify-center rounded bg-black/20 px-2 font-mono text-[11px] text-[#62666d]">
            {e.actorType}
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] text-[#0f1011]">{e.type}</span>
              <span className="text-[11px] text-[#62666d]">{formatTime(e.createdAt)}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-[#62666d]">
              by {e.actorId}
              {e.actionName ? ` · ${e.actionName}` : ''}
              {e.workflowRunId ? ` · workflow:${e.workflowRunId}` : ''}
              {e.agentRunId ? ` · agent-run:${e.agentRunId}` : ''}
              {e.approvalRequestId ? ` · approval:${e.approvalRequestId}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
