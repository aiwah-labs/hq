function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const DEV_DEFAULT_SUPERADMIN_EMAIL = 'admin@example.com';

export function getSuperadminAllowlist(): Set<string> {
  const configured = process.env.SUPERADMIN_EMAIL_ALLOWLIST;
  const raw =
    configured && configured.trim().length > 0
      ? configured
      : process.env.NODE_ENV === 'development'
        ? DEV_DEFAULT_SUPERADMIN_EMAIL
        : '';
  const items = raw
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

  return new Set(items);
}

export function isSuperadmin(email: string): boolean {
  return getSuperadminAllowlist().has(normalizeEmail(email));
}

export function isSuperadminEmail(email: string): boolean {
  return isSuperadmin(email);
}
