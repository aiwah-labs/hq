'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SerializedObject } from '@hq/objects';

interface Props {
  schema: SerializedObject;
  id: string;
  deleteAction: (id: string) => Promise<{ error?: string }>;
}

export function ObjectActionsMenu({ schema, id, deleteAction }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`Delete this ${schema.label.toLowerCase()}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteAction(id);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.push(`/objects/${schema.type}`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={`/objects/${schema.type}/${id}/edit`}
        className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-1.5 text-[13px] font-medium"
      >
        Edit
      </a>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[13px] font-medium text-red-600 disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  );
}
