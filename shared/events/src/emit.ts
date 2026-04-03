// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import type { ServiceContext } from '@hq/services';

export async function emitEvent(
  ctx: ServiceContext,
  type: string,
  data: {
    objectType?: string;
    objectId?: string;
    payload?: unknown;
    correlationId?: string;
  }
): Promise<void> {
  const actor = ctx.actor;
  const actorId = actor.kind === 'user'
    ? actor.userId
    : 'agentKey' in actor
      ? (actor as any).agentKey
      : (actor as any).botId;

  const event = await ctx.dbClient.platformEvent.create({
    data: {
      type,
      actorType: actor.kind,
      actorId,
      objectType: data.objectType ?? null,
      objectId: data.objectId ?? null,
      payload: (data.payload ?? {}) as object,
      correlationId: data.correlationId ?? null,
    },
  });

  await ctx.dbClient.$executeRaw`SELECT pg_notify('platform_events', ${JSON.stringify({
    id: event.id,
    type: event.type,
    objectType: event.objectType,
    objectId: event.objectId,
  })}::text)`;
}
