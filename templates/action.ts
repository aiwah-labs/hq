// Template: a custom action.
//
// 1. Drop a copy into `shared/actions/src/custom/<domain>/<action>.ts`.
// 2. Create an index in that folder: `export {} from './<action>.js';`
//    (or `import './<action>.js';` if using side-effect registration).
// 3. REGISTER: in `shared/actions/src/index.ts` add:
//      import './custom/<domain>/index.js';
// 4. Restart `pnpm dev:platform` — the action is live on every surface.
//
// Paired guide: docs/add-action.md

import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'invoice.markPaid',
  title: 'Mark invoice paid',
  description: 'Transition a sent invoice to paid and stamp paidAt.',
  category: 'custom',
  objects: { reads: ['Invoice'], writes: ['Invoice'] },
  scopes: ['invoice.write'],
  // risk: 'high',                          // optional — gates the action
  // approval: { required: true },          // optional — goes to approvals queue
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
