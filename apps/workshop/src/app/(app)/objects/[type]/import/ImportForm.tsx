'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { previewImportAction, runImportAction } from './actions';
import type { ImportPreview } from '@hq/objects';

const SAMPLE_LIMIT = 5;

interface Props {
  type: string;
  label: string;
}

export function ImportForm({ type, label }: Props) {
  const router = useRouter();
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; failed: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setContent(text);
    setFormat(f.name.endsWith('.json') ? 'json' : 'csv');
    setPreview(null);
    setSummary(null);
    setJobId(null);
  }

  function onPreview() {
    setError(null);
    setSummary(null);
    setJobId(null);
    startTransition(async () => {
      const res = await previewImportAction(type, format, content);
      if (res.error) setError(res.error);
      else setPreview(res.preview ?? null);
    });
  }

  function onRun(mode: 'sync' | 'async') {
    setError(null);
    startTransition(async () => {
      const res = await runImportAction(type, format, content, mode);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.jobId) {
        setJobId(res.jobId);
      } else {
        setSummary({ created: res.created ?? 0, failed: res.failed ?? 0 });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="object-import-form">
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-medium text-[var(--app-fg)]">
          Upload a file
        </label>
        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={onFileChange}
          className="text-[13px]"
          data-testid="object-import-file"
        />
      </div>

      <div className="flex gap-3">
        <div className="w-32">
          <label className="text-[13px] font-medium text-[var(--app-fg)]">Format</label>
          <Select value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-medium text-[var(--app-fg)]">
          Or paste content
        </label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder={
            format === 'csv'
              ? 'name,count\nAlpha,1\nBeta,2'
              : '[{"name":"Alpha","count":1}]'
          }
          data-testid="object-import-content"
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={onPreview}
          disabled={!content.trim() || isPending}
          data-testid="object-import-preview-btn"
        >
          {isPending ? 'Previewing…' : 'Preview'}
        </Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {preview && (
        <div className="flex flex-col gap-3 rounded-md border border-divider p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Preview</h2>
            <div className="flex gap-1.5">
              <Badge tone="neutral">{preview.totalRows} rows</Badge>
              {preview.errorCount > 0 ? (
                <Badge tone="danger">{preview.errorCount} errors</Badge>
              ) : (
                <Badge tone="success">valid</Badge>
              )}
            </div>
          </div>

          {preview.fileErrors.length > 0 && (
            <Alert tone="danger">
              <ul className="list-disc pl-5">
                {preview.fileErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div>
            <p className="mb-1 text-[12px] text-[var(--app-muted)]">
              Mapping: {Object.keys(preview.fieldMap).length === 0
                ? '(no source fields match)'
                : Object.entries(preview.fieldMap).map(([s, t]) => `${s} → ${t}`).join(', ')}
            </p>
          </div>

          {preview.sampleRows.length > 0 && (
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-divider">
                    <th className="py-1.5 pr-2 text-left font-medium">Row</th>
                    <th className="py-1.5 pr-2 text-left font-medium">Data</th>
                    <th className="py-1.5 pr-2 text-left font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.slice(0, SAMPLE_LIMIT * 4).map((row) => (
                    <tr key={row.row} className="border-b border-divider/50 align-top">
                      <td className="py-1.5 pr-2 text-[var(--app-muted)]">{row.row}</td>
                      <td className="py-1.5 pr-2 font-mono">
                        {JSON.stringify(row.data)}
                      </td>
                      <td className="py-1.5 pr-2">
                        {row.errors.length === 0 ? (
                          <span className="text-[var(--app-muted)]">—</span>
                        ) : (
                          <ul className="text-red-600">
                            {row.errors.map((e, i) => (
                              <li key={i}>
                                {e.field ? `${e.field}: ` : ''}
                                {e.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2 border-t border-divider pt-3">
            <Button
              variant="primary"
              onClick={() => onRun('sync')}
              disabled={isPending || preview.fileErrors.length > 0}
              data-testid="object-import-run-sync"
            >
              {isPending ? 'Importing…' : `Import ${label}`}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onRun('async')}
              disabled={isPending || preview.fileErrors.length > 0}
              data-testid="object-import-run-async"
            >
              Queue as job
            </Button>
          </div>
        </div>
      )}

      {summary && (
        <Alert tone={summary.failed > 0 ? 'danger' : 'success'}>
          Imported {summary.created} rows{' '}
          {summary.failed > 0 ? `(${summary.failed} skipped due to errors)` : ''}.
        </Alert>
      )}

      {jobId && (
        <Alert tone="info">
          Queued as job <code>{jobId}</code>.{' '}
          <Link href="/jobs" className="underline">
            Watch on the Jobs page
          </Link>
          .
        </Alert>
      )}
    </div>
  );
}
