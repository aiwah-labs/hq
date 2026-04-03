// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { defineSkill } from '../skills.js';

export const dataSkill = defineSkill({
  name: 'data',
  description: 'Read and update Customers and Products',
  actions: [
    'customer.list', 'customer.get', 'customer.count', 'customer.create', 'customer.update', 'customer.delete',
    'customer.addNote',
    'product.list', 'product.get', 'product.count', 'product.create', 'product.update', 'product.delete',
    'product.archive',
  ],
  instructions: `When working with data:
- Always confirm before creating or updating records
- Use list with filters before creating a new record to avoid duplicates
- Use customer.addNote to log interactions rather than overwriting the notes field directly`,
});
