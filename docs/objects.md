# Objects

An **Object** is a registered business entity (Customer, Product, Project, Task, …). Registering an object makes it operable across the whole stack: list/detail/form UI in Workshop, REST CRUD in the API, typed actions for agents, and auto-discovery in MCP.

## The path: from Prisma model to fully-operable object

1. **Add a Prisma model** in [`shared/db/prisma/schema.prisma`](../shared/db/prisma/schema.prisma).
2. **Register the object** in [`shared/objects/src/registry.ts`](../shared/objects/src/registry.ts).
3. **Run the migration**: `pnpm --filter @hq/db migrate`.
4. **Visit Object Studio**: navigate to `/objects` in Workshop — your new object appears automatically.
5. **Call the API**: the object exposes REST endpoints at `/v1/objects/<Type>` and `/v1/objects/<Type>/schema`.
6. **Use MCP**: auto-generated CRUD actions (`<type>.list`, `<type>.get`, `<type>.create`, …) are exposed as tools with JSON Schema parameters.

No route code or component code required.

## Registering an object

```ts
// shared/objects/src/registry.ts
import type { ObjectDefinition } from './types';

export const Project: ObjectDefinition = {
  model: 'Project',
  label: 'Project',
  pluralLabel: 'Projects',
  displayField: 'name',
  events: true,
  scopes: { read: 'project.read', write: 'project.write' },
  fields: {
    name: {
      type: 'string',
      label: 'Name',
      required: true,
      searchable: true,
      sortable: true,
      order: 10,
    },
    status: {
      type: 'enum',
      label: 'Status',
      values: ['planned', 'active', 'done'],
      filterable: true,
      defaultValue: 'planned',
      order: 20,
    },
    description: {
      type: 'text',
      label: 'Description',
      format: 'textarea',
      list: { show: false },
      order: 30,
    },
    dueDate: {
      type: 'date',
      label: 'Due date',
      format: 'date',
      sortable: true,
      order: 40,
    },
    tasks: {
      type: 'relation',
      label: 'Tasks',
      kind: 'hasMany',
      target: 'Task',
      foreignKey: 'projectId',
    },
  },
};

export const objects: Record<string, ObjectDefinition> = {
  Customer,
  Product,
  Project,
};
```

## Field metadata reference

| Key | Purpose |
|---|---|
| `type` | `string`, `text`, `number`, `boolean`, `enum`, `date`, `json`, `relation` |
| `label` | Label shown in UI |
| `description`, `placeholder`, `helpText` | Optional UX hints for forms |
| `defaultValue` | Default used when creating via Object Studio |
| `readonly` | Excluded from create/edit forms |
| `hidden` | Excluded from every generic view |
| `group` / `detail.section` | Groups fields into sections on the detail page |
| `format` | `email`, `url`, `phone`, `currency`, `percent`, `date`, `datetime`, `textarea`, `markdown` |
| `order` | Controls display order (ascending) |
| `required`, `unique` | Validation hints for derived Zod schemas |
| `searchable` | Included in the `q=` full-text filter |
| `filterable` | Exposed in the Object Studio filter bar |
| `sortable` | Usable as `sortBy` |
| `list.show`, `list.width`, `list.priority` | Column visibility/width in the table view |
| `form.show`, `form.input` | Form-rendering overrides |
| `detail.show`, `detail.section` | Detail-view overrides |

### Relations

```ts
owner: {
  type: 'relation',
  label: 'Owner',
  kind: 'belongsTo',
  target: 'User',
  foreignKey: 'ownerId',
}
tasks: {
  type: 'relation',
  label: 'Tasks',
  kind: 'hasMany',
  target: 'Task',
  foreignKey: 'projectId',
}
```

`hasMany` relations are rendered as counts on the list view and lazy-loaded on detail pages. `belongsTo` relations are included on detail pages and loaded on request via `?include=owner`.

## What you get for free

| Surface | What's generated |
|---|---|
| **Workshop `/objects`** | Index of all registered objects with record counts |
| **Workshop `/objects/<Type>`** | Table, search bar, enum filters, pagination, empty state, "New …" button |
| **Workshop `/objects/<Type>/new`** | Create form with typed inputs per field |
| **Workshop `/objects/<Type>/<id>`** | Grouped detail view with relation counts |
| **Workshop `/objects/<Type>/<id>/edit`** | Edit form |
| **API `GET /v1/objects`** | All serialized schemas |
| **API `GET /v1/objects/:type/schema`** | Serialized schema for one type |
| **API `GET/POST/PATCH/DELETE /v1/objects/:type[/:id]`** | Generic CRUD |
| **Actions** | `<type>.list`, `.count`, `.get`, `.create`, `.update`, `.delete`, `.bulkUpdate`, `.bulkDelete` |
| **MCP** | Every action above becomes a tool with a full JSON Schema |

## Scopes

Objects gate access through three scopes:

```ts
scopes: { read: 'project.read', write: 'project.write', delete: 'project.delete' /* optional; falls back to write */ }
```

- API principals must carry the matching bot scope on the api key.
- Actions inherit these scopes.
- Object Studio pages additionally require the `workshop.view` permission on user principals.

## Removing or renaming an object

Because the object lives in a single registry entry and in the Prisma schema, removing an object is a two-file change plus a migration. Any code that referenced the old name (actions, workflows, dashboards) will fail TypeScript compilation immediately — there is no runtime string lookup that hides the break.
