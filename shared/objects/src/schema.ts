import { objects } from './registry.js';
import { resolveObjectPermissions } from './permissions.js';
import type { FieldDefinition, ObjectDefinition, ObjectOwnership, ObjectPermissions } from './types.js';

export interface SerializedField {
  name: string;
  type: FieldDefinition['type'];
  label: string;
  description?: string;
  placeholder?: string;
  helpText?: string;
  defaultValue?: unknown;
  readonly?: boolean;
  hidden?: boolean;
  display?: boolean;
  group?: string;
  format?: FieldDefinition['format'];
  order?: number;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  values?: string[];
  target?: string;
  kind?: FieldDefinition['kind'];
  foreignKey?: string;
  onDelete?: FieldDefinition['onDelete'];
  autoCreate?: FieldDefinition['autoCreate'];
  accept?: string;
  list?: FieldDefinition['list'];
  detail?: FieldDefinition['detail'];
  form?: FieldDefinition['form'];
}

export interface SerializedObject {
  type: string;
  label: string;
  pluralLabel: string;
  displayField?: string;
  events?: boolean;
  scopes: { read: string; write: string; delete?: string };
  /** Resolved permission keys (with `{model}.{op}` defaults applied). */
  permissions: Required<ObjectPermissions>;
  /** Optional ownership hints consumed by the policy engine. */
  ownership?: ObjectOwnership;
  fields: SerializedField[];
}

/** Serialize a single field into a JSON-safe shape. */
export function serializeField(name: string, field: FieldDefinition): SerializedField {
  const out: SerializedField = { name, type: field.type, label: field.label };
  const keys: (keyof FieldDefinition)[] = [
    'description',
    'placeholder',
    'helpText',
    'defaultValue',
    'readonly',
    'hidden',
    'display',
    'group',
    'format',
    'order',
    'required',
    'unique',
    'searchable',
    'filterable',
    'sortable',
    'values',
    'target',
    'kind',
    'foreignKey',
    'onDelete',
    'autoCreate',
    'accept',
    'list',
    'detail',
    'form',
  ];
  for (const k of keys) {
    const v = field[k];
    if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

function orderFields(def: ObjectDefinition): Array<[string, FieldDefinition]> {
  return Object.entries(def.fields).sort(([aName, a], [bName, b]) => {
    const ao = a.order ?? 1_000;
    const bo = b.order ?? 1_000;
    if (ao !== bo) return ao - bo;
    return aName.localeCompare(bName);
  });
}

/** Serialize an object definition into a JSON-safe schema. */
export function serializeObject(type: string, def: ObjectDefinition): SerializedObject {
  const fields = orderFields(def).map(([name, f]) => serializeField(name, f));
  return {
    type,
    label: def.label,
    pluralLabel: def.pluralLabel,
    displayField: def.displayField,
    events: def.events,
    scopes: def.scopes,
    permissions: resolveObjectPermissions(def),
    ownership: def.ownership,
    fields,
  };
}

/** Get a serialized object schema by type, or null if unknown. */
export function getObjectSchema(type: string): SerializedObject | null {
  const def = objects[type];
  return def ? serializeObject(type, def) : null;
}

/** List every registered object as a serialized schema. */
export function listObjectSchemas(): SerializedObject[] {
  return Object.entries(objects).map(([type, def]) => serializeObject(type, def));
}

function isVisible(show: boolean | undefined, defaultShow: boolean, hidden: boolean | undefined): boolean {
  if (hidden) return false;
  if (show === undefined) return defaultShow;
  return show;
}

/** Fields that should appear in a list/table view, ordered. */
export function getListFields(def: ObjectDefinition): Array<[string, FieldDefinition]> {
  return orderFields(def).filter(([, f]) => {
    if (f.type === 'relation' && f.kind === 'hasMany') return false; // don't list big relations
    return isVisible(f.list?.show, true, f.hidden);
  });
}

/** Fields that should appear in a create/edit form, ordered. Excludes relation fields by default. */
export function getFormFields(def: ObjectDefinition): Array<[string, FieldDefinition]> {
  return orderFields(def).filter(([, f]) => {
    if (f.readonly) return false;
    if (f.type === 'relation') return false;
    return isVisible(f.form?.show, true, f.hidden);
  });
}

/** Fields that should appear in the detail view, ordered. */
export function getDetailFields(def: ObjectDefinition): Array<[string, FieldDefinition]> {
  return orderFields(def).filter(([, f]) => isVisible(f.detail?.show, true, f.hidden));
}
