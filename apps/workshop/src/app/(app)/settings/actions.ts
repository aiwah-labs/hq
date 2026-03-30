'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getThemeCookieOptions, THEME_COOKIE_NAME, parseThemePreference } from '@hq/auth/cookies';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';

export async function setThemePreferenceAction(formData: FormData): Promise<never> {
  await requirePermission(ROUTE_PERMISSIONS.settings);

  const raw = String(formData.get('theme') ?? 'system');
  const theme = parseThemePreference(raw);

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE_NAME, theme, getThemeCookieOptions());

  return redirect(`/settings?success=${encodeURIComponent('Appearance updated')}`);
}
