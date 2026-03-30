import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AiwahApiClient } from '@hq/api-client';
import { asText, toMcpError } from '../util.js';

export function registerWorkflowTools(server: McpServer, client: AiwahApiClient): void {
  server.tool('workflow.list', 'List all registered workflow definitions with recent run stats', {}, async () => {
    try {
      return { content: [{ type: 'text', text: asText(await client.listWorkflows()) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool('workflow.get', 'Get a workflow definition by key, including recent runs and stats', { key: z.string().min(1) }, async (input) => {
    try {
      return { content: [{ type: 'text', text: asText(await client.getWorkflow(input.key)) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool(
    'workflow.runs',
    'List recent runs for a workflow. Optionally filter by status.',
    {
      key: z.string().min(1),
      status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED']).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.listWorkflowRuns(input.key, { status: input.status, limit: input.limit })) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'workflow.run.get',
    'Get full detail for a specific workflow run including all step logs',
    { key: z.string().min(1), runId: z.string().min(1) },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.getWorkflowRun(input.key, input.runId)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'workflow.trigger',
    'Manually trigger a workflow run. Provide input if the workflow requires it.',
    {
      key: z.string().min(1),
      input: z.record(z.string(), z.unknown()).optional(),
    },
    async (params) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.triggerWorkflow(params.key, params.input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );
}
