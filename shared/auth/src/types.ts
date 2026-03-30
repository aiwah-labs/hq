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
  // CRM — prospects
  'prospect.read', 'prospect.write',
  // Integrations
  'integration.execute',
  // Workflows
  'workflow.read', 'workflow.execute',
] as const;
export type BotScope = (typeof BOT_SCOPES)[number];

export type PermissionKey =
  | 'workshop.view'
  | 'content.all'
  | 'settings.view'
  | 'users.view'
  | 'users.manage'
  | 'admin.surface'
  | 'bots.view'
  | 'bots.create'
  | 'bots.manage.any'
  | 'messaging.view';

export type PermissionMap = Record<PermissionKey, boolean>;

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
