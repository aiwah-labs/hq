import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ApiError, inferCodeFromStatus, inferStatusFromError } from './lib/errors';
import { registerV1Routes } from './routes/v1';
import { startSSEListener, stopSSEListener } from './lib/sse';
import { registerAllWorkers } from './workers/index';
import { getBoss, stopBoss, registerWorker, scheduleJob } from '@hq/jobs';
import { actionRegistry } from '@hq/actions';
import '@hq/actions/custom/crm';
import '@hq/actions/custom/messaging';
// Import agents package so skills + agent definitions auto-register at boot
import '@hq/agents';
import { executeAgentTurn, skillRegistry, syncAgentCrons } from '@hq/agents';
import { onPlatformEvent } from '@hq/agents/triggers';
// Import integrations so Exa/Grok actions register into ActionRegistry
import '@hq/integrations';
import { getIntegrations } from '@hq/integrations';
// Import workflows package so workflow definitions auto-register at boot
import '@hq/workflows';
import { executeWorkflow, getWorkflows } from '@hq/workflows';
import { subscribe, getSubscriptionCount } from '@hq/events';
import { createServiceContext } from '@hq/services';

function parseCorsOrigins(): string[] {
  const raw = process.env.API_CORS_ORIGINS?.trim();
  if (!raw) {
    return ['http://localhost:3002'];
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function buildApiServer() {
  const app = Fastify({
    logger: true,
  });

  const rateLimitRpm = Number(process.env.API_RATE_LIMIT_RPM ?? 600);
  await app.register(cors, {
    origin: parseCorsOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: Number.isFinite(rateLimitRpm) ? rateLimitRpm : 600,
    timeWindow: '1 minute',
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = inferStatusFromError(error);
    const code = error instanceof ApiError ? error.code : inferCodeFromStatus(statusCode);

    request.log.error({ err: error, requestId: request.id }, 'request failed');
    return reply.code(statusCode).send({
      error: {
        code,
        message: error instanceof Error ? error.message : 'Unexpected error.',
        requestId: request.id,
        details: error instanceof ApiError ? error.details : undefined,
      },
    });
  });

  app.get('/v1/health', async () => {
    return {
      ok: true,
      service: 'aiwah-api',
      time: new Date().toISOString(),
    };
  });

  actionRegistry.registerObjectCrud();
  app.log.info(`Actions: ${actionRegistry.list().length} registered (${getIntegrations().length} integrations)`);

  await registerV1Routes(app);

  // Start pg-boss job queue and SSE listener
  app.addHook('onReady', async () => {
    await getBoss();
    await registerAllWorkers();
    await startSSEListener();

    // pg-boss worker: handle agent triggers queued by prod API (fallback when @hq/agents unavailable)
    await registerWorker('messaging.agent-trigger', async (job) => {
      const { messageId, threadId, channelType, senderId, senderType, content, parentMessageId } = job.data;
      const { onChannelMessage } = await import('@hq/agents/triggers');
      const { db: triggerDb } = await import('@hq/db');
      const thread = await triggerDb.msgThread.findUnique({ where: { id: threadId } });
      await onChannelMessage({ id: messageId, threadId, channelId: threadId, channelType, senderId, senderType, content, isDm: thread?.type === 'DM', parentMessageId });
    }, { batchSize: 5 });

    // pg-boss worker: execute agent turns with live streaming back to SSE clients
    await registerWorker('agent.run', async (job) => {
      const { agentKey, trigger } = job.data;
      const { notifyMessaging } = await import('./lib/notify.js');
      const { getAgent } = await import('@hq/agents');
      const { db: workerDb } = await import('@hq/db');
      const { sendMessage, createServiceContext } = await import('@hq/services');

      const agentDef = getAgent(agentKey);
      if (!agentDef) { app.log.warn(`[agent-reply] Unknown agent: ${agentKey}`); return; }

      const isMessaging = !!(trigger.threadId && trigger.channel === 'messaging');

      // Helper: sanitize BigInt and Date values recursively before JSON serialization
      function sanitize(val: unknown): unknown {
        if (typeof val === 'bigint') return val.toString();
        if (val instanceof Date) return val.toISOString();
        if (Array.isArray(val)) return val.map(sanitize);
        if (val && typeof val === 'object') return Object.fromEntries(Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)]));
        return val;
      }

      // Build agent actor context
      const actorCtx = createServiceContext({
        kind: 'agent', source: 'internal' as const,
        agentKey,
        agentName: agentDef.name,
        scopes: ['messaging.write'] as import('@hq/auth/types').BotScope[],
        permissions: {} as import('@hq/auth/types').PermissionMap,
      });

      let placeholderMsgId: string | null = null;

      if (isMessaging) {
        // Ensure AGENT is a participant
        await workerDb.msgParticipant.upsert({
          where: { threadId_actorType_actorId: { threadId: trigger.threadId!, actorType: 'AGENT', actorId: agentKey } },
          create: { threadId: trigger.threadId!, actorType: 'AGENT', actorId: agentKey, role: 'member', notifyLevel: 'all' },
          update: { leftAt: null, notifyLevel: 'all' },
        });

        // Create streaming placeholder message — the placeholder itself shows loading
        // dots in the UI (streamingStatus='streaming'), so no separate typing indicator needed.
        // Pass parentMessageId so thread replies land in the thread, not the main feed.
        const placeholder = await sendMessage(actorCtx, trigger.threadId!, {
          content: '',
          contentType: 'TEXT',
          streamingStatus: 'streaming',
          ...(trigger.parentMessageId ? { parentMessageId: trigger.parentMessageId } : {}),
        });
        placeholderMsgId = placeholder.id;

        // Notify UI: placeholder is ready, streaming will fill it
        const placeholderRecord = sanitize(placeholder) as Record<string, unknown>;
        await notifyMessaging({ type: 'message.created', threadId: trigger.threadId!, message: placeholderRecord });
      }

      // Streaming chunk callback — sends each block part via SSE in real time
      const onChunk = isMessaging && placeholderMsgId
        ? async (part: import('@hq/agents').StreamPart) => {
            try {
              // Cap tool-result payloads to avoid Postgres NOTIFY 8KB limit
              let safePart = part;
              if (part.type === 'tool-result') {
                const resultStr = JSON.stringify(part.result);
                if (resultStr.length > 2000) {
                  safePart = { ...part, result: { _truncated: true, preview: resultStr.slice(0, 2000) } };
                }
              }
              await notifyMessaging({
                type: 'message.streaming',
                threadId: trigger.threadId!,
                messageId: placeholderMsgId!,
                part: sanitize(safePart) as Parameters<typeof notifyMessaging>[0] extends { part: infer P } ? P : never,
              });
            } catch { /* non-fatal: skip chunk if notify fails */ }
          }
        : undefined;

      let result: Awaited<ReturnType<typeof executeAgentTurn>>;
      try {
        result = await executeAgentTurn(
          agentKey,
          trigger as Parameters<typeof executeAgentTurn>[1],
          onChunk
        );
      } catch (err) {
        app.log.error({ err, agentKey, threadId: trigger.threadId }, '[agent-reply] executeAgentTurn failed');
        if (isMessaging) {
          // If we have a placeholder, update it with the error; otherwise post a new message
          const errMsg = err instanceof Error ? err.message : String(err);
          const errContent = `⚠️ Agent error: ${errMsg}`;

          try {
            if (placeholderMsgId) {
              await workerDb.msgMessage.update({
                where: { id: placeholderMsgId },
                data: { content: errContent, streamingStatus: null },
              });
              await notifyMessaging({ type: 'message.updated', threadId: trigger.threadId!, message: sanitize({ id: placeholderMsgId, content: errContent, streamingStatus: null, blocks: [] }) as Record<string, unknown> });
            } else {
              const errMsg2 = await sendMessage(actorCtx, trigger.threadId!, { content: errContent, contentType: 'TEXT' });
              await notifyMessaging({ type: 'message.created', threadId: trigger.threadId!, message: sanitize(errMsg2) as Record<string, unknown> });
            }
          } catch (sendErr) {
            app.log.error(sendErr, '[agent-reply] Failed to send error message to thread');
          }
        }
        throw err;
      }

      // Finalize: update placeholder with complete content + blocks, clear streaming status
      if (isMessaging && placeholderMsgId) {
        const finalBlocks = sanitize(result.blocks) as object[];
        const finalContent = result.text ?? '';
        await workerDb.msgMessage.update({
          where: { id: placeholderMsgId },
          data: { content: finalContent, blocks: finalBlocks, streamingStatus: null },
        });

        // Update thread lastMessage
        await workerDb.msgThread.update({
          where: { id: trigger.threadId! },
          data: { lastMessageAt: new Date(), lastMessageId: placeholderMsgId },
        });

        // Notify UI: streaming done, replace with final state
        await notifyMessaging({
          type: 'message.updated',
          threadId: trigger.threadId!,
          message: sanitize({ id: placeholderMsgId, content: finalContent, blocks: finalBlocks, streamingStatus: null }) as Record<string, unknown>,
        });
      }
    }, { batchSize: 5 });

    // Sync cron schedules from registry
    await syncAgentCrons().catch((err: unknown) =>
      app.log.error(err, 'Agent cron sync failed')
    );

    app.log.info(
      `Agent runtime ready — ${skillRegistry.list().length} skills registered`
    );

    // pg-boss worker: execute workflow runs
    await registerWorker('workflow.run', async (job) => {
      const { workflowKey, triggerType, input, triggerPayload, correlationId } = job.data;

      const serviceCtx = createServiceContext({
        kind: 'agent', source: 'internal' as const,
        agentKey: `workflow:${workflowKey}`,
        agentName: `Workflow: ${workflowKey}`,
        scopes: ['company.read', 'company.write', 'contact.read', 'contact.write', 'campaign.read', 'campaign.write', 'prospect.read', 'prospect.write', 'messaging.write', 'integration.execute'] as import('@hq/auth/types').BotScope[],
        permissions: {} as import('@hq/auth/types').PermissionMap,
      });

      const result = await executeWorkflow({
        workflowKey,
        input,
        triggerType,
        triggerPayload,
        serviceContext: serviceCtx,
        correlationId,
      });

      if (result.status === 'failed') {
        app.log.error({ workflowKey, runId: result.runId, error: result.error }, '[workflow.run] failed');
      } else {
        app.log.info({ workflowKey, runId: result.runId, steps: result.stepCount }, '[workflow.run] completed');
      }
    });

    app.log.info(`Workflows: ${getWorkflows().length} registered`);

    // Register event subscriptions for agent event triggers
    for (const agentDef of (await import('@hq/agents')).getAgents()) {
      for (const trigger of agentDef.defaultTriggers) {
        if (trigger.type === 'event' && trigger.eventType) {
          subscribe(trigger.eventType, async (event) => {
            const { onPlatformEvent: agentOnEvent } = await import('@hq/agents/triggers');
            await agentOnEvent(event);
          }, { source: `agent:${agentDef.key}` });
        }
      }
    }

    // Register event subscriptions for workflow event triggers
    for (const wfDef of getWorkflows()) {
      for (const trigger of wfDef.triggers) {
        if (trigger.type === 'event' && trigger.eventType) {
          subscribe(trigger.eventType, async (event) => {
            await scheduleJob('workflow.run', {
              workflowKey: wfDef.key,
              triggerType: 'event',
              triggerPayload: event as unknown as Record<string, unknown>,
              correlationId: event.id,
            });
          }, { source: `workflow:${wfDef.key}` });
        }
      }
    }

    app.log.info(`Event subscriptions: ${getSubscriptionCount()} registered`);
  });

  app.addHook('onClose', async () => {
    await stopSSEListener();
    await stopBoss();
  });

  return app;
}
