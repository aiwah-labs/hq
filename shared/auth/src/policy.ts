export const PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    'workshop.view',
    'users.view',
    'users.manage',
    'admin.surface',
    'bots.view',
    'bots.manage',
    'settings.view',
    'customer.read',
    'customer.write',
    'product.read',
    'product.write',
  ],
  MEMBER: ['workshop.view', 'settings.view', 'bots.view', 'customer.read', 'product.read'],
};

export function hasPermission(role: string, permission: string): boolean {
  return PERMISSIONS[role]?.includes(permission) ?? false;
}
