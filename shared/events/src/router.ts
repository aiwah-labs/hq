// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import type { PlatformEventNotification } from './types.js';

/**
 * Event subscriber — a function that receives matching platform events.
 * Returns void (fire-and-forget). Errors are caught and logged.
 */
export type EventHandler = (event: PlatformEventNotification) => Promise<void>;

interface EventSubscription {
  id: string;
  /** Event type pattern — exact match or '*' for all. Supports dot-prefix matching: 'company.*' matches 'company.created' */
  eventType: string;
  /** Optional object type filter — only receive events for this object type */
  objectType?: string;
  /** The handler to call */
  handler: EventHandler;
  /** Source label for logging */
  source: string;
}

const subscriptions: EventSubscription[] = [];
let nextId = 0;

/**
 * Subscribe to platform events. Returns an unsubscribe function.
 *
 * @param eventType - Event type to match. Exact match or wildcard:
 *   - `'company.created'` — exact match
 *   - `'company.*'` — matches any event starting with 'company.'
 *   - `'*'` — matches all events (use sparingly)
 * @param handler - Async function called when a matching event fires
 * @param options - Optional filters and metadata
 */
export function subscribe(
  eventType: string,
  handler: EventHandler,
  options?: { objectType?: string; source?: string }
): () => void {
  const id = `sub_${++nextId}`;
  const sub: EventSubscription = {
    id,
    eventType,
    handler,
    objectType: options?.objectType,
    source: options?.source ?? 'unknown',
  };

  subscriptions.push(sub);

  // Return unsubscribe function
  return () => {
    const idx = subscriptions.findIndex((s) => s.id === id);
    if (idx >= 0) subscriptions.splice(idx, 1);
  };
}

/**
 * Route a platform event to all matching subscribers.
 * Called by the pg_notify listener when an event arrives.
 */
export async function routeEvent(event: PlatformEventNotification): Promise<void> {
  const matching = subscriptions.filter((sub) => matchesSubscription(sub, event));

  if (matching.length === 0) return;

  // Fire all matching handlers concurrently — don't let one failure block others
  const results = await Promise.allSettled(
    matching.map(async (sub) => {
      try {
        await sub.handler(event);
      } catch (err) {
        console.error(
          `[event-router] Handler failed — sub=${sub.id} source=${sub.source} event=${event.type}:`,
          err instanceof Error ? err.message : err
        );
      }
    })
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[event-router] ${failed}/${matching.length} handlers failed for event ${event.type}`);
  }
}

function matchesSubscription(sub: EventSubscription, event: PlatformEventNotification): boolean {
  // Event type matching
  if (sub.eventType !== '*') {
    if (sub.eventType.endsWith('.*')) {
      const prefix = sub.eventType.slice(0, -1); // 'company.' from 'company.*'
      if (!event.type.startsWith(prefix)) return false;
    } else {
      if (sub.eventType !== event.type) return false;
    }
  }

  // Object type filter
  if (sub.objectType && event.objectType !== sub.objectType) return false;

  return true;
}

/**
 * Get current subscription count — useful for health checks and logging.
 */
export function getSubscriptionCount(): number {
  return subscriptions.length;
}

/**
 * List all active subscriptions — for debugging/admin.
 */
export function listSubscriptions(): Array<{ id: string; eventType: string; objectType?: string; source: string }> {
  return subscriptions.map((s) => ({
    id: s.id,
    eventType: s.eventType,
    objectType: s.objectType,
    source: s.source,
  }));
}
