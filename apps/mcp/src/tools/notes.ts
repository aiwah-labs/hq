// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AiwahApiClient } from '@hq/api-client';
import { asText, toMcpError } from '../util.js';

export function registerNoteTools(server: McpServer, client: AiwahApiClient): void {
  server.tool(
    'note.list',
    'List notes. Optionally filter by text search query, tag, or pinned status.',
    {
      q: z.string().min(1).optional(),
      tag: z.string().min(1).optional(),
      isPinned: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.listNotes(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool('note.get', 'Get a single note by id or slug', { noteId: z.string().min(1) }, async (input) => {
    try {
      return { content: [{ type: 'text', text: asText(await client.getNote(input.noteId)) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool(
    'note.create',
    'Create a new note. Body supports full Markdown.',
    {
      title: z.string().min(1).max(300),
      body: z.string().max(500_000).optional(),
      slug: z.string().min(1).max(200).optional(),
      tags: z.array(z.string().min(1).max(80)).max(20).default([]),
      isPinned: z.boolean().default(false),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.createNote(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'note.update',
    'Update an existing note by id',
    {
      noteId: z.string().min(1),
      title: z.string().min(1).max(300).optional(),
      body: z.string().max(500_000).optional(),
      slug: z.string().min(1).max(200).nullable().optional(),
      tags: z.array(z.string().min(1).max(80)).max(20).optional(),
      isPinned: z.boolean().optional(),
    },
    async (input) => {
      try {
        const { noteId, ...data } = input;
        return { content: [{ type: 'text', text: asText(await client.updateNote(noteId, data)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool('note.delete', 'Soft-delete a note by id', { noteId: z.string().min(1) }, async (input) => {
    try {
      return { content: [{ type: 'text', text: asText(await client.deleteNote(input.noteId)) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });
}
