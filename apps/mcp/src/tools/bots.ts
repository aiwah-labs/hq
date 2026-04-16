import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AiwahApiClient } from '@hq/api-client';
import { asText, toMcpError } from '../util.js';

export function registerBotTools(server: McpServer, client: AiwahApiClient): void {
  server.tool('bot.list', 'List bots visible to this principal', async () => {
    try {
      return { content: [{ type: 'text', text: asText(await client.listBots()) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool('bot.get', 'Get details for one bot', { botId: z.string().min(1) }, async (input) => {
    try {
      return { content: [{ type: 'text', text: asText(await client.getBot(input.botId)) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool('bot.key.list', 'List API keys for a bot', { botId: z.string().min(1) }, async (input) => {
    try {
      return { content: [{ type: 'text', text: asText(await client.listBotKeys(input.botId)) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool(
    'bot.key.create',
    'Create a bot API key (secret is returned once)',
    {
      botId: z.string().min(1),
      name: z.string().min(2).max(60),
      scopes: z.array(z.string().min(1)).default([]),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.createBotKey(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'bot.key.revoke',
    'Revoke a bot API key',
    { botId: z.string().min(1), keyId: z.string().min(1) },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.revokeBotKey(input) ?? { revoked: true }) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );
}
