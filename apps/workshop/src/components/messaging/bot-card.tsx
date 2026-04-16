'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

type Block =
  | { type: 'text'; text: string; style?: 'normal' | 'bold' | 'muted' | 'code' }
  | { type: 'heading'; text: string; level?: 1 | 2 | 3 }
  | { type: 'image'; url: string; alt?: string; caption?: string }
  | { type: 'button'; label: string; value?: string; variant?: 'primary' | 'secondary' | 'danger'; action?: string }
  | { type: 'select'; label?: string; options: Array<{ label: string; value: string }>; placeholder?: string }
  | { type: 'kv'; rows: Array<{ key: string; value: string }> }
  | { type: 'progress'; label?: string; value: number; max?: number; color?: string }
  | { type: 'tool_call'; name: string; args?: Record<string, unknown>; result?: string; status?: 'running' | 'done' | 'error' }
  | { type: 'code'; language?: string; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'divider' }
  | { type: 'callout'; text: string; emoji?: string; variant?: 'info' | 'warning' | 'success' | 'error' };

interface Props {
  blocks: Array<Record<string, unknown>>;
  messageId: string;
}

export function BotCard({ blocks, messageId }: Props) {
  return (
    <div className="mt-1 flex flex-col gap-2" data-testid={`bot-card-${messageId}`}>
      {blocks.map((raw, i) => (
        <BlockRenderer key={i} block={raw as Block} />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      return <TextBlock block={block} />;
    case 'heading':
      return <HeadingBlock block={block} />;
    case 'image':
      return <ImageBlock block={block} />;
    case 'button':
      return <ButtonBlock block={block} />;
    case 'select':
      return <SelectBlock block={block} />;
    case 'kv':
      return <KVBlock block={block} />;
    case 'progress':
      return <ProgressBlock block={block} />;
    case 'tool_call':
      return <ToolCallBlock block={block} />;
    case 'code':
      return <CodeBlock block={block} />;
    case 'list':
      return <ListBlock block={block} />;
    case 'table':
      return <TableBlock block={block} />;
    case 'divider':
      return <div className="my-1 h-px bg-divider" />;
    case 'callout':
      return <CalloutBlock block={block} />;
    default:
      return null;
  }
}

function TextBlock({ block }: { block: Extract<Block, { type: 'text' }> }) {
  const cls = cn(
    'text-[13px] leading-relaxed',
    block.style === 'bold' && 'font-semibold',
    block.style === 'muted' && 'text-muted',
    block.style === 'code' && 'rounded bg-[var(--app-surface)] px-1.5 py-0.5 font-mono text-[12px]',
  );
  return <p className={cls}>{block.text}</p>;
}

function HeadingBlock({ block }: { block: Extract<Block, { type: 'heading' }> }) {
  const level = block.level ?? 2;
  const cls = cn(
    'font-display font-semibold leading-snug',
    level === 1 && 'text-[16px]',
    level === 2 && 'text-[14px]',
    level === 3 && 'text-[13px]',
  );
  return <p className={cls}>{block.text}</p>;
}

function ImageBlock({ block }: { block: Extract<Block, { type: 'image' }> }) {
  return (
    <figure className="overflow-hidden rounded-[8px] border border-divider" style={{ maxWidth: 360 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={block.url} alt={block.alt ?? ''} className="w-full object-contain" loading="lazy" />
      {block.caption ? (
        <figcaption className="px-3 py-1.5 text-[11px] text-muted">{block.caption}</figcaption>
      ) : null}
    </figure>
  );
}

function ButtonBlock({ block }: { block: Extract<Block, { type: 'button' }> }) {
  const [clicked, setClicked] = useState(false);
  const variant = block.variant ?? 'primary';

  const cls = cn(
    'inline-flex items-center rounded-[6px] px-3 py-1.5 text-[12px] font-medium transition-colors',
    variant === 'primary' && 'bg-brand-teal text-white hover:bg-brand-teal/90',
    variant === 'secondary' && 'border border-divider bg-[var(--app-surface)] text-foreground hover:border-brand-teal/40',
    variant === 'danger' && 'border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20',
    clicked && 'opacity-60',
  );

  return (
    <button
      type="button"
      className={cls}
      disabled={clicked}
      onClick={() => {
        setClicked(true);
        // Could dispatch a custom event here for the workspace to handle
        window.dispatchEvent(new CustomEvent('bot-button-click', {
          detail: { action: block.action, value: block.value, label: block.label },
        }));
      }}
    >
      {block.label}
    </button>
  );
}

function SelectBlock({ block }: { block: Extract<Block, { type: 'select' }> }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex flex-col gap-1">
      {block.label ? <span className="text-[11px] font-medium text-muted">{block.label}</span> : null}
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          window.dispatchEvent(new CustomEvent('bot-select-change', {
            detail: { value: e.target.value },
          }));
        }}
        className="rounded-[6px] border border-divider bg-[var(--app-surface)] px-2.5 py-1.5 text-[12px] focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal/30"
        style={{ maxWidth: 280 }}
      >
        <option value="">{block.placeholder ?? 'Select…'}</option>
        {block.options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function KVBlock({ block }: { block: Extract<Block, { type: 'kv' }> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[8px] border border-divider bg-[var(--app-hover)]/40 px-3 py-2.5">
      {block.rows.map((row, i) => (
        <>
          <dt key={`k-${i}`} className="text-[12px] text-muted whitespace-nowrap">{row.key}</dt>
          <dd key={`v-${i}`} className="text-[12px] font-medium text-right">{row.value}</dd>
        </>
      ))}
    </dl>
  );
}

function ProgressBlock({ block }: { block: Extract<Block, { type: 'progress' }> }) {
  const max = block.max ?? 100;
  const pct = Math.min(100, Math.max(0, (block.value / max) * 100));
  return (
    <div className="flex flex-col gap-1" style={{ maxWidth: 320 }}>
      <div className="flex items-baseline justify-between">
        {block.label ? <span className="text-[12px] text-muted">{block.label}</span> : null}
        <span className="text-[12px] font-medium tabular-nums">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-surface)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: block.color ?? 'var(--color-brand-teal, #009E85)' }}
        />
      </div>
    </div>
  );
}

function ToolCallBlock({ block }: { block: Extract<Block, { type: 'tool_call' }> }) {
  const [expanded, setExpanded] = useState(false);
  const status = block.status ?? 'done';

  return (
    <div className="rounded-[8px] border border-divider bg-[var(--app-hover)]/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        <span className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]',
          status === 'running' && 'animate-spin border border-brand-teal border-t-transparent',
          status === 'done' && 'bg-green-500/20 text-green-600',
          status === 'error' && 'bg-red-500/20 text-red-500',
        )}>
          {status === 'done' ? '\u2713' : status === 'error' ? '\u2717' : ''}
        </span>
        <span className="flex-1 truncate font-mono text-[12px] font-medium">{block.name}</span>
        <span className="text-[10px] text-muted">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div className="border-t border-divider px-3 py-2 space-y-1.5">
          {block.args ? (
            <pre className="overflow-x-auto rounded bg-[var(--app-surface)] p-2 text-[11px] text-muted">
              {JSON.stringify(block.args, null, 2)}
            </pre>
          ) : null}
          {block.result ? (
            <p className="text-[12px] text-foreground/80">{block.result}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ block }: { block: Extract<Block, { type: 'code' }> }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-[8px] border border-divider bg-[var(--app-surface)]">
      {block.language ? (
        <div className="flex items-center justify-between border-b border-divider px-3 py-1.5">
          <span className="font-mono text-[11px] text-muted">{block.language}</span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(block.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-[11px] text-muted hover:text-foreground"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ) : null}
      <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed">
        <code>{block.text}</code>
      </pre>
    </div>
  );
}

function ListBlock({ block }: { block: Extract<Block, { type: 'list' }> }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <Tag className={cn('pl-4 text-[13px] space-y-0.5', block.ordered ? 'list-decimal' : 'list-disc')}>
      {block.items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  );
}

function TableBlock({ block }: { block: Extract<Block, { type: 'table' }> }) {
  return (
    <div className="overflow-x-auto rounded-[8px] border border-divider">
      <table className="w-full text-[12px]">
        <thead className="border-b border-divider bg-[var(--app-hover)]/60">
          <tr>
            {block.headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-muted whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri} className="border-t border-divider/50 hover:bg-[var(--app-hover)]/30">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalloutBlock({ block }: { block: Extract<Block, { type: 'callout' }> }) {
  const variant = block.variant ?? 'info';
  const cls = cn(
    'flex gap-2.5 rounded-[8px] border px-3 py-2.5 text-[13px]',
    variant === 'info' && 'border-brand-teal/30 bg-brand-teal/5 text-foreground',
    variant === 'warning' && 'border-amber-500/30 bg-amber-500/5',
    variant === 'success' && 'border-green-500/30 bg-green-500/5',
    variant === 'error' && 'border-red-500/30 bg-red-500/5 text-red-500',
  );
  const defaultIcon = { info: '\u24D8', warning: '\u26A0', success: '\u2713', error: '\u2717' }[variant];

  return (
    <div className={cls} role="note">
      <span className="shrink-0 text-[14px]">{defaultIcon}</span>
      <span className="leading-relaxed">{block.text}</span>
    </div>
  );
}
