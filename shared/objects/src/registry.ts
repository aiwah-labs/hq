import type { ObjectDefinition } from './types.js';

export const objects: Record<string, ObjectDefinition> = {
  Customer: {
    model: 'Customer',
    label: 'Customer',
    pluralLabel: 'Customers',
    scopes: { read: 'customer.read', write: 'customer.write', delete: 'customer.delete' },
    events: true,
    fields: {
      name: { type: 'string', required: true, label: 'Name', searchable: true, sortable: true },
      email: { type: 'string', label: 'Email', searchable: true, unique: true },
      phone: { type: 'string', label: 'Phone' },
      status: { type: 'enum', label: 'Status', values: ['ACTIVE', 'INACTIVE'], filterable: true },
      notes: { type: 'text', label: 'Notes' },
    },
  },

  Product: {
    model: 'Product',
    label: 'Product',
    pluralLabel: 'Products',
    scopes: { read: 'product.read', write: 'product.write', delete: 'product.delete' },
    events: true,
    fields: {
      name: { type: 'string', required: true, label: 'Name', searchable: true, sortable: true },
      description: { type: 'text', label: 'Description' },
      price: { type: 'number', label: 'Price', sortable: true },
      status: { type: 'enum', label: 'Status', values: ['ACTIVE', 'ARCHIVED'], filterable: true },
    },
  },
};
