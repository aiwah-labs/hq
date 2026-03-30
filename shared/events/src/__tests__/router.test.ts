import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribe, routeEvent, getSubscriptionCount, listSubscriptions } from '../router.js';
import type { PlatformEventNotification } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(type: string, objectType?: string, objectId?: string): PlatformEventNotification {
  return { id: `evt_${Math.random()}`, type, objectType, objectId };
}

/**
 * The router module uses a module-level array for subscriptions.
 * We clear it before each test by collecting and calling all unsubscribe functions.
 */
const unsubscribeFns: Array<() => void> = [];

function track(fn: () => void): () => void {
  unsubscribeFns.push(fn);
  return fn;
}

beforeEach(() => {
  while (unsubscribeFns.length) unsubscribeFns.pop()!();
});

// ── subscribe & unsubscribe ───────────────────────────────────────────────────

describe('subscribe', () => {
  it('increases subscription count', () => {
    const before = getSubscriptionCount();
    const unsub = track(subscribe('company.created', async () => {}));
    expect(getSubscriptionCount()).toBe(before + 1);
  });

  it('returns an unsubscribe function that removes the subscription', () => {
    const before = getSubscriptionCount();
    const unsub = subscribe('company.created', async () => {});
    expect(getSubscriptionCount()).toBe(before + 1);
    unsub();
    expect(getSubscriptionCount()).toBe(before);
  });

  it('calling unsubscribe twice is safe', () => {
    const unsub = subscribe('company.created', async () => {});
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  it('appears in listSubscriptions', () => {
    track(subscribe('company.created', async () => {}, { source: 'test-source' }));
    const subs = listSubscriptions();
    expect(subs.some((s) => s.eventType === 'company.created' && s.source === 'test-source')).toBe(true);
  });
});

// ── exact match routing ───────────────────────────────────────────────────────

describe('routeEvent — exact match', () => {
  it('calls handler for exact matching event type', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.created', handler));
    await routeEvent(makeEvent('company.created'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler for non-matching event type', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.created', handler));
    await routeEvent(makeEvent('company.updated'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes the full event object to the handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('contact.created', handler));
    const event = makeEvent('contact.created', 'Contact', 'c_1');
    await routeEvent(event);
    expect(handler).toHaveBeenCalledWith(event);
  });
});

// ── wildcard routing ──────────────────────────────────────────────────────────

describe('routeEvent — wildcard patterns', () => {
  it('company.* matches company.created', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.*', handler));
    await routeEvent(makeEvent('company.created'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('company.* matches company.updated', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.*', handler));
    await routeEvent(makeEvent('company.updated'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('company.* does NOT match contact.created', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.*', handler));
    await routeEvent(makeEvent('contact.created'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('* matches any event type', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('*', handler));
    await routeEvent(makeEvent('company.created'));
    await routeEvent(makeEvent('contact.updated'));
    await routeEvent(makeEvent('workflow.run.completed'));
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('exact subscription only fires for its specific type when wildcard also present', async () => {
    const exact = vi.fn().mockResolvedValue(undefined);
    const wild = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.created', exact));
    track(subscribe('company.*', wild));
    await routeEvent(makeEvent('company.created'));
    expect(exact).toHaveBeenCalledTimes(1);
    expect(wild).toHaveBeenCalledTimes(1);
    await routeEvent(makeEvent('company.updated'));
    expect(exact).toHaveBeenCalledTimes(1); // still 1
    expect(wild).toHaveBeenCalledTimes(2);
  });
});

// ── objectType filter ─────────────────────────────────────────────────────────

describe('routeEvent — objectType filter', () => {
  it('calls handler when objectType matches', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.*', handler, { objectType: 'Company' }));
    await routeEvent(makeEvent('company.created', 'Company'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler when objectType differs', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.*', handler, { objectType: 'Company' }));
    await routeEvent(makeEvent('company.created', 'Contact'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler when no objectType filter set (any object passes)', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.*', handler));
    await routeEvent(makeEvent('company.created', 'Company'));
    await routeEvent(makeEvent('company.created', 'Contact'));
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

// ── multiple subscribers ──────────────────────────────────────────────────────

describe('routeEvent — multiple subscribers', () => {
  it('calls all matching subscribers', async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);
    const h3 = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.created', h1));
    track(subscribe('company.created', h2));
    track(subscribe('company.*', h3));
    await routeEvent(makeEvent('company.created'));
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(h3).toHaveBeenCalledTimes(1);
  });

  it('only calls subscribers that match', async () => {
    const match = vi.fn().mockResolvedValue(undefined);
    const noMatch = vi.fn().mockResolvedValue(undefined);
    track(subscribe('company.created', match));
    track(subscribe('contact.created', noMatch));
    await routeEvent(makeEvent('company.created'));
    expect(match).toHaveBeenCalledTimes(1);
    expect(noMatch).not.toHaveBeenCalled();
  });
});

// ── error isolation ───────────────────────────────────────────────────────────

describe('routeEvent — error isolation', () => {
  it('calls subsequent handlers even when a prior one throws', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('handler error'));
    const succeeding = vi.fn().mockResolvedValue(undefined);
    track(subscribe('test.event', failing));
    track(subscribe('test.event', succeeding));
    // Should not throw
    await expect(routeEvent(makeEvent('test.event'))).resolves.toBeUndefined();
    expect(succeeding).toHaveBeenCalledTimes(1);
  });

  it('does not throw when all handlers fail', async () => {
    track(subscribe('test.event', async () => { throw new Error('fail'); }));
    track(subscribe('test.event', async () => { throw new Error('fail2'); }));
    await expect(routeEvent(makeEvent('test.event'))).resolves.toBeUndefined();
  });

  it('returns immediately when no subscribers match', async () => {
    // No subscriptions at all
    await expect(routeEvent(makeEvent('orphan.event'))).resolves.toBeUndefined();
  });
});

// ── concurrent execution ──────────────────────────────────────────────────────

describe('routeEvent — concurrent execution', () => {
  it('runs handlers concurrently (all start before any resolves)', async () => {
    const order: string[] = [];
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    track(subscribe('test.concurrent', async () => {
      order.push('h1-start');
      await delay(20);
      order.push('h1-end');
    }));

    track(subscribe('test.concurrent', async () => {
      order.push('h2-start');
      await delay(10);
      order.push('h2-end');
    }));

    await routeEvent(makeEvent('test.concurrent'));

    // Both should have started before either ended (concurrent)
    expect(order.indexOf('h1-start')).toBeLessThan(order.indexOf('h2-end'));
    expect(order.indexOf('h2-start')).toBeLessThan(order.indexOf('h1-end'));
  });
});
