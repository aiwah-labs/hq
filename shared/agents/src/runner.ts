import { streamText, stepCountIs } from 'ai';
import { db } from '@hq/db';
import { getAgent } from './registry.js';
import { buildModel } from './model.js';
import { buildToolMap, buildToolTitleMap, buildAgentServiceContext } from './tools.js';
import { computeRunCost } from './pricing.js';
import type { TriggerPayload } from './types.js';

// ─── Block Types ──────────────────────────────────────────────────────────────
// Interleaved agent content: thinking → tool calls → text, in order of occurrence

export type AgentBlock =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; toolCallId: string; toolName: string; toolTitle?: string; args: unknown }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: 'text'; text: string }
  // Extensibility: future block types for generative UI, sub-agents, tasks
  // | { type: 'data'; dataType: string; data: unknown }
  // | { type: 'agent_call'; agentKey: string; label: string; threadId: string }
  ;

// ─── Streaming Part (emitted to caller in real time) ─────────────────────────

export type StreamPart =
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; toolTitle?: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown; isError: boolean };

// ─── Logger ───────────────────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, agentKey: string, event: string, data?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    agent: agentKey,
    event,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(`[agent] ${line}`);
  } else {
    console.log(`[agent] ${line}`);
  }
}

// ─── Execute ─────────────────────────────────────────────────────────────────

