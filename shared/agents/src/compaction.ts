// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { generateText } from 'ai';
import { db } from '@hq/db';
import { buildModel } from './model.js';
import { getAgent } from './registry.js';

export async function compactThread(threadId: string): Promise<void> {
  const thread = await db.agentThread.findUniqueOrThrow({ where: { id: threadId } });
  const def = getAgent(thread.agentKey);
  if (!def?.compaction) return;

  // Mark as compacting to avoid concurrent compactions
  await db.agentThread.update({
    where: { id: threadId },
    data: { status: 'compacting' },
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = thread.messages as any[];
    const keepRecent = def.compaction.keepRecent;
    const olderMessages = messages.slice(0, -keepRecent);

    if (olderMessages.length < 5) {
      await db.agentThread.update({ where: { id: threadId }, data: { status: 'active' } });
      return;
    }

    // Generate summary of older messages
    const { text: summary } = await generateText({
      model: buildModel(def.compaction.summaryModel ?? def.model),
      system: 'Summarize the following conversation concisely. Preserve key facts, decisions, tool results, and user preferences. Omit pleasantries and redundant exchanges.',
      prompt: olderMessages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((m: any) => m.role !== 'system')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((m: any) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
        .join('\n'),
    });

    const recentMessages = messages.slice(-keepRecent);
    await db.agentThread.update({
      where: { id: threadId },
      data: {
        summary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: recentMessages as any,
        status: 'active',
        metadata: {
          ...(thread.metadata as object),
          lastCompactionAt: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    // Restore active status on failure so we don't get stuck
    await db.agentThread.update({ where: { id: threadId }, data: { status: 'active' } }).catch(() => {});
    throw err;
  }
}
