/**
 * HQ MCP server.
 *
 * Exposes every registered action (see `shared/actions`) as an MCP tool with
 * a real JSON schema. Tools/list and tools/call both route through the same
 * action registry + dispatcher the HTTP API uses, so scopes, risk, and
 * approvals behave identically across surfaces.
 *
 * Authentication: the server resolves a bot principal from a local API key in
 * `MCP_BOT_API_KEY` (env). Without one, it boots in a read-only preview mode
 * that lists tools but rejects `tools/call` with UNAUTHENTICATED.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { actionRegistry, dispatchAction, serializeAction } from '@hq/actions';
import { resolveAuth } from '@hq/auth/middleware';
import type { AuthPrincipal } from '@hq/auth/types';

/**
 * Map an action name (`company.list`) to an MCP-safe tool key (`company_list`).
 * Some MCP clients do not accept dots in tool names.
 */
function actionToToolKey(name: string): string {
  return name.replace(/\./g, '_');
}

function toolKeyToAction(key: string): string | undefined {
  // Direct match first (clients that preserve dots), then underscore map.
  if (actionRegistry.get(key)) return key;
  for (const action of actionRegistry.list()) {
    if (actionToToolKey(action.name) === key) return action.name;
  }
  return undefined;
}

async function resolvePrincipal(): Promise<AuthPrincipal | null> {
  const apiKey = process.env.MCP_BOT_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const ctx = await resolveAuth({
      cookieHeader: null,
      authorizationHeader: `Bearer ${apiKey}`,
      ipAddress: null,
      userAgent: 'hq-mcp',
    });
    if (ctx.kind === 'authenticated') return ctx.principal;
  } catch (err) {
    console.error('[mcp] principal resolution failed', err);
  }
  return null;
}

const server = new Server(
  { name: 'hq', version: '0.2.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: actionRegistry.list().map((action) => {
      const serialized = serializeAction(action);
      const riskTag = `[risk: ${serialized.risk}]`;
      const approvalTag = serialized.approval?.required ? ' [approval required]' : '';
      return {
        name: actionToToolKey(action.name),
        description: `${action.description} ${riskTag}${approvalTag}`.trim(),
        inputSchema: serialized.parameters as Record<string, unknown>,
      };
    }),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const actionName = toolKeyToAction(name);
  if (!actionName) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  }

  const principal = await resolvePrincipal();
  if (!principal) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'UNAUTHENTICATED: set MCP_BOT_API_KEY to a valid bot API key.',
        },
      ],
    };
  }

  const outcome = await dispatchAction(actionName, args ?? {}, principal);
  if (!outcome.ok) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `[${outcome.code}] ${outcome.message}`,
        },
      ],
    };
  }
  if ('pending' in outcome && outcome.pending) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'pending_approval',
              approvalRequestId: outcome.approvalRequestId,
              executionId: outcome.executionId,
              risk: outcome.risk,
              reason: outcome.reason,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(outcome.result, null, 2),
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