export async function executeAgentTurn(
  agentKey: string,
  trigger: TriggerPayload,
  onChunk?: (part: StreamPart) => Promise<void>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _workspaceConfig: unknown = {}
): Promise<{ text: string | null; threadId: string; blocks: AgentBlock[] }> {
  const turnStart = Date.now();

  const def = getAgent(agentKey);
  if (!def) throw new Error(`Unknown agent: "${agentKey}"`);

  log('info', agentKey, 'turn.start', {
    model: def.model,
    trigger: trigger.type,
    mode: trigger.mode,
    threadId: trigger.threadId,
    textLength: trigger.text?.length ?? 0,
  });

  // 1. Resolve or create the agent thread.
  //    Thread replies get their own isolated AgentThread so that parallel
  //    conversations in different Slack-style threads don't bleed into each other.
  const channelRef = trigger.threadId
    ? trigger.parentMessageId
      ? `${trigger.channel ?? 'messaging'}:${trigger.threadId}:thread:${trigger.parentMessageId}`
      : `${trigger.channel ?? 'messaging'}:${trigger.threadId}`
    : null;

  let thread = channelRef
    ? await db.agentThread.findFirst({ where: { agentKey, channelRef, status: 'active' } })
    : null;

  const isNewThread = !thread;

  if (!thread) {
    thread = await db.agentThread.create({
      data: { agentKey, channelRef, messages: [], metadata: {} },
    });
    log('debug', agentKey, 'thread.created', { threadId: thread.id, channelRef });
  } else {
    log('debug', agentKey, 'thread.found', {
      threadId: thread.id,
      messageCount: Array.isArray(thread.messages) ? (thread.messages as unknown[]).length : 0,
    });
  }

  // 2. Build message history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: any[] = thread.messages as any[];

  // On the first trigger in a message thread (reply chain), inject the existing
  // thread messages as context so the agent isn't flying blind.
  if (isNewThread && trigger.parentMessageId && trigger.threadId) {
    const threadHistory = await db.msgMessage.findMany({
      where: {
        OR: [
          { id: trigger.parentMessageId },
          { parentMessageId: trigger.parentMessageId },
        ],
        isDeleted: false,
        // Exclude the triggering message itself — it will be appended below as trigger.text
        ...(trigger.messageId ? { NOT: { id: trigger.messageId } } : {}),
      },
      orderBy: { sequenceNumber: 'asc' },
      take: 30,
      select: { id: true, senderType: true, senderId: true, content: true, createdAt: true },
    });

    if (threadHistory.length > 0) {
      const historyLines = threadHistory
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((m) => m.content.trim() && (m.senderType as any) !== 'SYSTEM')
        .map((m) => `[${m.senderType}:${m.senderId} ${m.createdAt.toISOString().slice(0, 16)}] ${m.content}`)
        .join('\n');

      messages.push({
        role: 'system',
        content: `Thread context (messages before you were tagged):\n${historyLines}`,
      });

      log('debug', agentKey, 'thread.history.injected', { count: threadHistory.length });
    }
  }

  if (trigger.text) {
    messages.push({ role: 'user', content: trigger.text });
  }
  log('debug', agentKey, 'messages.built', { count: messages.length });

  // 3. Build tools
  const ctx = buildAgentServiceContext(def.key, def.capabilities, channelRef);
  const tools = buildToolMap(def.capabilities, ctx);
  const toolTitles = buildToolTitleMap(def.capabilities);
  const toolNames = Object.keys(tools);
  log('debug', agentKey, 'tools.built', { tools: toolNames });

  // 4. Compaction config
  const threadSummary = thread.summary;
  const compaction = def.compaction;

  // 5. Stream — use streamText for full access to interleaved events
  //
  // reasoningEffort: only pass for models that support the explicit parameter (e.g. grok-3-mini).
  // Models with '-reasoning' already in the name (e.g. grok-4-1-fast-reasoning) have reasoning
  // baked in and reject the parameter with HTTP 400.
  const supportsReasoningEffortParam =
    (def.model.includes('-mini') || def.model === 'grok-3') &&
    !def.model.includes('-reasoning');
  const streamStart = Date.now();

  log('info', agentKey, 'stream.start', { supportsReasoningEffortParam, maxSteps: def.maxSteps ?? 20 });

  const result = streamText({
    model: buildModel(def.model),
    system: def.instructions,
    messages,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: stepCountIs(def.maxSteps ?? 20),
    maxOutputTokens: def.maxOutputTokens ?? 100_000,
    ...(supportsReasoningEffortParam ? { providerOptions: { xai: { reasoningEffort: 'high' } } } : {}),

    onError: (event) => {
      const err = event.error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asAny = err as any;
      log('error', agentKey, 'stream.error', {
        error: err instanceof Error
          ? {
              message: err.message,
              name: err.name,
              stack: err.stack?.split('\n').slice(0, 5).join(' | '),
              // APICallError extras — the response body has the actual provider error message
              statusCode: asAny?.statusCode,
              responseBody: asAny?.responseBody,
              url: asAny?.url,
            }
          : String(err),
      });
    },

    onStepFinish: (step) => {
      log('info', agentKey, 'step.finish', {
        stepNumber: step.stepNumber,
        finishReason: step.finishReason,
        toolCalls: step.toolCalls?.length ?? 0,
        inputTokens: step.usage?.inputTokens,
        outputTokens: step.usage?.outputTokens,
      });
    },

    // Compaction: inject summary when thread exceeds threshold
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prepareStep: async (stepCtx: any) => {
      if (!compaction || stepCtx.messages.length <= compaction.maxMessages) return {};
      log('info', agentKey, 'compaction.triggered', {
        messageCount: stepCtx.messages.length,
        maxMessages: compaction.maxMessages,
      });
      const stepMsgs = stepCtx.messages;
      const system = stepMsgs[0];
      const recent = stepMsgs.slice(-compaction.keepRecent);
      if (threadSummary) {
        return {
          messages: [
            system,
            { role: 'system', content: `Previous conversation summary:\n${threadSummary}` },
            ...recent,
          ],
        };
      }
      return { messages: [system, ...recent] };
    },
  });

  // 6. Iterate fullStream — build blocks + call onChunk for real-time delivery
  // NOTE: consuming fullStream drives the stream pipeline; result.text resolves after
  const blocks: AgentBlock[] = [];
  let currentReasoning = '';
  let currentText = '';
  let streamEventCount = 0;
  let reasoningChars = 0;
  let textChars = 0;
  let toolCallCount = 0;

  const flushReasoning = () => {
    if (currentReasoning.trim()) {
      blocks.push({ type: 'thinking', text: currentReasoning });
      currentReasoning = '';
    }
  };
  const flushText = () => {
    if (currentText.trim()) {
      blocks.push({ type: 'text', text: currentText });
      currentText = '';
    }
  };

  try {
    for await (const part of result.fullStream) {
      streamEventCount++;

      if (part.type === 'text-delta') {
        // AI SDK v6: text-delta has `text` field
        currentText += part.text;
        textChars += part.text.length;
        await onChunk?.({ type: 'text-delta', delta: part.text });
      } else if (part.type === 'reasoning-delta') {
        // AI SDK v6: reasoning-delta has `text` field
        currentReasoning += part.text;
        reasoningChars += part.text.length;
        await onChunk?.({ type: 'reasoning-delta', delta: part.text });
      } else if (part.type === 'tool-call') {
        // Flush any accumulated content before this tool call
        // AI SDK v6: tool-call has `input` field (not `args`)
        flushReasoning();
        flushText();
        toolCallCount++;
        const toolTitle = toolTitles.get(part.toolName);
        log('debug', agentKey, 'tool.call', { tool: part.toolName, toolCallId: part.toolCallId, toolTitle });
        blocks.push({ type: 'tool_call', toolCallId: part.toolCallId, toolName: part.toolName, toolTitle, args: part.input });
        await onChunk?.({ type: 'tool-call', toolCallId: part.toolCallId, toolName: part.toolName, toolTitle, args: part.input });
      } else if (part.type === 'tool-result') {
        // AI SDK v6: tool-result has `output` field (not `result`), no `isError`
        const outputStr = JSON.stringify(part.output);
        log('debug', agentKey, 'tool.result', { tool: part.toolName, toolCallId: part.toolCallId, outputLen: outputStr.length });
        blocks.push({ type: 'tool_result', toolCallId: part.toolCallId, toolName: part.toolName, result: part.output, isError: false });
        await onChunk?.({ type: 'tool-result', toolCallId: part.toolCallId, toolName: part.toolName, result: part.output, isError: false });
      } else if (part.type === 'tool-error') {
        // AI SDK v6: tool errors are a separate event type
        log('warn', agentKey, 'tool.error', {
          tool: part.toolName,
          toolCallId: part.toolCallId,
          error: part.error instanceof Error ? part.error.message : String(part.error),
        });
        blocks.push({ type: 'tool_result', toolCallId: part.toolCallId, toolName: part.toolName, result: part.error, isError: true });
        await onChunk?.({ type: 'tool-result', toolCallId: part.toolCallId, toolName: part.toolName, result: part.error, isError: true });
      } else if (part.type === 'error') {
        // Stream-level error from the model provider
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const asAny = part.error as any;
        const errDetails = part.error instanceof Error
          ? {
              message: part.error.message,
              name: part.error.name,
              statusCode: asAny?.statusCode,
              responseBody: asAny?.responseBody,
              url: asAny?.url,
            }
          : { message: String(part.error) };
        log('error', agentKey, 'stream.part.error', { streamEventCount, ...errDetails });
        throw part.error instanceof Error ? part.error : new Error(String(part.error));
      }
    }
  } catch (streamErr) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asAny = streamErr as any;
    log('error', agentKey, 'stream.exception', {
      streamEventCount,
      error: streamErr instanceof Error
        ? {
            message: streamErr.message,
            name: streamErr.name,
            stack: streamErr.stack?.split('\n').slice(0, 5).join(' | '),
            statusCode: asAny?.statusCode,
            responseBody: asAny?.responseBody,
            url: asAny?.url,
          }
        : String(streamErr),
    });
    throw streamErr;
  }

  // Flush remaining accumulated content
  flushReasoning();
  flushText();

  const streamMs = Date.now() - streamStart;
  log('info', agentKey, 'stream.done', {
    streamMs,
    streamEventCount,
    textChars,
    reasoningChars,
    toolCallCount,
    blocks: blocks.length,
  });

  // 7. Resolve promises after stream completes
  const text = (await result.text)?.trim() || null;
  const responseMessages = (await result.response).messages;
  const totalUsage = await result.totalUsage;

  // 8. Push response messages back into conversation history
  messages = [...messages, ...responseMessages];

  // 9. Update metadata and compute cost
  const meta = (thread.metadata ?? {}) as Record<string, unknown>;
  const inputTokens = (totalUsage.inputTokens as number) ?? 0;
  const outputTokens = (totalUsage.outputTokens as number) ?? 0;
  const costUsd = computeRunCost(def.model, inputTokens, outputTokens);

  log('info', agentKey, 'turn.complete', {
    turnMs: Date.now() - turnStart,
    inputTokens,
    outputTokens,
    costUsd,
    textLength: text?.length ?? 0,
    blocks: blocks.length,
  });

  // 10. Persist thread
  await db.agentThread.update({
    where: { id: thread.id },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      metadata: {
        ...meta,
        totalInputTokens: ((meta.totalInputTokens as number) ?? 0) + inputTokens,
        totalOutputTokens: ((meta.totalOutputTokens as number) ?? 0) + outputTokens,
        totalCostUsd: ((meta.totalCostUsd as number) ?? 0) + costUsd,
        turnCount: ((meta.turnCount as number) ?? 0) + 1,
        lastTurnAt: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    },
  });

  // 11. Schedule compaction if needed (fire-and-forget)
  if (compaction && messages.length > compaction.maxMessages) {
    const threadId = thread.id;
    import('./compaction.js')
      .then(({ compactThread }) => compactThread(threadId))
      .catch((err) => log('error', agentKey, 'compaction.failed', { error: String(err) }));
  }

  // 12. Determine if we should reply
  const behavior = def.channelBehavior;
  const isDm = trigger.mode === 'dm';
  const alwaysRespond = isDm
    ? (behavior?.dm?.alwaysRespond ?? true)
    : (behavior?.group?.alwaysRespond ?? true);

  if (!alwaysRespond && !text) {
    log('debug', agentKey, 'turn.silent', { reason: 'alwaysRespond=false and no text' });
    return { text: null, threadId: thread.id, blocks };
  }

  return { text, threadId: thread.id, blocks };
}
