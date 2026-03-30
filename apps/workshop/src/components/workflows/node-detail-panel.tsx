'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui';
import { X, CheckCircle2, XCircle, Clock, Play, SkipForward, Table2, Braces, List } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepExecution {
  nodeId: string;
  status: string;
  durationMs?: number | null;
  error?: string | null;
  input?: unknown;
  output?: unknown;
  evals?: Array<{ name: string; passed: boolean; score?: number; detail?: string }>;
  metadata?: Record<string, unknown>;
  annotation?: {
    label?: string;
    description?: string;
    category?: string;
    icon?: string;
    color?: string;
  };
  nodeType?: string;
  attempt?: number;
}

interface NodeDetailPanelProps {
  step: StepExecution;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusTone(status: string): 'success' | 'danger' | 'neutral' | 'teal' {
  switch (status) {
    case 'COMPLETED': return 'success';
    case 'FAILED': return 'danger';
    case 'RUNNING': return 'teal';
    default: return 'neutral';
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'COMPLETED': return <CheckCircle2 className="h-3.5 w-3.5" />;
    case 'FAILED': return <XCircle className="h-3.5 w-3.5" />;
    case 'RUNNING': return <Play className="h-3.5 w-3.5" />;
    case 'SKIPPED': return <SkipForward className="h-3.5 w-3.5" />;
    default: return <Clock className="h-3.5 w-3.5" />;
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

type DataTab = 'output' | 'input' | 'metadata';
type ViewMode = 'table' | 'json';

// ─── Component ────────────────────────────────────────────────────────────────

export function NodeDetailPanel({ step, onClose }: NodeDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DataTab>('output');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const color = step.annotation?.color ?? '#6b7280';
  const evals = step.evals ?? [];
  const hasInput = step.input != null && Object.keys(step.input as object).length > 0;
  const hasOutput = step.output != null;
  const hasMetadata = step.metadata != null && Object.keys(step.metadata).length > 0;

  const tabs: { key: DataTab; label: string; available: boolean }[] = [
    { key: 'output', label: 'Output', available: hasOutput },
    { key: 'input', label: 'Input', available: hasInput },
    { key: 'metadata', label: 'Metadata', available: hasMetadata },
  ];

  const activeData =
    activeTab === 'output' ? step.output :
    activeTab === 'input' ? step.input :
    step.metadata;

  return (
    <div className="flex h-full flex-col border-l border-divider bg-[var(--app-bg-elevated)]" data-testid="node-detail-panel">
      {/* Header */}
      <div className="shrink-0 border-b border-divider px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <h2 className="text-[14px] font-semibold truncate">
                {step.annotation?.label ?? step.nodeId}
              </h2>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone={statusTone(step.status)} className="text-[10px]">
                {statusIcon(step.status)} {step.status}
              </Badge>
              <span className="text-[11px] text-muted tabular-nums">
                {formatDuration(step.durationMs)}
              </span>
              {step.nodeType && (
                <span className="text-[11px] text-muted">{step.nodeType}</span>
              )}
              {step.attempt && step.attempt > 1 && (
                <span className="text-[11px] text-muted">attempt {step.attempt}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-foreground"
            aria-label="Close panel"
            data-testid="btn-close-panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step.annotation?.description && (
          <p className="mt-2 text-[11px] text-muted leading-snug">{step.annotation.description}</p>
        )}
      </div>

      {/* Error banner */}
      {step.error && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/5 px-4 py-2.5">
          <p className="text-[11px] font-medium text-red-500 dark:text-red-400">Error</p>
          <p className="mt-0.5 text-[12px] text-red-400 dark:text-red-300 leading-snug">{step.error}</p>
        </div>
      )}

      {/* Evals */}
      {evals.length > 0 && (
        <div className="shrink-0 border-b border-divider px-4 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted mb-1.5">Quality Checks</p>
          <div className="space-y-1">
            {evals.map((ev, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {ev.passed
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    : <XCircle className="h-3 w-3 text-red-500" />
                  }
                  <span className="text-[12px]">{ev.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {ev.score != null && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-1 w-16 rounded-full bg-surface-alt overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            ev.passed ? 'bg-emerald-500' : 'bg-red-500'
                          )}
                          style={{ width: `${(ev.score * 100).toFixed(0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted tabular-nums">{(ev.score * 100).toFixed(0)}%</span>
                    </div>
                  )}
                  {ev.detail && (
                    <span className="text-[10px] text-muted max-w-[180px] truncate">{ev.detail}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data tabs */}
      <div className="shrink-0 flex items-center justify-between border-b border-divider px-4">
        <div className="flex gap-0 -mb-px">
          {tabs.filter(t => t.available).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'relative px-3 py-2 text-[12px] font-medium transition-colors',
                activeTab === tab.key
                  ? 'text-brand-teal after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-brand-teal after:content-[""]'
                  : 'text-muted hover:text-foreground'
              )}
              data-testid={`tab-${tab.key}`}
            >
              {tab.label}
              {tab.key === 'output' && hasOutput && (
                <ItemCountBadge data={step.output} />
              )}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 rounded-md border border-divider p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              viewMode === 'table' ? 'bg-surface-alt text-foreground' : 'text-muted hover:text-foreground'
            )}
            aria-label="Table view"
            data-testid="btn-view-table"
          >
            <Table2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('json')}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              viewMode === 'json' ? 'bg-surface-alt text-foreground' : 'text-muted hover:text-foreground'
            )}
            aria-label="JSON view"
            data-testid="btn-view-json"
          >
            <Braces className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Data content */}
      <div className="flex-1 overflow-auto">
        {activeData == null ? (
          <div className="flex items-center justify-center h-full text-[13px] text-muted">
            No {activeTab} data
          </div>
        ) : viewMode === 'table' ? (
          <DataTable data={activeData} />
        ) : (
          <pre className="p-4 font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-words">
            {JSON.stringify(activeData, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Item Count Badge ─────────────────────────────────────────────────────────

function ItemCountBadge({ data }: { data: unknown }) {
  if (Array.isArray(data)) {
    return <span className="ml-1 text-[10px] text-muted">({data.length})</span>;
  }
  if (data && typeof data === 'object') {
    return <span className="ml-1 text-[10px] text-muted">({Object.keys(data).length})</span>;
  }
  return null;
}

// ─── Data Table ───────────────────────────────────────────────────────────────

function DataTable({ data }: { data: unknown }) {
  if (data == null) return null;

  // Array of objects → rows
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <div className="p-4 text-[12px] text-muted">Empty array</div>;
    }
    // Array of primitives
    if (typeof data[0] !== 'object') {
      return (
        <div className="divide-y divide-divider/50">
          {data.map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-1.5">
              <span className="text-[10px] text-muted tabular-nums w-6 shrink-0">{i}</span>
              <span className="text-[12px] font-mono">{String(item)}</span>
            </div>
          ))}
        </div>
      );
    }
    // Array of objects — show first item as key-value
    return (
      <div className="divide-y divide-divider/50">
        {data.map((item, i) => (
          <div key={i} className="px-4 py-2">
            <p className="text-[10px] font-medium text-muted mb-1">Item {i}</p>
            <KeyValueRows obj={item} />
          </div>
        ))}
      </div>
    );
  }

  // Boolean / number / string
  if (typeof data !== 'object') {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-muted">Value</span>
          <ValueCell value={data} />
        </div>
      </div>
    );
  }

  // Object → key-value table
  return (
    <div className="px-4 py-2">
      <KeyValueRows obj={data as Record<string, unknown>} />
    </div>
  );
}

function KeyValueRows({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj);

  return (
    <div className="divide-y divide-divider/30">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-3 py-1.5 min-h-[28px]">
          <span className="text-[11px] font-medium text-muted w-[140px] shrink-0 truncate pt-0.5">{key}</span>
          <div className="flex-1 min-w-0">
            <ValueCell value={value} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ValueCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-[11px] text-muted italic">null</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <Badge tone={value ? 'success' : 'neutral'} className="text-[10px]">
        {String(value)}
      </Badge>
    );
  }
  if (typeof value === 'number') {
    return <span className="text-[12px] font-mono tabular-nums">{value.toLocaleString()}</span>;
  }
  if (typeof value === 'string') {
    if (value.length > 120) {
      return (
        <span className="text-[11px] leading-snug break-words">
          {value.slice(0, 120)}<span className="text-muted">... ({value.length} chars)</span>
        </span>
      );
    }
    return <span className="text-[11px] leading-snug break-words">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[11px] text-muted">[]</span>;
    if (value.length <= 5 && value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <span key={i} className="rounded border border-divider bg-surface-alt px-1.5 py-0.5 text-[10px] font-mono">
              {String(v)}
            </span>
          ))}
        </div>
      );
    }
    return <span className="text-[11px] text-muted font-mono">Array({value.length})</span>;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    if (keys.length === 0) return <span className="text-[11px] text-muted">{'{}'}</span>;
    return (
      <details className="group">
        <summary className="cursor-pointer text-[11px] text-muted hover:text-foreground">
          Object ({keys.length} keys)
        </summary>
        <div className="mt-1 ml-2 border-l border-divider/50 pl-3">
          <KeyValueRows obj={value as Record<string, unknown>} />
        </div>
      </details>
    );
  }
  return <span className="text-[11px] font-mono">{String(value)}</span>;
}
