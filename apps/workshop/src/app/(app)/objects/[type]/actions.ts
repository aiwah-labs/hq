'use server';

import { revalidatePath } from 'next/cache';
import {
  objects,
  objectCreate,
  objectUpdate,
  objectDelete,
  getObjectSchema,
  type SerializedField,
} from '@hq/objects';
import { createServiceContext } from '@hq/services';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';

function toError(message: unknown): string {
  if (message instanceof Error) return message.message;
  return 'Action failed.';
}

function coerceValue(field: SerializedField, raw: FormDataEntryValue | null): unknown {
  if (raw === null || raw === '') return undefined;
  const s = String(raw);
  switch (field.type) {
    case 'number':
      return Number(s);
    case 'boolean':
      return s === 'true';
    case 'date':
      return new Date(s).toISOString();
    case 'json':
      try {
        return JSON.parse(s);
      } catch {
        throw new Error(`Field "${field.label}" must be valid JSON.`);
      }
    default:
      return s;
  }
}

function parseFormData(type: string, formData: FormData): Record<string, unknown> {
  const schema = getObjectSchema(type);
  if (!schema) throw new Error(`Unknown object type: ${type}`);
  const data: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (f.readonly) continue;
    if (f.type === 'relation') continue;
    const raw = formData.get(f.name);
    const coerced = coerceValue(f, raw);
    if (coerced !== undefined) data[f.name] = coerced;
  }
  return data;
}

export async function createObjectAction(
  type: string,
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  try {
    const principal = await requirePermission(PERMISSIONS.workshopView);
    const def = objects[type];
    if (!def) return { error: `Unknown object type: ${type}` };
    const ctx = createServiceContext(principal);
    const data = parseFormData(type, formData);
    const record = (await objectCreate(type, data, ctx)) as { id: string };
    revalidatePath(`/objects/${type}`);
    return { id: record.id };
  } catch (err) {
    return { error: toError(err) };
  }
}

export async function updateObjectAction(
  type: string,
  id: string,
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  try {
    const principal = await requirePermission(PERMISSIONS.workshopView);
    const def = objects[type];
    if (!def) return { error: `Unknown object type: ${type}` };
    const ctx = createServiceContext(principal);
    const data = parseFormData(type, formData);
    await objectUpdate(type, id, data, ctx);
    revalidatePath(`/objects/${type}`);
    revalidatePath(`/objects/${type}/${id}`);
    return { id };
  } catch (err) {
    return { error: toError(err) };
  }
}

export async function deleteObjectAction(
  type: string,
  id: string,
): Promise<{ error?: string }> {
  try {
    const principal = await requirePermission(PERMISSIONS.workshopView);
    const def = objects[type];
    if (!def) return { error: `Unknown object type: ${type}` };
    const ctx = createServiceContext(principal);
    await objectDelete(type, id, ctx);
    revalidatePath(`/objects/${type}`);
    return {};
  } catch (err) {
    return { error: toError(err) };
  }
}
