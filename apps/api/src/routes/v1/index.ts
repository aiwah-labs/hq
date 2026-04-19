import type { FastifyInstance } from 'fastify';
import { registerMeRoute } from './me';
import { registerBotsRoutes } from './bots';
import { registerRuntimeRoutes } from './runtime';
import { registerObjectRoutes } from './objects';
import { registerActionRoutes } from './actions';
import { registerApprovalRoutes } from './approvals';
import { registerActivityRoutes } from './activity';
// import { registerMessagingRoutes } from './messaging'; // TODO: rewrite for simplified MsgThread/MsgMessage schema
import { registerAgentRoutes } from './agents';
import { registerWorkflowRoutes } from './workflows';
import { registerNotesRoutes } from './notes';
import { registerInboxRoutes } from './inbox';
import { registerIntegrationRoutes } from './integrations';
import { registerFilesRoutes } from './files';

export async function registerV1Routes(app: FastifyInstance) {
  await registerMeRoute(app);
  await registerBotsRoutes(app);
  await registerRuntimeRoutes(app);
  await registerObjectRoutes(app);
  await registerActionRoutes(app);
  await registerApprovalRoutes(app);
  await registerActivityRoutes(app);
  // await registerMessagingRoutes(app);
  await registerAgentRoutes(app);
  await registerWorkflowRoutes(app);
  await registerNotesRoutes(app);
  await registerInboxRoutes(app);
  await registerIntegrationRoutes(app);
  await registerFilesRoutes(app);
}
