'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveRequestAction, rejectRequestAction } from '@/app/(app)/approvals/actions';

export function ApprovalDecisionForm({ id }: { id: string }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (decision: 'approve' | 'reject') => {
    setError(null);
    startTransition(async () => {
      try {
        if (decision === 'approve') {
          await approveRequestAction(id, note || undefined);
        } else {
          await rejectRequestAction(id, note || undefined);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed.');
      }
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="approval-decision">
      <label className="text-[12px] uppercase tracking-wide text-[#62666d]" htmlFor="approval-note">
        Decision note (optional)
      </label>
      <textarea
        id="approval-note"
        data-testid="approval-note"
        className="min-h-[80px] rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-2 text-[13px] text-[#0f1011]"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={pending}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => submit('approve')}
          disabled={pending}
          data-testid="approve-button"
          className="rounded-md bg-[#009E85] px-3 py-1.5 text-[13px] font-medium text-black hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Working…' : 'Approve and run'}
        </button>
        <button
          type="button"
          onClick={() => submit('reject')}
          disabled={pending}
          data-testid="reject-button"
          className="rounded-md border border-[#e6e8eb] bg-[#ffffff] px-3 py-1.5 text-[13px] font-medium text-[#0f1011] hover:border-[var(--danger)] disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error && (
        <p className="text-[12px] text-[var(--danger)]" data-testid="approval-error">
          {error}
        </p>
      )}
    </div>
  );
}
