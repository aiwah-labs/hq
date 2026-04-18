/**
 * Seed — CRM example module.
 *
 * Idempotent: running multiple times won't duplicate rows. Relies on unique
 * fields (email for Customer, name for Product) so repeated `prisma db seed`
 * calls converge on the same state.
 */
import type { db as Db } from '../client.js';

export async function seedCrm(db: typeof Db): Promise<void> {
  const customers = [
    { name: 'Acme Inc.', email: 'hello@acme.example', phone: '+1-555-0100', status: 'ACTIVE' as const },
    { name: 'Globex Corp', email: 'contact@globex.example', phone: '+1-555-0101', status: 'ACTIVE' as const },
    { name: 'Initech', email: 'info@initech.example', phone: null, status: 'INACTIVE' as const },
  ];
  for (const c of customers) {
    await db.customer.upsert({
      where: { email: c.email },
      update: {},
      create: c,
    });
  }

  const products = [
    { name: 'Starter Plan', description: 'Entry tier for small teams.', price: 49, status: 'ACTIVE' as const },
    { name: 'Growth Plan', description: 'Standard offering for growing orgs.', price: 199, status: 'ACTIVE' as const },
    { name: 'Legacy Pack', description: 'Kept for migration paths; not sold today.', price: 0, status: 'ARCHIVED' as const },
  ];
  for (const p of products) {
    const existing = await db.product.findFirst({ where: { name: p.name } });
    if (existing) continue;
    await db.product.create({ data: p });
  }

  console.log('Seeded example module: crm');
}
