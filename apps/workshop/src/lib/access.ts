import type { PermissionKey } from '@hq/auth/types';

export const PERMISSIONS = {
  workshopView: 'workshop.view',
  contentAll: 'content.all',
  settingsView: 'settings.view',
  usersView: 'users.view',
  usersManage: 'users.manage',
  adminSurface: 'admin.surface',
  botsView: 'bots.view',
  botsCreate: 'bots.create',
  botsManageAny: 'bots.manage.any',
  messagingView: 'messaging.view',
} as const satisfies Record<string, PermissionKey>;

export const ROUTE_PERMISSIONS = {
  workshop: PERMISSIONS.workshopView,
  content: PERMISSIONS.contentAll,
  settings: PERMISSIONS.settingsView,
  users: PERMISSIONS.usersView,
  bots: PERMISSIONS.botsView,
  messaging: PERMISSIONS.messagingView,
  agents: PERMISSIONS.workshopView,
  workflows: PERMISSIONS.workshopView,
  notes: PERMISSIONS.workshopView,
} as const;

export const ADMIN_SURFACE_PERMISSION: PermissionKey = PERMISSIONS.adminSurface;
