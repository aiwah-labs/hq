'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl, getInternalSecret } from '@/lib/api-url';

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; name: string }
  | { kind: 'done'; name: string }
  | { kind: 'error'; message: string };

interface BeginResult {
  fileId: string;
  storageKey: string;
  method: 'passthrough' | 'presigned';
  uploadUrl: string | null;
  expiresInSeconds: number;
}

export function UploadForm({ folderId }: { folderId: string }) {
  const [state, setState] = useState<UploadState>({ kind: 'idle' });
  const router = useRouter();

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const base = getApiBaseUrl();
    const secret = getInternalSecret();
    setState({ kind: 'uploading', name: file.name });

    try {
      const beginResponse = await fetch(`${base}/v1/files`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-shared-secret': secret,
        },
        body: JSON.stringify({
          folderId,
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
        }),
      });
      if (!beginResponse.ok) {
        throw new Error(`beginUpload failed (${beginResponse.status})`);
      }
      const begin = (await beginResponse.json()) as BeginResult;

      if (begin.method === 'presigned' && begin.uploadUrl) {
        const putResponse = await fetch(begin.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!putResponse.ok) throw new Error(`PUT to storage failed (${putResponse.status})`);

        const completeResponse = await fetch(`${base}/v1/files/${begin.fileId}/complete`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-shared-secret': secret,
          },
          body: JSON.stringify({ size: file.size, mime: file.type || undefined }),
        });
        if (!completeResponse.ok) throw new Error(`complete failed (${completeResponse.status})`);
      } else {
        const uploadResponse = await fetch(`${base}/v1/files/${begin.fileId}/upload`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-internal-shared-secret': secret,
          },
          body: file,
        });
        if (!uploadResponse.ok) throw new Error(`upload failed (${uploadResponse.status})`);
      }

      setState({ kind: 'done', name: file.name });
      event.target.value = '';
      router.refresh();
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div data-testid="upload-form">
      <label
        htmlFor="files-upload-input"
        style={{
          display: 'inline-block',
          padding: '8px 14px',
          borderRadius: 6,
          border: '1px solid #d1d5db',
          background: '#f9fafb',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Choose file to upload
      </label>
      <input
        id="files-upload-input"
        data-testid="upload-input"
        type="file"
        onChange={handleChange}
        disabled={state.kind === 'uploading'}
        style={{ display: 'none' }}
      />
      <div role="status" aria-live="polite" style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
        {state.kind === 'uploading' && `Uploading ${state.name}…`}
        {state.kind === 'done' && `Uploaded ${state.name}. Refreshing…`}
        {state.kind === 'error' && <span style={{ color: '#b91c1c' }}>Error: {state.message}</span>}
      </div>
    </div>
  );
}
