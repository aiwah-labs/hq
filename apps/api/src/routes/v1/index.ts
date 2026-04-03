// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import type { FastifyInstance } from 'fastify';
import { registerMeRoute } from './me';
import { registerBotsRoutes } from './bots';
import { registerContentRoutes } from './content';
import { registerRuntimeRoutes } from './runtime';
import { registerCrmRoutes } from './crm';
import { registerMessagingRoutes } from './messaging';
import { registerAgentRoutes } from './agents';
import { registerWorkflowRoutes } from './workflows';
import { registerNotesRoutes } from './notes';

export async function registerV1Routes(app: FastifyInstance) {
  await registerMeRoute(app);
  await registerContentRoutes(app);
  await registerBotsRoutes(app);
  await registerRuntimeRoutes(app);
  await registerCrmRoutes(app);
  await registerMessagingRoutes(app);
  await registerAgentRoutes(app);
  await registerWorkflowRoutes(app);
  await registerNotesRoutes(app);
}
