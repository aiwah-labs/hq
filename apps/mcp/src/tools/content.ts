import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HQApiClient } from '@hq/api-client';
import { asText, toMcpError } from '../util.js';

const attachmentSchema = z
  .object({
    url: z.string().min(1),
    type: z.string().optional(),
    mimeType: z.string().optional(),
    caption: z.string().optional(),
  })
  .passthrough();

export function registerContentTools(server: McpServer, client: HQApiClient): void {
  server.tool(
    'content.list',
    'List content items. Use status/query filters when needed.',
    {
      status: z.string().min(1).optional(),
      query: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.listContent(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool('content.get', 'Get one content record by id', { contentId: z.string().min(1) }, async (input) => {
    try {
      return { content: [{ type: 'text', text: asText(await client.getContent(input.contentId)) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool(
    'content.create',
    'Create one content record (idea is status=idea).',
    {
      title: z.string().min(1).max(200),
      text: z.string().optional(),
      status: z.string().min(1).optional(),
      platform: z.string().optional(),
      source: z.string().optional(),
      externalUrl: z.string().optional(),
      attachments: z.array(attachmentSchema).default([]),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.createContent(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'content.update',
    'Update one content record by id.',
    {
      contentId: z.string().min(1),
      title: z.string().min(1).max(200).optional(),
      text: z.string().optional(),
      status: z.string().min(1).optional(),
      platform: z.string().nullable().optional(),
      source: z.string().nullable().optional(),
      externalUrl: z.string().nullable().optional(),
      attachments: z.array(attachmentSchema).optional(),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.updateContent(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'content.publish',
    'Mark content as published and optionally set external URL.',
    {
      contentId: z.string().min(1),
      externalUrl: z.string().nullable().optional(),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.publishContent(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );
}
