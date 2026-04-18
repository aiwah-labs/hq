// Module template — seed.
//
// Drop into: shared/db/src/seed-modules/billing.ts
// Register in: shared/db/src/seed-modules/index.ts (or seed.ts) → add seedBilling() to the run list.
//
// Idempotent: run it N times, you get the same state. Use upserts over inserts
// and key on a unique field so repeated runs converge.

import type { db as Db } from '../client.js';

export async function seedBilling(db: typeof Db): Promise<void> {
  const acme = await db.customer.findUnique({ where: { email: 'hello@acme.example' } });
  if (!acme) {
    console.log('seedBilling: skipping — CRM seed has not run yet.');
    return;
  }

  const invoices = [
    { number: 'INV-001', amount: 1200, status: 'sent' as const, dueDate: new Date('2026-05-01'), customerId: acme.id },
    { number: 'INV-002', amount: 800,  status: 'paid' as const, dueDate: new Date('2026-04-01'), customerId: acme.id },
  ];
  for (const inv of invoices) {
    await db.invoice.upsert({
      where: { number: inv.number },
      update: {},
      create: inv,
    });
  }

  console.log('Seeded example module: billing');
}
