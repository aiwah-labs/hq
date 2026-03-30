import { z } from 'zod';
import { defineAction } from '../../registry.js';

defineAction({
  name: 'product.archive',
  description: 'Archive a product, making it inactive',
  category: 'custom',
  scopes: ['product.write'],
  parameters: z.object({
    productId: z.string().min(1),
  }),
  handler: async (params, ctx) => {
    return ctx.db.product.update({
      where: { id: params.productId },
      data: { status: 'ARCHIVED' },
    });
  },
});
