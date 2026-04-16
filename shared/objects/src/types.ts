export interface FieldDefinition {
  type: 'string' | 'text' | 'number' | 'boolean' | 'enum' | 'relation';
  label: string;
  description?: string;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  values?: string[]; // for enum
  target?: string; // for relation
  kind?: 'hasMany' | 'belongsTo';
  foreignKey?: string;
}

export interface ObjectScopes {
  read: string;
  write: string;
  delete: string;
}

export interface ObjectDefinition {
  model: string;
  label: string;
  pluralLabel: string;
  scopes: ObjectScopes;
  events?: boolean;
  fields: Record<string, FieldDefinition>;
}
