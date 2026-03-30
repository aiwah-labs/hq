import { z } from 'zod';
import { db } from '@hq/db';
import { defineAction } from '../../registry';

defineAction({
  name: 'messaging.search_history',
  title: 'Search conversation history',
  description:
    'Search past messages, tool calls, and reasoning across all sessions in this channel. ' +
    'Use this to recall what was discussed, decided, or executed in previous sessions.',
  category: 'custom',
  objects: { reads: [] },
  scopes: [],
  parameters: z.object({
    query: z.string().min(1).max(200).describe('Keywords or phrase to search for'),
    limit: z.number().int().min(1).max(20).default(10).optional().describe('Max sessions to scan (default 10)'),
  }),
  handler: async (params, ctx) => {
    const { query, limit = 10 } = params as { query: string; limit?: number };
    const channelRef = ctx.channelRef;
    const agentKey = ctx.actor.kind === 'bot' ? ctx.actor.botId : null;

    if (!agentKey || !channelRef) {
      return { found: false, message: 'No channel context available.' };
    }

    // Match all sessions for this thread regardless of channel prefix.
    // channelRef format is "channel:threadId" — strip the prefix to get a bare threadId.
    const threadId = channelRef.includes(':') ? channelRef.split(':').slice(1).join(':') : channelRef;

    // Search AgentThread.messages (raw JSON cast to text) — covers user turns,
    // assistant turns, tool calls, tool results, and reasoning blocks.
    const sessions = await db.$queryRaw<Array<{
      id: string;
      updated_at: Date;
      messages: unknown;
    }>>`
      SELECT id, "updatedAt" as updated_at, messages
      FROM "AgentThread"
      WHERE "agentKey" = ${agentKey}
        AND "channelRef" LIKE ${'%:' + threadId}
        AND messages::text ILIKE ${'%' + query + '%'}
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `;

    if (sessions.length === 0) {
      return { found: false, message: `No results found for "${query}"` };
    }

    // Extract relevant snippets from matching sessions
    const sessionSummaries = sessions.map((s) => {
      const msgs = Array.isArray(s.messages) ? s.messages as Array<Record<string, unknown>> : [];
      // Find messages containing the query (case-insensitive)
      const q = query.toLowerCase();
      const snippets: string[] = [];
      for (const m of msgs) {
        const role = String(m.role ?? '');
        const content = m.content;
        let text = '';
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          // AI SDK content blocks: [{type:'text',text:'...'}, {type:'tool-call',...}]
          text = content.map((c: unknown) => {
            const block = c as Record<string, unknown>;
            if (block.type === 'text') return String(block.text ?? '');
            if (block.type === 'tool-call') return `[tool: ${block.toolName} args: ${JSON.stringify(block.args)}]`;
            if (block.type === 'tool-result') return `[result: ${JSON.stringify(block.result)}]`;
            return '';
          }).join(' ');
        }
        if (text.toLowerCase().includes(q)) {
          const idx = text.toLowerCase().indexOf(q);
          const start = Math.max(0, idx - 60);
          const end = Math.min(text.length, idx + query.length + 100);
          snippets.push(`[${role}] …${text.slice(start, end)}…`);
        }
        if (snippets.length >= 3) break;
      }
      return {
        date: s.updated_at.toISOString().slice(0, 10),
        sessionId: s.id,
        turnCount: msgs.length,
        snippets,
      };
    });

    return {
      found: true,
      sessions: sessionSummaries,
    };
  },
});
