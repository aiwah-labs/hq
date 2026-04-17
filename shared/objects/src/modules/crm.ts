/**
 * Example module — CRM
 *
 * Ships with the template as a demonstration of how to stand up a tiny CRM on
 * the Object Studio. Remove this file when the template is forked for a real
 * business ops deployment (see `docs/example-modules/crm.md` for the
 * full removal checklist).
 */
import type { ObjectDefinition } from '../types.js';

export const crmObjects: Record<string, ObjectDefinition> = {
  Customer: {
    model: 'Customer',
    label: 'Customer',
    pluralLabel: 'Customers',
    displayField: 'name',
    scopes: { read: 'customer.read', write: 'customer.write', delete: 'customer.delete' },
    events: true,
    fields: {
      name: {
        type: 'string',
        label: 'Name',
        required: true,
        searchable: true,
        sortable: true,
        display: true,
        order: 10,
        placeholder: 'Acme Inc.',
      },
      email: {
        type: 'string',
        label: 'Email',
        searchable: true,
        unique: true,
        sortable: true,
        format: 'email',
        order: 20,
        placeholder: 'you@example.com',
      },
      phone: {
        type: 'string',
        label: 'Phone',
        format: 'phone',
        order: 30,
      },
      status: {
        type: 'enum',
        label: 'Status',
        values: ['ACTIVE', 'INACTIVE'],
        filterable: true,
        sortable: true,
        order: 40,
        defaultValue: 'ACTIVE',
      },
      notes: {
        type: 'text',
        label: 'Notes',
        format: 'textarea',
        order: 50,
        list: { show: false },
      },
    },
  },

  Product: {
    model: 'Product',
    label: 'Product',
    pluralLabel: 'Products',
    displayField: 'name',
    scopes: { read: 'product.read', write: 'product.write', delete: 'product.delete' },
    events: true,
    fields: {
      name: {
        type: 'string',
        label: 'Name',
        required: true,
        searchable: true,
        sortable: true,
        display: true,
        order: 10,
      },
      description: {
        type: 'text',
        label: 'Description',
        format: 'textarea',
        order: 20,
        list: { show: false },
      },
      price: {
        type: 'number',
        label: 'Price',
        sortable: true,
        format: 'currency',
        order: 30,
      },
      status: {
        type: 'enum',
        label: 'Status',
        values: ['ACTIVE', 'ARCHIVED'],
        filterable: true,
        sortable: true,
        order: 40,
        defaultValue: 'ACTIVE',
      },
    },
  },
};
