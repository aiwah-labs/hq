// Template: a registered object.
//
// 1. Drop a copy into `shared/objects/src/modules/<name>.ts`.
// 2. Add the Prisma model in `shared/db/prisma/schema.prisma`.
// 3. REGISTER: in `shared/objects/src/modules/index.ts` add:
//      import { myObjects } from './<name>.js';
//      ...myObjects inside `moduleObjects`
// 4. `pnpm --filter @hq/db migrate` then `pnpm dev:platform`.
//
// Paired guide: docs/add-object.md

import type { ObjectDefinition } from '../types.js';

export const myObjects: Record<string, ObjectDefinition> = {
  Invoice: {
    model: 'Invoice',
    label: 'Invoice',
    pluralLabel: 'Invoices',
    displayField: 'number',
    events: true,
    scopes: { read: 'invoice.read', write: 'invoice.write', delete: 'invoice.delete' },
    fields: {
      number: {
        type: 'string',
        label: 'Number',
        required: true,
        searchable: true,
        sortable: true,
        display: true,
        order: 10,
      },
      amount: {
        type: 'number',
        label: 'Amount',
        required: true,
        sortable: true,
        format: 'currency',
        order: 20,
      },
      status: {
        type: 'enum',
        label: 'Status',
        values: ['draft', 'sent', 'paid', 'void'],
        defaultValue: 'draft',
        filterable: true,
        order: 30,
      },
      dueDate: {
        type: 'date',
        label: 'Due date',
        format: 'date',
        sortable: true,
        order: 40,
      },
      customer: {
        type: 'relation',
        label: 'Customer',
        kind: 'belongsTo',
        target: 'Customer',
        foreignKey: 'customerId',
      },
    },
  },
};
