# Add an object

An **object** is a registered business entity (Customer, Invoice, Lead, …).
Registering an object gives you list/detail/form UI in Workshop, REST CRUD,
typed MCP tools, auto-generated CRUD actions, and a permissions surface — for
free. No route code, no form code.

Full reference: [`objects.md`](objects.md). This page is the quickstart.

## Steps

### 1. Add the Prisma model

Edit [`shared/db/prisma/schema.prisma`](../shared/db/prisma/schema.prisma):

```prisma
model Invoice {
  id         String   @id @default(cuid())
  number     String   @unique
  amount     Decimal  @db.Decimal(12, 2)
  status     String   @default("draft")
  dueDate    DateTime?
  customerId String?
  customer   Customer? @relation(fields: [customerId], references: [id])
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([status])
  @@index([customerId])
}
```

### 2. Register it

Create [`shared/objects/src/modules/invoices.ts`](../shared/objects/src/modules/):

```ts
import type { ObjectDefinition } from '../types.js';

export const invoicesObjects: Record<string, ObjectDefinition> = {
  Invoice: {
    model: 'Invoice',
    label: 'Invoice',
    pluralLabel: 'Invoices',
    displayField: 'number',
    events: true,
    scopes: { read: 'invoice.read', write: 'invoice.write', delete: 'invoice.delete' },
    fields: {
      number:   { type: 'string', label: 'Number',  required: true, searchable: true, order: 10 },
      amount:   { type: 'number', label: 'Amount',  required: true, sortable: true,   order: 20 },
      status:   { type: 'enum',   label: 'Status',  values: ['draft', 'sent', 'paid', 'void'], filterable: true, defaultValue: 'draft', order: 30 },
      dueDate:  { type: 'date',   label: 'Due date', sortable: true, order: 40 },
      customer: { type: 'relation', label: 'Customer', kind: 'belongsTo', target: 'Customer', foreignKey: 'customerId' },
    },
  },
};
```

Wire it into [`shared/objects/src/modules/index.ts`](../shared/objects/src/modules/index.ts):

```ts
import { invoicesObjects } from './invoices.js';

export const moduleObjects: Record<string, ObjectDefinition> = {
  ...crmObjects,
  ...projectsTasksObjects,
  ...invoicesObjects,   // ← new
};
```

### 3. Migrate, seed, restart

```bash
pnpm --filter @hq/db migrate
pnpm dev:platform
```

### 4. Use it

- **Workshop:** `/objects` — Invoice appears in the sidebar. Create/edit rows through the generated forms.
- **API:** `GET /v1/objects/Invoice` (list), `POST /v1/objects/Invoice` (create), `GET /v1/objects/Invoice/:id`, etc.
- **MCP:** tools `invoice.list`, `invoice.create`, `invoice.update`, `invoice.delete` + bulk variants appear automatically.
- **Permissions:** add `invoice.read` / `invoice.write` / `invoice.delete` to roles via [`shared/auth/src/policy.ts`](../shared/auth/src/policy.ts) — objects that share a scope prefix with an existing role get them for free.

## Field type cheatsheet

| Prisma    | `type`     | Notes                                      |
| --------- | ---------- | ------------------------------------------ |
| `String`  | `string`   | Use `format: 'email'/'url'/'textarea'` for widget hints |
| `Int` `Decimal` `Float` | `number` | `currency`, `percent`, `integer` formats |
| `Boolean` | `boolean`  |                                            |
| `DateTime` | `date`    | `format: 'date'` vs `'datetime'`          |
| `enum`    | `enum`     | Provide `values: [...]`                    |
| `Json`    | `json`     | Free-form structured data                  |
| Relation  | `relation` | `kind: 'belongsTo' \| 'hasMany'`, `target`, `foreignKey` |
| File ref  | `file` / `files` | See [`files.md`](files.md)          |
| Folder ref | `folder`  | See [`files.md`](files.md)                |

## Testing

Auto-generated CRUD actions are covered by the shared test suite. For custom
behavior (ownership, validation), add a unit test under
`shared/objects/src/__tests__/` — see existing tests for the pattern.

## When NOT to register

Don't register pure join tables or internal infrastructure (queue rows,
audit entries). Objects are things a human or agent should be able to CRUD.

## Next

- Custom operations on your object → [add-action](add-action.md)
- Scheduled jobs that touch your object → [add-workflow](add-workflow.md)
- An AI assistant that can read/write your object → [add-agent](add-agent.md)
