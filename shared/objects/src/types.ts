/**
 * Object field type union.
 * `date`/`json` are first-class scalars (previously handled ad-hoc in schema helpers).
 * `file`/`files`/`folder` integrate with the files module:
 *   - `file` holds a single FileObject id
 *   - `files` holds a list of FileObject ids
 *   - `folder` holds a Folder id (often paired with `autoCreate`)
 */
export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'date'
  | 'json'
  | 'relation'
  | 'file'
  | 'files'
  | 'folder';

/** Format hint for string/text/number fields. Guides form inputs and field rendering. */
export type FieldFormat =
  | 'email'
  | 'url'
  | 'phone'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'textarea'
  | 'markdown';

export interface FieldListMetadata {
  show?: boolean;
  width?: string;
  priority?: number;
}

export interface FieldDetailMetadata {
  show?: boolean;
  section?: string;
}

export interface FieldFormMetadata {
  show?: boolean;
  input?: string;
}

export interface FieldDefinition {
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  helpText?: string;
  defaultValue?: unknown;
  readonly?: boolean;
  hidden?: boolean;
  /** Reserved — used by generic UI to treat the field as the display name. */
  display?: boolean;
  /** Optional group name for form sections. */
  group?: string;
  format?: FieldFormat;
  order?: number;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  /** Enum values. */
  values?: string[];
  /** Relation target model name. */
  target?: string;
  kind?: 'hasMany' | 'belongsTo';
  foreignKey?: string;
  /**
   * Cascade behavior for `file`/`files`/`folder` and `relation` fields when
   * the parent record is deleted. Indexers and the files module honor this
   * hint — the generic crud layer does not enforce it directly.
   */
  onDelete?: 'cascade' | 'nullify' | 'restrict';
  /**
   * Folder auto-creation hint. Used with `folder` fields: when a record is
   * created the files module can `ensureFolder(template)` and store the
   * resulting folder id on the field. `{name}` / `{id}` are substituted from
   * the record's display field / id.
   *
   * Example: `autoCreate: { template: '/Products/{name}' }` on Product.assets
   * creates `/Products/Acme Widget/` when a Product is inserted.
   */
  autoCreate?: { template: string; kind?: 'USER' | 'SYSTEM' | 'TEMP' };
  /**
   * Optional MIME prefix filter for `file`/`files` fields (e.g. `image/`).
   * Hints the upload UI and file picker to restrict content.
   */
  accept?: string;
  list?: FieldListMetadata;
  detail?: FieldDetailMetadata;
  form?: FieldFormMetadata;
}

export interface ObjectScopes {
  read: string;
  write: string;
  delete?: string;
}

/**
 * Per-object permission keys used by the policy engine. When omitted, the
 * registry derives keys as `{model}.{op}` from a lower-cased model name
 * (e.g. `task.read`, `task.update`). Override if you want to share a
 * permission across several objects (e.g. all CRM objects under `crm.*`).
 */
export interface ObjectPermissions {
  read?: string;
  create?: string;
  update?: string;
  delete?: string;
  bulk?: string;
}

/** Ownership hints consumed by `resolveObjectAccess` / `recordBelongsToUser`. */
export interface ObjectOwnership {
  ownerField?: string;
  assigneeField?: string;
  extraFields?: string[];
}

export interface ObjectDefinition {
  model: string;
  label: string;
  pluralLabel: string;
  /** Optional default field used as object title in UI. If omitted, generic picks a sensible default. */
  displayField?: string;
  scopes: ObjectScopes;
  /** Optional: override default `{model}.{op}` permission keys. */
  permissions?: ObjectPermissions;
  /** Optional: how to check "does this record belong to `principal.userId`?". */
  ownership?: ObjectOwnership;
  events?: boolean;
  fields: Record<string, FieldDefinition>;
}

/** Parameters accepted by `objectList` / `objectCount`. */
export interface ListParams {
  q?: string;
  filters?: Record<string, unknown>;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
  include?: string[];
}
