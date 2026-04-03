// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { db } from '@hq/db';
import { scheduleJob } from '@hq/jobs';
import { getAgents } from '../registry.js';
import type { TriggerPayload } from '../types.js';

function extractAgentMentions(content: string): string[] {
  const matches = content.match(/@([a-z0-9_-]+)/gi) ?? [];
  return matches.map((m) => m.slice(1).toLowerCase());
}

async function dispatchAgentTurn(
  agentKey: string,
  trigger: TriggerPayload
): Promise<void> {
  await scheduleJob(
    'agent.run',
    { agentKey, trigger },
    { retryLimit: 2, retryDelay: 30 }
  );
}

export async function onChannelMessage(msg: {
  id: string;
  threadId: string;
  channelId: string;
  channelType: string;
  senderId: string;
  senderType: string;
  content: string;
  isDm: boolean;
  parentMessageId?: string;
}): Promise<void> {
  const agents = getAgents();

  // 1. DM DISPATCH — all agents with dm behavior
  if (msg.isDm) {
    for (const def of agents) {
      if (!def.channelBehavior?.dm) continue;

      // Check if agent is enabled
      const config = await db.agentConfig.findUnique({ where: { agentKey: def.key } });
      if (config?.enabled === false) continue;

      await dispatchAgentTurn(def.key, {
        type: 'message',
        mode: 'dm',
        channel: msg.channelType,
        channelId: msg.channelId,
        threadId: msg.threadId,
        messageId: msg.id,
        parentMessageId: msg.parentMessageId,
        userId: msg.senderId,
        text: msg.content,
      });
    }
    return;
  }

  // 2. @MENTION DISPATCH
  const mentionedKeys = extractAgentMentions(msg.content);

  for (const key of mentionedKeys) {
    const def = agents.find((a) => a.key === key);
    if (!def?.channelBehavior?.group) continue;

    const config = await db.agentConfig.findUnique({ where: { agentKey: def.key } });
    if (config?.enabled === false) continue;

    const groupBehavior = def.channelBehavior.group;

    // If threadFollow: 'follow', track the thread so future messages trigger the agent
    if (groupBehavior.threadFollow === 'follow') {
      // AgentThread with channelRef tracks the follow relationship
      const channelRef = `${msg.channelType}:${msg.threadId}`;
      const existingThread = await db.agentThread.findFirst({
        where: { agentKey: def.key, channelRef },
      });
      if (!existingThread) {
        await db.agentThread.create({
          data: { agentKey: def.key, channelRef, messages: [], metadata: {} },
        });
      }
    }

    await dispatchAgentTurn(def.key, {
      type: 'message',
      mode: 'mention',
      channel: msg.channelType,
      channelId: msg.channelId,
      threadId: msg.threadId,
      messageId: msg.id,
      parentMessageId: msg.parentMessageId,
      userId: msg.senderId,
      text: msg.content,
    });
  }

  // 3. THREAD FOLLOW DISPATCH — agents that follow this thread (after a prior mention)
  const channelRef = `${msg.channelType}:${msg.threadId}`;
  const followingAgents = await db.agentThread.findMany({
    where: { channelRef },
    select: { agentKey: true },
  });

  for (const { agentKey } of followingAgents) {
    if (mentionedKeys.includes(agentKey)) continue; // already dispatched above

    const def = agents.find((a) => a.key === agentKey);
    if (!def) continue;

    const config = await db.agentConfig.findUnique({ where: { agentKey } });
    if (config?.enabled === false) continue;

    await dispatchAgentTurn(agentKey, {
      type: 'message',
      mode: 'thread_watch',
      channel: msg.channelType,
      channelId: msg.channelId,
      threadId: msg.threadId,
      messageId: msg.id,
      parentMessageId: msg.parentMessageId,
      userId: msg.senderId,
      text: msg.content,
    });
  }

  // 4. CHANNEL MONITOR DISPATCH — agents subscribed to this channel
  const channelSubs = await db.agentChannelSub.findMany({
    where: { channelId: msg.channelId },
  });

  for (const sub of channelSubs) {
    if (mentionedKeys.includes(sub.agentKey)) continue; // already dispatched above

    const def = agents.find((a) => a.key === sub.agentKey);
    if (!def?.channelBehavior?.group) continue;

    const config = await db.agentConfig.findUnique({ where: { agentKey: sub.agentKey } });
    if (config?.enabled === false) continue;

    const groupBehavior = def.channelBehavior.group;

    // Apply mode filter
    if (groupBehavior.mode === 'on_keyword') {
      const keywords = groupBehavior.keywords ?? [];
      const matches = keywords.some((kw) =>
        msg.content.toLowerCase().includes(kw.toLowerCase())
      );
      if (!matches) continue;
    } else if (groupBehavior.mode === 'on_mention') {
      continue; // handled in section 2 above
    }
    // mode === 'always' falls through

    await dispatchAgentTurn(sub.agentKey, {
      type: 'message',
      mode: 'channel_monitor',
      channel: msg.channelType,
      channelId: msg.channelId,
      threadId: msg.threadId,
      messageId: msg.id,
      parentMessageId: msg.parentMessageId,
      userId: msg.senderId,
      text: msg.content,
    });
  }
}
