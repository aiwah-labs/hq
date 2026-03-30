'use client';

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import {
  Bot, Reply, Pencil, Trash2, MessageSquare,
  ChevronDown, Brain, Copy, Check,
  CheckCircle2, XCircle, Loader2, Clock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/cn';
import { useActorCache } from './actor-cache';
import type { MessageData } from './messaging-workspace';
import { BotCard } from './bot-card';
import React from 'react';

// ─── Block Types ──────────────────────────────────────────────────────────────

type AgentBlock =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; toolCallId: string; toolName: string; toolTitle?: string; args: unknown }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: 'text'; text: string }
  // Extensibility slots — rendered as generic data cards until dedicated components are built
  | { type: 'data'; dataType: string; data: unknown };

// ─── Code Block ───────────────────────────────────────────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [code]);

  return (
    <div className="my-2.5 rounded-lg border border-divider overflow-hidden text-[11.5px] leading-relaxed">
      {/* Header: language label + copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--app-bg-elevated)] border-b border-divider">
        <span className="text-[10px] font-mono font-semibold text-[var(--app-muted)] uppercase tracking-widest">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-sans text-[var(--app-muted)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]"
        >
          {copied
            ? <><Check className="h-3 w-3 text-green-500" /><span className="text-green-500">Copied</span></>
            : <><Copy className="h-3 w-3" /><span>Copy</span></>}
        </button>
      </div>
      {/* Code — horizontal scroll, no wrapping */}
      <pre className="m-0 overflow-x-auto bg-[var(--app-bg)] p-3">
        <code className="font-mono text-[11.5px] leading-relaxed text-[var(--app-fg)]/90 whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}

// ─── Markdown Content ─────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="min-w-0 w-full overflow-hidden break-words text-[13px] leading-relaxed text-[var(--app-fg)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          // ── pre: intercept code blocks before they render ──
          pre: (props) => {
            const { children } = props;
            if (React.isValidElement(children)) {
              const childProps = children.props as { className?: string; children?: unknown };
              const lang = /language-(\w+)/.exec(childProps.className ?? '')?.[1] ?? '';
              const raw = typeof childProps.children === 'string'
                ? childProps.children.replace(/\n$/, '')
                : String(childProps.children ?? '');
              return <CodeBlock language={lang} code={raw} />;
            }
            return (
              <pre className="my-2.5 overflow-x-auto rounded-lg border border-divider bg-[var(--app-bg)] p-3 font-mono text-[11.5px] text-[var(--app-fg)]/90">
                {children}
              </pre>
            );
          },
          // ── code: only inline code reaches here (pre was intercepted above) ──
          code: ({ children, className, ...props }) => {
            // If className has language-*, it's a bare code block (no fence) — render as block
            if ((className ?? '').startsWith('language-')) {
              const lang = /language-(\w+)/.exec(className ?? '')?.[1] ?? '';
              return <CodeBlock language={lang} code={String(children).replace(/\n$/, '')} />;
            }
            return (
              <code
                className="rounded border border-divider/60 bg-[var(--app-bg-elevated)] px-1.5 py-0.5 font-mono text-[11.5px] text-[var(--app-fg)]"
                {...props}
              >
                {children}
              </code>
            );
          },
          // ── Tables: horizontal scroll wrapper ──
          table: ({ children, ...props }) => (
            <div className="my-3 w-full overflow-x-auto rounded-lg border border-divider">
              <table className="min-w-full divide-y divide-divider text-[12.5px]" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-[var(--app-bg-elevated)]" {...props}>{children}</thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody className="divide-y divide-divider" {...props}>{children}</tbody>
          ),
          th: ({ children, ...props }) => (
            <th
              className="whitespace-nowrap px-3 py-2 text-left text-[11.5px] font-semibold text-[var(--app-fg)]"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              className="px-3 py-2 align-top text-[var(--app-fg)]/80"
              {...props}
            >
              {children}
            </td>
          ),
          // ── Headings ──
          h1: ({ children }) => (
            <h1 className="mb-2 mt-5 text-[17px] font-bold text-[var(--app-fg)]">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-4 text-[15px] font-semibold text-[var(--app-fg)]">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-3 text-[13.5px] font-semibold text-[var(--app-fg)]">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-0.5 mt-2.5 text-[13px] font-semibold text-[var(--app-muted)]">{children}</h4>
          ),
          // ── Paragraphs ──
          p: ({ children }) => (
            <p className="mb-2.5 leading-relaxed last:mb-0">{children}</p>
          ),
          // ── Lists ──
          ul: ({ children }) => (
            <ul className="mb-2.5 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2.5 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          // ── Links ──
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-teal underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              {children}
            </a>
          ),
          // ── Blockquote ──
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 border-l-[3px] border-brand-teal/30 pl-3.5 italic text-[var(--app-muted)]">
              {children}
            </blockquote>
          ),
          // ── HR ──
          hr: () => <hr className="my-4 border-divider" />,
          // ── Inline emphasis ──
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--app-fg)]">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ─── Streaming Markdown ───────────────────────────────────────────────────────
// During streaming, splits text at completed paragraph boundaries (double-newline)
// and animates each committed paragraph in with a soft slide-up. The live (last)
// paragraph updates in place. Once streaming ends, hands off to MarkdownContent.
//
// How it works: each committed paragraph gets key="c-N" while the live one keeps
// key="live-para". When a paragraph crosses the double-newline boundary it gets a
// new stable key, causing React to mount a fresh element → CSS animation fires.

