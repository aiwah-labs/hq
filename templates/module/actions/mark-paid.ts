// Module template — a custom action.
//
// Drop into: shared/actions/src/custom/billing/mark-paid.ts

import { z } from 'zod';
import { defineAction } from '../../../registry.js';

defineAction({
  name: 'invoice.markPaid',
  title: 'Mark invoice paid',
  description: 'Transition a sent invoice to paid and stamp paidAt.',
  category: 'custom',
  objects: { reads: ['Invoice'], writes: ['Invoice'] },
  scopes: ['invoice.write'],
  parameters: z.object({
    id: z.string().min(1),
    paidAt: z.string().datetime().optional(),
  }),
  handler: async ({ id, paidAt }, ctx) => {
    const invoice = await ctx.db.invoice.findUniqueOrThrow({ where: { id } });
    if (invoice.status !== 'sent') {
      throw new Error(`Only sent invoices can be marked paid (was ${invoice.status})`);
    }
    return ctx.db.invoice.update({
      where: { id },
      data: {
        status: 'paid',
        paidAt: paidAt ? new Date(paidAt) : new Date(),
      },
    });
  },
});
