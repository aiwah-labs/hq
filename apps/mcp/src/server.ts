import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registry } from '@hq/actions';

const server = new Server({ name: 'hq', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler({ method: 'tools/list' } as any, async () => ({
  tools: registry.list().map((action) => ({
    name: action.name,
    description: action.description,
    inputSchema: { type: 'object' },
  })),
}));

const transport = new StdioServerTransport();
await server.connect(transport);
