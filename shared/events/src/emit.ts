/**
 * Platform event emission.
 *
 * `emitEvent` writes one `PlatformEvent` row and fans it out via pg_notify so
 * streaming clients (Workshop SSE, external observers) can react in real
 * time. Every significant mutation — object CRUD, action dispatch, workflow
 * lifecycle, agent run, approval decision — should go through this helper so
 * there is one canonical audit surface.
 *
 * Failures are swallowed (with a console warning) because audit writes must
 * never break business logic — a missing event is an observability gap, not
 * a data loss event.
 */
import type { ServiceContext } from '@hq/services';
import type { AuthPrincipal } from '@hq/auth/types';

export interface EmitEventOptions {
  objectType?: string;
  objectId?: string;
  actionName?: string;
  workflowRunId?: string;
  agentRunId?: string;
  approvalRequestId?: string;
  correlationId?: string;
  payload?: unknown;
}

function actorFromPrincipal(actor: AuthPrincipal): { actorType: string; actorId: string } {
  if (actor.kind === 'user') return { actorType: 'user', actorId: actor.userId };
  if (actor.kind === 'bot') return { actorType: 'bot', actorId: actor.botId };
  if (actor.kind === 'agent') return { actorType: 'agent', actorId: actor.agentKey };
  return { actorType: 'unknown', actorId: 'anonymous' };
}

export async function emitEvent(
  ctx: ServiceContext,
  type: string,
  data: EmitEventOptions = {},
): Promise<void> {
  try {
    const { actorType, actorId } = actorFromPrincipal(ctx.actor);

    const event = await ctx.dbClient.platformEvent.create({
      data: {
        type,
        actorType,
        actorId,
        objectType: data.objectType ?? null,
        objectId: data.objectId ?? null,
        actionName: data.actionName ?? null,
        workflowRunId: data.workflowRunId ?? null,
        agentRunId: data.agentRunId ?? null,
        approvalRequestId: data.approvalRequestId ?? null,
        correlationId: data.correlationId ?? null,
        payload: (data.payload ?? {}) as object,
      },
    });

    await ctx.dbClient.$executeRaw`SELECT pg_notify('platform_events', ${JSON.stringify(
      {
        id: event.id,
        type: event.type,
        objectType: event.objectType,
        objectId: event.objectId,
        correlationId: event.correlationId,
      },
    )}::text)`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[events] emit failed', type, err instanceof Error ? err.message : err);
  }
}

/** Best-effort standalone emit that builds its own service context when only
 *  a principal is available (e.g. API route before a context is built). */
export async function emitPlatformEvent(
  principal: AuthPrincipal,
  type: string,
  data: EmitEventOptions = {},
): Promise<void> {
  const { db } = await import('@hq/db');
  const ctx = {
    actor: principal,
    dbClient: db,
    now: () => new Date(),
    logger: console,
  } as unknown as ServiceContext;
  await emitEvent(ctx, type, data);
}
