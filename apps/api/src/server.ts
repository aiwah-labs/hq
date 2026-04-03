// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import Fastify from 'fastify';
import { db } from '@hq/db';
import { listAgents } from '@hq/agents';
import { listWorkflows } from '@hq/workflows';
import { registry as actionRegistry } from '@hq/actions';
import { objects } from '@hq/objects';
import { getSessionUser } from '@hq/auth';

const app = Fastify({ logger: true });

// Health
app.get('/health', async () => ({ ok: true }));

// Objects (generic CRUD for each registered object)
for (const [name] of Object.entries(objects)) {
  const lower = name.toLowerCase();
  app.get(`/v1/objects/${lower}`, async (req) => {
    return (db as any)[lower].findMany();
  });
}

// Agents
app.get('/v1/agents', async () => listAgents());

// Workflows
app.get('/v1/workflows', async () => listWorkflows());

// Actions list
app.get('/v1/actions', async () =>
  actionRegistry.list().map((a) => ({ name: a.name, description: a.description, scopes: a.scopes }))
);

// Notes
app.get('/v1/notes', async () =>
  db.note.findMany({ orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }] })
);

const port = Number(process.env.PORT ?? 3003);
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
