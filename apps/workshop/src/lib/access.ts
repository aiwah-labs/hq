import type { PermissionKey } from '@hq/auth/types';

/**
 * Central registry of platform permission keys used by the Workshop UI.
 *
 * These string keys match the policy engine's `PermissionKey` union. They are
 * consumed in two places:
 *  1. `ROUTE_PERMISSIONS` — the middleware gate for each top-level route.
 *  2. Layout chrome (nav visibility, action buttons). Components should always
 *     call `hasPermission(principal, PERMISSIONS.foo)` rather than hard-coding
 *     string literals to keep the set discoverable.
 */
export const PERMISSIONS = {
  // Surfaces
  workshopView: 'workshop.view',
  contentAll: 'content.all',
  messagingView: 'messaging.view',
  adminSurface: 'admin.surface',

  // Settings
  settingsView: 'settings.view',
  settingsManage: 'settings.manage',

  // Users & identity
  usersView: 'users.view',
  usersManage: 'users.manage',
  identityManage: 'identity.manage',

  // Bots
  botsView: 'bots.view',
  botsCreate: 'bots.create',
  botsManageAny: 'bots.manage.any',

  // Agents
  agentsView: 'agents.view',
  agentsManage: 'agents.manage',

  // Workflows
  workflowsView: 'workflows.view',
  workflowsExecute: 'workflows.execute',
  workflowsManage: 'workflows.manage',

  // Approvals
  approvalsView: 'approvals.view',
  approvalsDecide: 'approvals.decide',

  // Actions
  actionsView: 'actions.view',
  actionsExecute: 'actions.execute',

  // Audit
  auditView: 'audit.view',
} as const satisfies Record<string, PermissionKey>;

export const ROUTE_PERMISSIONS = {
  workshop: PERMISSIONS.workshopView,
  content: PERMISSIONS.contentAll,
  settings: PERMISSIONS.settingsView,
  users: PERMISSIONS.usersView,
  bots: PERMISSIONS.botsView,
  messaging: PERMISSIONS.messagingView,
  agents: PERMISSIONS.agentsView,
  workflows: PERMISSIONS.workflowsView,
  approvals: PERMISSIONS.approvalsView,
  actions: PERMISSIONS.actionsView,
  audit: PERMISSIONS.auditView,
  notes: PERMISSIONS.workshopView,
  diagnostics: PERMISSIONS.adminSurface,
} as const;

export const ADMIN_SURFACE_PERMISSION: PermissionKey = PERMISSIONS.adminSurface;
