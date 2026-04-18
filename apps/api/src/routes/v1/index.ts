import type { FastifyInstance } from 'fastify';
import { registerMeRoute } from './me';
import { registerBotsRoutes } from './bots';
import { registerContentRoutes } from './content';
import { registerRuntimeRoutes } from './runtime';
import { registerObjectRoutes } from './objects';
import { registerActionRoutes } from './actions';
import { registerApprovalRoutes } from './approvals';
import { registerMessagingRoutes } from './messaging';
import { registerAgentRoutes } from './agents';
import { registerWorkflowRoutes } from './workflows';
import { registerNotesRoutes } from './notes';

export async function registerV1Routes(app: FastifyInstance) {
  await registerMeRoute(app);
  await registerContentRoutes(app);
  await registerBotsRoutes(app);
  await registerRuntimeRoutes(app);
  await registerObjectRoutes(app);
  await registerActionRoutes(app);
  await registerApprovalRoutes(app);
  await registerMessagingRoutes(app);
  await registerAgentRoutes(app);
  await registerWorkflowRoutes(app);
  await registerNotesRoutes(app);
}
