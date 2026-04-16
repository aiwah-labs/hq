import { db } from '@hq/db';
import { scheduleJob } from '@hq/jobs';
import { getAgents } from '../registry.js';
import type { PlatformEventNotification } from '@hq/events';
import type { TriggerPayload } from '../types.js';

export async function onPlatformEvent(
  event: PlatformEventNotification
): Promise<void> {
  const agents = getAgents();

  // Find enabled agents with a matching event trigger
  const matchingAgents = agents.filter((def) =>
    def.defaultTriggers.some(
      (t) => t.type === 'event' && t.eventType === event.type
    )
  );

  for (const def of matchingAgents) {
    // Check enabled status
    const config = await db.agentConfig.findUnique({ where: { agentKey: def.key } });
    if (config?.enabled === false) continue;

    await scheduleJob(
      'agent.run',
      {
        agentKey: def.key,
        trigger: {
          type: 'event',
          eventType: event.type,
          eventPayload: event,
          correlationId: event.id,
        } satisfies TriggerPayload,
      },
      { retryLimit: 2, retryDelay: 30 }
    );
  }
}
