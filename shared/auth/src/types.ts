export type DbRole = 'ADMIN' | 'MEMBER' | 'BOT';
export type EffectiveRole = DbRole | 'SUPERADMIN';
export const BOT_SCOPES = [
  // Content
  'content.read', 'content.write', 'content.publish',
  // Intelligence & metrics
  'intelligence.read', 'metrics.read',
  // Messaging
  'messaging.read', 'messaging.write',
  // Notes
  'note.read', 'note.write', 'note.delete',
  // CRM — companies
  'company.read', 'company.write', 'company.delete',
  // CRM — contacts
  'contact.read', 'contact.write', 'contact.delete',
  // CRM — campaigns
  'campaign.read', 'campaign.write', 'campaign.delete',
  // CRM — orders
  'order.read', 'order.write', 'order.delete',
  // CRM — prospects
  'prospect.read', 'prospect.write',
  // Integrations
  'integration.execute',
  // Projects
  'project.read', 'project.write', 'project.delete',
  // Tasks
  'task.read', 'task.write', 'task.delete',
  // Workflows
  'workflow.read', 'workflow.execute',
] as const;
export type BotScope = (typeof BOT_SCOPES)[number];

/**
 * Platform-level permissions. Narrow string union so misspellings fail at
 * compile time. Object-level perms (`customer.read`, `task.update`, …) are
 * represented as strings at runtime; the typed `PermissionKey` covers the
 * canonical built-in set. Object/action code that wants a concrete key can
 * cast to `PermissionKey`.
 */
export type PermissionKey =
  // UI surfaces
  | 'workshop.view'
  | 'content.all'
  | 'messaging.view'
  // Settings
  | 'settings.view'
  | 'settings.manage'
  // Users / identity
  | 'users.view'
  | 'users.manage'
  | 'identity.manage'
  | 'admin.surface'
  // Bots
  | 'bots.view'
  | 'bots.create'
  | 'bots.manage.any'
  // Agents
  | 'agents.view'
  | 'agents.manage'
  // Workflows
  | 'workflows.view'
  | 'workflows.execute'
  | 'workflows.manage'
  // Approvals
  | 'approvals.view'
  | 'approvals.decide'
  // Actions
  | 'actions.view'
  | 'actions.execute'
  // Audit
  | 'audit.view'
  // Integrations
  | 'integrations.view'
  | 'integrations.manage'
  // Per-object permissions are stringly-typed at runtime; widen with `string`
  // so codebases that generate permissions from the object registry still
  // type-check without casts.
  | (string & {});

export type PermissionMap = Record<string, boolean>;

export interface UserPrincipal {
  kind: 'user';
  source: 'session';
  userId: string;
  email: string;
  dbRole: DbRole;
  effectiveRole: EffectiveRole;
  isSuperadmin: boolean;
  scopes: BotScope[];
  permissions: PermissionMap;
}

export interface BotPrincipal {
  kind: 'bot';
  source: 'apikey';
  apiKeyId: string;
  botId: string;
  botSlug: string;
  botName: string;
  createdByUserId: string;
  createdByEmail: string;
  scopes: BotScope[];
  permissions: PermissionMap;
}

export interface AgentPrincipal {
  kind: 'agent';
  source: 'internal';
  agentKey: string;
  agentName: string;
  scopes: BotScope[];
  permissions: PermissionMap;
}

export type AuthPrincipal = UserPrincipal | BotPrincipal | AgentPrincipal;

export type AuthContext =
  | {
      kind: 'authenticated';
      principal: AuthPrincipal;
    }
  | {
      kind: 'none';
    };
