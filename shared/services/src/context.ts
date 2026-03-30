import type { AuthPrincipal } from '@hq/auth/types';
import { db } from '@hq/db';

export interface ServiceContext {
  actor: AuthPrincipal;
  dbClient: typeof db;
  now: () => Date;
  logger: Pick<Console, 'info' | 'warn' | 'error'>;
  /** Set by agent runner — e.g. "workshop:thread-abc". Actions can use this to scope to the current channel. */
  channelRef?: string;
}

export function createServiceContext(actor: AuthPrincipal, opts?: { channelRef?: string }): ServiceContext {
  return {
    actor,
    dbClient: db,
    now: () => new Date(),
    logger: console,
    channelRef: opts?.channelRef,
  };
}
