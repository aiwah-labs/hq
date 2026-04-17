import type { ObjectDefinition, ObjectPermissions, ObjectOwnership } from './types.js';

/**
 * Resolve the full permission key set for an object. Builder can override any
 * subset via `ObjectDefinition.permissions`; everything else defaults to
 * `{model}.{op}` with the model name lower-cased (`Task` → `task.read`).
 */
export function resolveObjectPermissions(def: ObjectDefinition): Required<ObjectPermissions> {
  const base = def.model.toLowerCase();
  return {
    read: def.permissions?.read ?? `${base}.read`,
    create: def.permissions?.create ?? `${base}.create`,
    update: def.permissions?.update ?? `${base}.update`,
    delete: def.permissions?.delete ?? `${base}.delete`,
    bulk: def.permissions?.bulk ?? `${base}.bulk`,
  };
}

export function getObjectOwnership(def: ObjectDefinition): ObjectOwnership | undefined {
  return def.ownership;
}
