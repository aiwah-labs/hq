// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import type { ServiceContext } from './context';

export async function healthCheck(context: ServiceContext): Promise<{ ok: true; userId: string }> {
  const principalId = context.actor.kind === 'user' ? context.actor.userId
    : context.actor.kind === 'agent' ? `agent:${context.actor.agentKey}`
    : `bot:${context.actor.botId}`;
  context.logger.info('healthCheck called', { principalId });
  return {
    ok: true,
    userId: principalId,
  };
}
