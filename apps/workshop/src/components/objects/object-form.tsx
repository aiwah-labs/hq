'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SerializedField, SerializedObject } from '@hq/objects';

interface Props {
  schema: SerializedObject;
  formFields: SerializedField[];
  initialValues?: Record<string, unknown>;
  action: (formData: FormData) => Promise<{ error?: string; id?: string }>;
  submitLabel?: string;
  cancelHref?: string;
}

function inputTypeFor(field: SerializedField): string {
  if (field.format === 'email') return 'email';
  if (field.format === 'url') return 'url';
  if (field.format === 'phone') return 'tel';
  if (field.format === 'date') return 'date';
  if (field.format === 'datetime') return 'datetime-local';
  if (field.type === 'number') return 'number';
  if (field.type === 'date') return 'date';
  return 'text';
}

function formatInitial(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export function ObjectForm({ schema, formFields, initialValues, action, submitLabel, cancelHref }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.id) {
        router.push(`/objects/${schema.type}/${result.id}`);
      } else {
        router.push(`/objects/${schema.type}`);
      }
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4" data-testid={`object-form-${schema.type}`}>
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13px] text-red-600"
        >
          {error}
        </div>
      )}

      {formFields.map((f) => {
        const id = `field-${f.name}`;
        const initial = formatInitial(initialValues?.[f.name] ?? f.defaultValue);

        return (
          <div key={f.name} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-[12px] font-medium text-[#0f1011]">
              {f.label}
              {f.required && <span className="ml-0.5 text-red-500">*</span>}
            </label>

            {f.type === 'enum' && f.values ? (
              <select
                id={id}
                name={f.name}
                defaultValue={initial}
                required={f.required}
                className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-1.5 text-[13px]"
              >
                {!f.required && <option value="">—</option>}
                {f.values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : f.type === 'boolean' ? (
              <select
                id={id}
                name={f.name}
                defaultValue={initial}
                className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-1.5 text-[13px]"
              >
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : f.type === 'text' || f.format === 'textarea' || f.format === 'markdown' ? (
              <textarea
                id={id}
                name={f.name}
                defaultValue={initial}
                placeholder={f.placeholder}
                required={f.required}
                rows={5}
                className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-1.5 text-[13px]"
              />
            ) : f.type === 'json' ? (
              <textarea
                id={id}
                name={f.name}
                defaultValue={initial}
                placeholder={f.placeholder ?? '{}'}
                rows={4}
                className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-1.5 font-mono text-[12px]"
              />
            ) : (
              <input
                id={id}
                name={f.name}
                type={inputTypeFor(f)}
                defaultValue={initial}
                placeholder={f.placeholder}
                required={f.required}
                className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-1.5 text-[13px]"
              />
            )}

            {f.helpText && <p className="text-[11px] text-[#62666d]">{f.helpText}</p>}
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[#009E85] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : (submitLabel ?? `Save ${schema.label}`)}
        </button>
        {cancelHref && (
          <a
            href={cancelHref}
            className="rounded-md border border-[#e6e8eb] px-3 py-1.5 text-[13px] font-medium text-[#0f1011]"
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
