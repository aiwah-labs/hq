// Module template — objects.
//
// Drop into: shared/objects/src/modules/billing.ts
// Rename exports and object keys to match your domain.

import type { ObjectDefinition } from '../types.js';

export const billingObjects: Record<string, ObjectDefinition> = {
  Invoice: {
    model: 'Invoice',
    label: 'Invoice',
    pluralLabel: 'Invoices',
    displayField: 'number',
    events: true,
    scopes: { read: 'invoice.read', write: 'invoice.write', delete: 'invoice.delete' },
    fields: {
      number:  { type: 'string', label: 'Number',  required: true, searchable: true, sortable: true, display: true, order: 10 },
      amount:  { type: 'number', label: 'Amount',  required: true, sortable: true, format: 'currency', order: 20 },
      status:  { type: 'enum',   label: 'Status',  values: ['draft','sent','paid','void'], defaultValue: 'draft', filterable: true, order: 30 },
      dueDate: { type: 'date',   label: 'Due date', format: 'date', sortable: true, order: 40 },
      customer: { type: 'relation', label: 'Customer', kind: 'belongsTo', target: 'Customer', foreignKey: 'customerId' },
    },
  },
};
