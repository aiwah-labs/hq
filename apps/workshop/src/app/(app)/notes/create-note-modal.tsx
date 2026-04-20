'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Field, Label, Input, Textarea, SubmitButton } from '@/components/ui';
import { createNoteAction } from './actions';

export function CreateNoteModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const note = await createNoteAction(fd);
        setOpen(false);
        formRef.current?.reset();
        router.push(`/notes/${(note as { id: string }).id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create note.');
      }
    });
  }

  return (
    <Modal trigger="New Note" title="Create Note" open={open} onOpenChange={setOpen}>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-[6px] bg-[var(--color-danger)]/10 px-3 py-2 text-[13px] text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <Field>
          <Label htmlFor="note-title">Title</Label>
          <Input
            id="note-title"
            name="title"
            placeholder="Note title…"
            required
            autoFocus
            data-testid="note-title-input"
          />
        </Field>

        <Field>
          <Label htmlFor="note-body">Content (Markdown)</Label>
          <Textarea
            id="note-body"
            name="body"
            placeholder="Write your note in markdown…"
            rows={6}
            data-testid="note-body-input"
          />
        </Field>

        <Field>
          <Label htmlFor="note-tags">Tags</Label>
          <Input
            id="note-tags"
            name="tags"
            placeholder="strategy, research, ai (comma separated)"
            data-testid="note-tags-input"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-[6px] px-3 py-1.5 text-[13px] text-[#62666d] hover:text-[#0f1011]"
          >
            Cancel
          </button>
          <SubmitButton disabled={isPending}>Create Note</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
