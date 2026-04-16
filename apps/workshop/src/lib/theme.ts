import { THEME_COOKIE_NAME, parseThemePreference, type ThemePreference } from '@hq/auth/cookies';

export { THEME_COOKIE_NAME };
export type { ThemePreference };

export function getThemePreference(value: string | undefined | null): ThemePreference {
  return parseThemePreference(value);
}

export function getHtmlThemeAttribute(theme: ThemePreference): 'light' | 'dark' | undefined {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }

  return undefined;
}
