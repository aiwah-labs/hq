/**
 * Seed — CRM example module.
 *
 * Idempotent: running multiple times won't duplicate rows. Customers are keyed
 * by email, products by name, orders by (customerId, productId, createdAt day).
 */
import type { db as Db } from '../client.js';

const CUSTOMERS = [
  { name: 'Acme Inc.',        email: 'hello@acme.example',      phone: '+1-555-0100', status: 'ACTIVE'   as const },
  { name: 'Globex Corp',      email: 'contact@globex.example',  phone: '+1-555-0101', status: 'ACTIVE'   as const },
  { name: 'Initech',          email: 'info@initech.example',    phone: null,          status: 'INACTIVE' as const },
  { name: 'Umbrella Ltd',     email: 'ops@umbrella.example',    phone: '+1-555-0102', status: 'ACTIVE'   as const },
  { name: 'Soylent Systems',  email: 'hello@soylent.example',   phone: null,          status: 'ACTIVE'   as const },
  { name: 'Massive Dynamic',  email: 'info@massive.example',    phone: '+1-555-0103', status: 'ACTIVE'   as const },
];

const PRODUCTS = [
  { name: 'Starter Plan',  description: 'Entry tier for small teams.',           price: 49,  status: 'ACTIVE'   as const },
  { name: 'Growth Plan',   description: 'Standard offering for growing orgs.',   price: 199, status: 'ACTIVE'   as const },
  { name: 'Pro Plan',      description: 'Advanced features and priority support.',price: 399, status: 'ACTIVE'   as const },
  { name: 'Enterprise',    description: 'Unlimited seats, SLA, dedicated CSM.',  price: 999, status: 'ACTIVE'   as const },
  { name: 'Legacy Pack',   description: 'Kept for migration paths; not sold today.', price: 0, status: 'ARCHIVED' as const },
];

type OrderSeed = {
  customerEmail: string;
  productName: string;
  quantity: number;
  amount: number;
  status: 'OPEN' | 'FULFILLED' | 'CANCELLED';
  daysAgo: number;
};

const ORDERS: OrderSeed[] = [
  { customerEmail: 'hello@acme.example',     productName: 'Enterprise',  quantity: 1, amount: 999,  status: 'FULFILLED', daysAgo: 2  },
  { customerEmail: 'contact@globex.example', productName: 'Pro Plan',    quantity: 1, amount: 399,  status: 'OPEN',      daysAgo: 2  },
  { customerEmail: 'ops@umbrella.example',   productName: 'Starter Plan',quantity: 1, amount: 49,   status: 'OPEN',      daysAgo: 3  },
  { customerEmail: 'hello@acme.example',     productName: 'Enterprise',  quantity: 1, amount: 999,  status: 'FULFILLED', daysAgo: 4  },
  { customerEmail: 'hello@soylent.example',  productName: 'Growth Plan', quantity: 1, amount: 199,  status: 'CANCELLED', daysAgo: 5  },
  { customerEmail: 'info@massive.example',   productName: 'Starter Plan',quantity: 1, amount: 49,   status: 'FULFILLED', daysAgo: 6  },
  { customerEmail: 'contact@globex.example', productName: 'Enterprise',  quantity: 1, amount: 999,  status: 'FULFILLED', daysAgo: 8  },
  { customerEmail: 'ops@umbrella.example',   productName: 'Pro Plan',    quantity: 1, amount: 399,  status: 'OPEN',      daysAgo: 9  },
  { customerEmail: 'info@massive.example',   productName: 'Growth Plan', quantity: 2, amount: 398,  status: 'FULFILLED', daysAgo: 12 },
  { customerEmail: 'hello@soylent.example',  productName: 'Starter Plan',quantity: 1, amount: 49,   status: 'FULFILLED', daysAgo: 14 },
];

export async function seedCrm(db: typeof Db): Promise<void> {
  for (const c of CUSTOMERS) {
    await db.customer.upsert({
      where: { email: c.email },
      update: {},
      create: c,
    });
  }

  for (const p of PRODUCTS) {
    const existing = await db.product.findFirst({ where: { name: p.name } });
    if (!existing) await db.product.create({ data: p });
  }

  // Seed orders — keyed by (customerEmail, productName, daysAgo) via a stable createdAt
  for (const o of ORDERS) {
    const customer = await db.customer.findUnique({ where: { email: o.customerEmail } });
    const product  = await db.product.findFirst({ where: { name: o.productName } });
    if (!customer || !product) continue;

    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - o.daysAgo);
    createdAt.setHours(0, 0, 0, 0);

    const existing = await db.order.findFirst({
      where: { customerId: customer.id, productId: product.id, createdAt },
    });
    if (existing) continue;

    await db.order.create({
      data: {
        customerId: customer.id,
        productId:  product.id,
        quantity:   o.quantity,
        amount:     o.amount,
        status:     o.status,
        createdAt,
      },
    });
  }

  console.log('Seeded example module: crm');
}
