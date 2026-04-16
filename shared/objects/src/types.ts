/**
 * Object field type union.
 * `date`/`json` are first-class scalars (previously handled ad-hoc in schema helpers).
 */
export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'date'
  | 'json'
  | 'relation';

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
  list?: FieldListMetadata;
  detail?: FieldDetailMetadata;
  form?: FieldFormMetadata;
}

export interface ObjectScopes {
  read: string;
  write: string;
  delete?: string;
}

export interface ObjectDefinition {
  model: string;
  label: string;
  pluralLabel: string;
  /** Optional default field used as object title in UI. If omitted, generic picks a sensible default. */
  displayField?: string;
  scopes: ObjectScopes;
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