function StreamingMarkdown({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  if (!isStreaming) {
    return <MarkdownContent content={text} />;
  }

  // Split on double (or more) newlines. All but the last segment are "committed"
  // (won't grow further); the last is still the live paragraph being typed into.
  const parts = text.split(/\n\n+/);

  return (
    <div className="min-w-0 w-full overflow-hidden break-words text-[13px] leading-relaxed text-[var(--app-fg)]">
      {parts.map((para, i) => {
        const isLive = i === parts.length - 1;
        return (
          <div
            key={isLive ? 'live-para' : `c-${i}`}
            className={!isLive ? 'animate-stream-para' : undefined}
          >
            <MarkdownContent content={para} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Thinking Block ───────────────────────────────────────────────────────────

function ThinkingBlock({
  text,
  isStreaming,
  messageIsStreaming,
}: {
  text: string;
  isStreaming: boolean;
  messageIsStreaming: boolean;
}) {
  const mountTimeRef = useRef(Date.now());
  const startedStreamingRef = useRef(isStreaming);
  const [open, setOpen] = useState(true);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [userToggled, setUserToggled] = useState(false);
  // Fade-in on mount
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  // Record duration when this block's streaming ends
  useEffect(() => {
    if (!startedStreamingRef.current) return;
    if (isStreaming) return;
    setDurationMs(Date.now() - mountTimeRef.current);
  }, [isStreaming]);

  // Only auto-collapse after the ENTIRE message is done streaming (not just this block)
  // This prevents the jarring jump when thinking collapses while text is still arriving
  useEffect(() => {
    if (!startedStreamingRef.current) return;
    if (messageIsStreaming) return; // wait until whole message is done
    if (userToggled) return;
    const timer = setTimeout(() => setOpen(false), 1500);
    return () => clearTimeout(timer);
  }, [messageIsStreaming, userToggled]);

  const handleToggle = () => {
    setUserToggled(true);
    setOpen((o) => !o);
  };

  const label = isStreaming
    ? 'Thinking…'
    : durationMs !== null
      ? `Thought for ${Math.max(1, Math.round(durationMs / 1000))}s`
      : 'Reasoning';

  return (
    <div
      className="mb-2 overflow-hidden rounded-md border border-purple-500/15 bg-purple-500/[0.03]"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(4px)',
        transition: 'opacity 200ms ease, transform 200ms ease',
      }}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-purple-500/[0.04]"
      >
        {isStreaming ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1 w-1 animate-bounce rounded-full bg-purple-400/70"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        ) : (
          <Brain className="h-3 w-3 shrink-0 text-purple-400/70" />
        )}
        <span className="flex-1 text-[11px] text-purple-400/80">{label}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-purple-400/40 transition-transform duration-150',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>
      {open ? (
        <div className="max-h-[240px] overflow-y-auto border-t border-purple-500/10 px-3 py-2">
          <p className="text-[11.5px] leading-relaxed text-[var(--app-muted)] whitespace-pre-wrap italic">
            {text}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Tool Call Block ──────────────────────────────────────────────────────────
// Minimal Cursor-style rows. Result preview shown inline in collapsed header.
// Expanded sections capped at max-height to prevent infinite growth.

/** Generate a compact one-liner summary of tool result for collapsed header */
function resultPreview(result: unknown, isError?: boolean): string | null {
  if (result === undefined || result === null) return null;
  if (isError) return typeof result === 'string' ? result.slice(0, 60) : 'Error';
  if (typeof result === 'boolean') return result ? 'true' : 'false';
  if (typeof result === 'number') return String(result);
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (!trimmed) return null;
    return trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed;
  }
  if (Array.isArray(result)) return `${result.length} item${result.length !== 1 ? 's' : ''}`;
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>;
    // Common patterns: { count, data }, { results }, { total }, { items }
    if (typeof r.count === 'number') return `${r.count} result${r.count !== 1 ? 's' : ''}`;
    if (typeof r.total === 'number') return `${r.total} total`;
    if (Array.isArray(r.results)) return `${r.results.length} result${r.results.length !== 1 ? 's' : ''}`;
    if (Array.isArray(r.items)) return `${r.items.length} item${r.items.length !== 1 ? 's' : ''}`;
    if (Array.isArray(r.data)) return `${r.data.length} item${r.data.length !== 1 ? 's' : ''}`;
    if (typeof r.success === 'boolean') return r.success ? 'Success' : 'Failed';
    if (typeof r.status === 'string') return r.status;
    if (typeof r.message === 'string') return r.message.slice(0, 60);
    // Fallback: count keys
    const keys = Object.keys(r);
    return keys.length > 0 ? `${keys.length} field${keys.length !== 1 ? 's' : ''}` : 'done';
  }
  return String(result).slice(0, 60);
}

function ToolCallBlock({
  toolName,
  toolTitle,
  args,
  result,
  isError,
  isPending,
  inGroup = false,
}: {
  toolName: string;
  toolTitle?: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  isPending?: boolean;
  inGroup?: boolean;
}) {
  const startRef = useRef(Date.now());
  const [open, setOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  // Fade-in on mount
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  // Live timer while running; freeze on completion
  useEffect(() => {
    if (!isPending) {
      setElapsedMs(Date.now() - startRef.current);
      return;
    }
    const interval = setInterval(() => setElapsedMs(Date.now() - startRef.current), 100);
    return () => clearInterval(interval);
  }, [isPending]);

  const handleToggle = () => setOpen((o) => !o);

  // Derive label: toolTitle > prettified toolName
  const label = toolTitle ?? toolName.replace(/_/g, ' ');

  const fmt = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  const toStr = (data: unknown) =>
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const preview = !isPending ? resultPreview(result, isError) : null;

  return (
    <div
      className={cn('overflow-hidden', !inGroup && 'mb-1 rounded-md border border-divider/70')}
      data-testid={`tool-call-${toolName}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(3px)',
        transition: 'opacity 150ms ease, transform 150ms ease',
      }}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={`${label} — ${isPending ? 'running' : isError ? 'failed' : 'completed'}. Click to ${open ? 'collapse' : 'expand'}.`}
        className="flex w-full items-center gap-2 px-2.5 py-1 text-left transition-colors hover:bg-[var(--app-bg-elevated)]/50"
      >
        {/* Status icon */}
        {isPending ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-brand-teal/80" />
        ) : isError ? (
          <XCircle className="h-3 w-3 shrink-0 text-red-400/80" />
        ) : (
          <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500/70" />
        )}

        {/* Primary label (human-readable) */}
        <span className={cn(
          'shrink-0 text-[11.5px]',
          isError ? 'text-red-400/90' : 'text-[var(--app-fg)]/75',
        )}>
          {label}
        </span>

        {/* Result preview — shown when collapsed and result is available */}
        {preview && !open ? (
          <span className={cn(
            'min-w-0 flex-1 truncate text-[11px]',
            isError ? 'text-red-400/70' : 'text-[var(--app-muted)]/80',
          )}>
            → {preview}
          </span>
        ) : (
          <span className="flex-1" />
        )}

        {/* Elapsed time */}
        <span className="shrink-0 font-sans text-[10px] tabular-nums text-[var(--app-muted)]/60">
          {isPending
            ? <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{fmt(elapsedMs)}</span>
            : fmt(elapsedMs)
          }
        </span>

        <ChevronDown className={cn(
          'ml-1 h-3 w-3 shrink-0 text-[var(--app-muted)]/40 transition-transform duration-150',
          open ? 'rotate-0' : '-rotate-90',
        )} />
      </button>

      {/* Expanded: plain JSON, capped height */}
      {open ? (
        <div className="border-t border-divider/50 bg-[var(--app-bg)]/40">
          {/* Tool name (secondary, only shown when title differs) */}
          {toolTitle && toolTitle !== toolName ? (
            <div className="px-3 pt-1.5 pb-0">
              <span className="font-mono text-[9.5px] text-[var(--app-muted)]/50">{toolName}</span>
            </div>
          ) : null}
          {/* Input */}
          <div className="px-3 pt-2 pb-2">
            <p className="mb-1 font-sans text-[9px] font-semibold uppercase tracking-widest text-[var(--app-muted)]/60">
              Input
            </p>
            <div className="max-h-[160px] overflow-y-auto overflow-x-auto">
              <pre className="font-mono text-[10.5px] leading-relaxed text-[var(--app-fg)]/65 whitespace-pre">
                {toStr(args)}
              </pre>
            </div>
          </div>
          {/* Output */}
          {result !== undefined ? (
            <div className="border-t border-divider/40 px-3 pt-2 pb-2">
              <p className={cn(
                'mb-1 font-sans text-[9px] font-semibold uppercase tracking-widest',
                isError ? 'text-red-400/70' : 'text-[var(--app-muted)]/60',
              )}>
                {isError ? 'Error' : 'Output'}
              </p>
              <div className="max-h-[160px] overflow-y-auto overflow-x-auto">
                <pre className={cn(
                  'font-mono text-[10.5px] leading-relaxed whitespace-pre',
                  isError ? 'text-red-400/80' : 'text-[var(--app-fg)]/65',
                )}>
                  {toStr(result)}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Steps Group (consecutive tool calls) ────────────────────────────────────
// Minimal: one shared border container, no heavy header — just a subtle divider
// between tools to show they belong together.

type ToolGroup = {
  index: number;
  toolName: string;
  toolTitle?: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  isPending: boolean;
};

function StepsGroup({ tools }: { tools: ToolGroup[] }) {
  return (
    <div className="mb-1 overflow-hidden rounded-md border border-divider/70 divide-y divide-divider/50">
      {tools.map((t) => (
        <ToolCallBlock
          key={t.index}
          toolName={t.toolName}
          toolTitle={t.toolTitle}
          args={t.args}
          result={t.result}
          isError={t.isError}
          isPending={t.isPending}
          inGroup
        />
      ))}
    </div>
  );
}

// ─── Agent Blocks Renderer ────────────────────────────────────────────────────

function AgentBlocks({ blocks, isStreaming }: { blocks: AgentBlock[]; isStreaming: boolean }) {
  // Pre-process: pair tool_call + tool_result, label pending status
  type Grouped =
    | { kind: 'thinking'; text: string; index: number; isStreaming: boolean }
    | { kind: 'tool'; index: number; toolName: string; toolTitle?: string; args: unknown; result?: unknown; isError?: boolean; isPending: boolean }
    | { kind: 'text'; text: string; index: number; isStreaming: boolean };

  const grouped: Grouped[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i]!;

    if (block.type === 'thinking') {
      grouped.push({
        kind: 'thinking',
        text: block.text,
        index: i,
        isStreaming: isStreaming && i === blocks.length - 1,
      });
      i++;
    } else if (block.type === 'tool_call') {
      const next = blocks[i + 1];
      const result = next?.type === 'tool_result' && next.toolCallId === block.toolCallId ? next : undefined;
      grouped.push({
        kind: 'tool',
        index: i,
        toolName: block.toolName,
        toolTitle: block.toolTitle,
        args: block.args,
        result: result?.result,
        isError: result?.isError,
        isPending: !result && isStreaming,
      });
      i += result ? 2 : 1;
    } else if (block.type === 'tool_result') {
      i++; // orphan — already consumed above
    } else if (block.type === 'text') {
      grouped.push({
        kind: 'text',
        text: block.text,
        index: i,
        isStreaming: isStreaming && i === blocks.length - 1,
      });
      i++;
    } else {
      i++;
    }
  }

  // Render, grouping consecutive tool blocks into StepsGroup
  const elements: React.ReactNode[] = [];
  let gi = 0;

  while (gi < grouped.length) {
    const item = grouped[gi]!;

    if (item.kind === 'thinking') {
      elements.push(
        <ThinkingBlock
          key={item.index}
          text={item.text}
          isStreaming={item.isStreaming}
          messageIsStreaming={isStreaming}
        />,
      );
      gi++;
    } else if (item.kind === 'text') {
      elements.push(
        <StreamingMarkdown key={item.index} text={item.text} isStreaming={item.isStreaming} />,
      );
      gi++;
    } else if (item.kind === 'tool') {
      // Collect consecutive tool blocks
      const run: ToolGroup[] = [];
      while (gi < grouped.length && grouped[gi]!.kind === 'tool') {
        const t = grouped[gi]! as Extract<Grouped, { kind: 'tool' }>;
        run.push(t);
        gi++;
      }

      if (run.length === 1) {
        const t = run[0]!;
        elements.push(
          <ToolCallBlock
            key={t.index}
            toolName={t.toolName}
            toolTitle={t.toolTitle}
            args={t.args}
            result={t.result}
            isError={t.isError}
            isPending={t.isPending}
          />,
        );
      } else {
        elements.push(<StepsGroup key={run[0]!.index} tools={run} />);
      }
    } else {
      gi++;
    }
  }

  // Show pulsing dots when streaming but waiting between blocks
  // (e.g. thinking ended, tool calls returned, waiting for text to start)
  const lastGrouped = grouped[grouped.length - 1];
  const waitingBetweenBlocks =
    isStreaming &&
    grouped.length > 0 &&
    lastGrouped?.kind === 'tool' &&
    !(lastGrouped as Extract<Grouped, { kind: 'tool' }>).isPending;

  return (
    <div className="space-y-1">
      {elements}
      {waitingBetweenBlocks ? (
        <div className="flex items-center gap-1 px-0.5 py-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[var(--app-muted)]/40 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ['👍', '❤️', '✅', '👀', '🔥'];

const LEGACY_EMOJI: Record<string, string> = {
  '+1': '👍', heart: '❤️', check: '✅', eyes: '👀', fire: '🔥',
};

function toDisplayEmoji(emoji: string): string {
  return LEGACY_EMOJI[emoji] ?? emoji;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Message Item ─────────────────────────────────────────────────────────────

interface Props {
  message: MessageData;
  isGrouped: boolean;
  onReact: (messageId: string, emoji: string, alreadyReacted: boolean) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onViewThread?: (message: MessageData) => void;
}

export const MessageItem = memo(function MessageItem({
  message, isGrouped, onReact, onEdit, onDelete, onViewThread,
}: Props) {
  const [showActions, setShowActions] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const { getActorName, selfId } = useActorCache();

  const scheduleHide = useCallback(() => {
    hideTimeout.current = setTimeout(() => {
      setShowActions(false);
      setShowReactionPicker(false);
    }, 300);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
  }, []);

  if (message.isDeleted) {
    return (
      <div
        id={`msg-${message.id}`}
        className="flex items-start gap-3 rounded-[6px] px-2 py-1"
        data-testid={`message-item-${message.id}`}
      >
        {!isGrouped
          ? <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--app-bg-elevated)] ring-1 ring-divider" />
          : <div className="h-5 w-8 shrink-0" />}
        <p className="text-[13px] italic text-[var(--app-muted)]">This message was deleted.</p>
      </div>
    );
  }

  if (message.contentType === 'SYSTEM') {
    return (
      <div className="flex items-center gap-3 py-2" data-testid={`message-item-${message.id}`}>
        <div className="h-px flex-1 bg-divider" />
        <span className="text-[11px] text-[var(--app-muted)]">{message.content}</span>
        <div className="h-px flex-1 bg-divider" />
      </div>
    );
  }

  const isBot = message.senderType === 'BOT';
  const isAgent = message.senderType === 'AGENT';
  const hasBlocks = Array.isArray(message.blocks) && message.blocks.length > 0;
  const isStreaming = message.streamingStatus === 'streaming';
  const rawName = getActorName(message.senderType, message.senderId);
  const isSelf = message.senderType === 'USER' && message.senderId === selfId;
  const senderName = isSelf ? 'You' : rawName;

  const agentBlocks =
    (isAgent || isBot) && Array.isArray(message.blocks) ? (message.blocks as AgentBlock[]) : null;

  const handleEditSubmit = () => {
    if (editContent.trim() !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        // Animate only messages from OTHER users (received via SSE, no optimistic swap).
        // Own messages are added optimistically first — the optimistic→real key change
        // would trigger the animation twice, causing a visible flicker.
        // Agent/bot messages are not animated (pending placeholder already covers the visual).
        message.senderType === 'USER' && !isSelf && 'animate-msg-enter',
        'group relative flex items-start gap-3 rounded-[6px] px-2 py-1',
        showActions ? 'bg-[var(--app-bg-elevated)]' : 'hover:bg-[var(--app-bg-elevated)]/60',
      )}
      onMouseEnter={() => { cancelHide(); setShowActions(true); }}
      onMouseLeave={scheduleHide}
      data-testid={`message-item-${message.id}`}
    >
      {/* Avatar */}
      {!isGrouped ? (
        <div aria-hidden="true" className="mt-0.5 shrink-0">
          {isBot || isAgent ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-teal/10 ring-1 ring-brand-teal/20">
              <Bot className="h-3.5 w-3.5 text-brand-teal" />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-teal/10 text-[12px] font-semibold text-brand-teal ring-1 ring-brand-teal/20">
              {senderName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-1 w-8 shrink-0">
          {showActions ? (
            <span className="block text-center text-[10px] text-[var(--app-muted)]">
              {formatTime(message.createdAt)}
            </span>
          ) : null}
        </div>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1 overflow-hidden">
        {!isGrouped ? (
          <div className="mb-0.5 flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">{senderName}</span>
            <span className="text-[11px] text-[var(--app-muted)]" title={formatDate(message.createdAt)}>
              {formatTime(message.createdAt)}
            </span>
          </div>
        ) : null}

        {/* Message body */}
        {isEditing ? (
          <div className="mt-1">
            <textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
                if (e.key === 'Escape') setIsEditing(false);
              }}
              className="w-full resize-none rounded-[6px] border border-brand-teal bg-[var(--app-bg-elevated)] px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-brand-teal/50"
              rows={Math.min(8, editContent.split('\n').length + 1)}
              autoFocus
            />
            <div className="mt-1 flex gap-2 text-[11px] text-[var(--app-muted)]">
              <span>Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : hasBlocks && message.contentType === 'CARD' ? (
          <BotCard blocks={message.blocks as Array<Record<string, unknown>>} messageId={message.id} />
        ) : agentBlocks ? (
          agentBlocks.length === 0 && isStreaming ? (
            <div className="flex items-center gap-1 py-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-[var(--app-muted)]/50 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          ) : (
            <AgentBlocks blocks={agentBlocks} isStreaming={isStreaming} />
          )
        ) : (
          <div>
            <MarkdownContent content={message.content} />
            {message.isEdited ? (
              <span className="text-[10px] italic text-[var(--app-muted)]">edited</span>
            ) : null}
          </div>
        )}

        {/* Attachments */}
        {message.attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} />
            ))}
          </div>
        ) : null}

        {/* Reactions */}
        {message.reactions.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(message.id, r.emoji, r.selfReacted)}
                aria-label={`${toDisplayEmoji(r.emoji)} ${r.count} reactions`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] transition-colors',
                  r.selfReacted
                    ? 'border-brand-teal/40 bg-brand-teal/10'
                    : 'border-divider bg-[var(--app-bg-elevated)] hover:border-brand-teal/30 hover:bg-brand-teal/5',
                )}
              >
                <span className="text-[13px] leading-none">{toDisplayEmoji(r.emoji)}</span>
                <span className="text-[11px] font-medium text-[var(--app-fg)]/70">{r.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {/* Reply thread count */}
        {message.replyCount > 0 ? (
          <button
            type="button"
            onClick={() => onViewThread?.(message)}
            data-testid={`view-thread-${message.id}`}
            className="mt-1.5 flex items-center gap-1.5 rounded-[6px] border border-brand-teal/20 bg-brand-teal/5 px-2.5 py-1 text-[12px] font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
          >
            <MessageSquare className="h-3 w-3" />
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        ) : null}
      </div>

      {/* Hover action bar */}
      {showActions && !isEditing && !isStreaming ? (
        <div
          className="absolute -top-3 right-2 flex items-center gap-0.5 rounded-[8px] border border-divider bg-[var(--app-bg-elevated)] px-1 py-0.5 shadow-sm"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          {QUICK_REACTIONS.map((emoji) => {
            const selfReacted =
              message.reactions.find((r) => toDisplayEmoji(r.emoji) === emoji)?.selfReacted ?? false;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(message.id, emoji, selfReacted)}
                aria-label={`React ${emoji}`}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-[4px] text-[15px] leading-none transition-colors hover:bg-[var(--app-bg)]',
                  selfReacted ? 'opacity-100' : 'opacity-60 hover:opacity-100',
                )}
              >
                {emoji}
              </button>
            );
          })}
          <div className="mx-0.5 h-4 w-px bg-divider" />
          {onViewThread && message.replyCount === 0 ? (
            <button
              type="button"
              onClick={() => onViewThread(message)}
              aria-label="Reply in thread"
              className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { setIsEditing(true); setEditContent(message.content); }}
            aria-label="Edit message"
            className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(message.id)}
            aria-label="Delete message"
            className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--app-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
});

// ─── Attachment Preview ───────────────────────────────────────────────────────

function AttachmentPreview({ attachment }: { attachment: MessageData['attachments'][0] }) {
  const isImage = attachment.type === 'image' || attachment.mimeType?.startsWith('image/');

  if (isImage && attachment.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-[8px] border border-divider transition-opacity hover:opacity-90"
        style={{ maxWidth: 320 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.originalName}
          className="max-h-[300px] w-full object-contain"
          loading="lazy"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url ?? '#'}
      download={attachment.originalName}
      className="flex items-center gap-2 rounded-[8px] border border-divider bg-[var(--app-bg-elevated)] px-3 py-2 text-[12px] transition-colors hover:bg-[var(--app-bg)]/80"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[var(--app-muted)]">
        <path d="M4 2h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <div>
        <p className="font-medium">{attachment.originalName}</p>
        <p className="text-[var(--app-muted)]">{(attachment.size / 1024).toFixed(1)} KB</p>
      </div>
    </a>
  );
}
