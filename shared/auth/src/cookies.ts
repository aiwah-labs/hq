// CUSTOMIZE: set `COOKIE_PREFIX` env var (e.g. `acme`) to rebrand cookies.
// Defaults to `hq`. Changing in production invalidates existing sessions.
const COOKIE_PREFIX = process.env.COOKIE_PREFIX?.trim() || 'hq';

export const SESSION_COOKIE_NAME = `${COOKIE_PREFIX}_session`;
export const THEME_COOKIE_NAME = `${COOKIE_PREFIX}_theme`;

export type ThemePreference = 'system' | 'light' | 'dark';

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  maxAge?: number;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function resolveCookieSecure(): boolean {
  const raw = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();

  if (raw === 'true' || raw === '1') {
    return true;
  }

  if (raw === 'false' || raw === '0') {
    return false;
  }

  return process.env.NODE_ENV === 'production';
}

export function getSessionCookieOptions(maxAge = SESSION_TTL_SECONDS): CookieOptions {
  return {
    httpOnly: true,
    secure: resolveCookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

export function getThemeCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: resolveCookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  };
}

export function parseThemePreference(value: string | undefined | null): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return 'system';
}
