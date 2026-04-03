// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { UserStatus } from '@hq/db';
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@hq/auth/cookies';
import { verifyPassword } from '@hq/auth/passwords';
import { createSession, destroySession } from '@hq/auth/sessions';
import { db } from '@/lib/db';

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

function errorRedirect(message: string): never {
  const encoded = encodeURIComponent(message);
  redirect(`/login?error=${encoded}`);
}

export async function loginAction(formData: FormData): Promise<never> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return errorRedirect('Please enter a valid email and password.');
  }

  const email = parsed.data.email.toLowerCase().trim();

  const user = await db.user.findUnique({
    where: { email },
  });

  if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
    return errorRedirect('Invalid credentials or inactive account.');
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return errorRedirect('Invalid credentials or inactive account.');
  }

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() ?? null;
  const userAgent = requestHeaders.get('user-agent');

  const session = await createSession({
    userId: user.id,
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions());

  return redirect('/workshop');
}

export async function logoutAction(): Promise<never> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  await destroySession(token);
  cookieStore.delete(SESSION_COOKIE_NAME);

  return redirect('/login');
}
