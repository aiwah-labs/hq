import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'customer.addNote',
  description: 'Append a note to a customer record',
  category: 'custom',
  scopes: ['customer.write'],
  parameters: z.object({
    customerId: z.string().min(1),
    note: z.string().min(1),
  }),
  handler: async (params, ctx) => {
    const customer = await ctx.db.customer.findUniqueOrThrow({ where: { id: params.customerId } });
    const existing = customer.notes ?? '';
    const timestamp = new Date().toISOString().slice(0, 10);
    const updated = existing ? `${existing}\n\n[${timestamp}] ${params.note}` : `[${timestamp}] ${params.note}`;
    return ctx.db.customer.update({
      where: { id: params.customerId },
      data: { notes: updated },
    });
  },
});
