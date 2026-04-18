'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@hq/db';
import { hashPassword } from '@hq/auth/passwords';
import { revokeAllSessionsForUser } from '@hq/auth/sessions';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';

function encode(msg: string): string {
  return encodeURIComponent(msg);
}

/**
 * Create a local-password user. SSO users are created implicitly by the OIDC
 * callback — this form is only for bootstrapping admins before SSO is wired up.
 */
export async function createUserAction(formData: FormData): Promise<never> {
  await requirePermission(PERMISSIONS.usersManage);

  const email = String(formData.get('email') ?? '').toLowerCase().trim();
  const name = String(formData.get('name') ?? '').trim() || null;
  const password = String(formData.get('password') ?? '');
  const role = String(formData.get('role') ?? 'MEMBER') as 'ADMIN' | 'MEMBER';

  if (!email || !password) {
    return redirect(`/users?error=${encode('Email and password are required.')}`);
  }
  if (password.length < 8) {
    return redirect(`/users?error=${encode('Password must be at least 8 characters.')}`);
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return redirect(`/users?error=${encode('A user with that email already exists.')}`);
  }

  await db.user.create({
    data: { email, name, passwordHash: await hashPassword(password), role, status: 'ACTIVE' },
  });

  revalidatePath('/users');
  return redirect(`/users?success=${encode('User created.')}`);
}

export async function updateUserRoleAction(formData: FormData): Promise<never> {
  await requirePermission(PERMISSIONS.usersManage);

  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '') as 'ADMIN' | 'MEMBER';
  if (!userId || !(role === 'ADMIN' || role === 'MEMBER')) {
    return redirect(`/users?error=${encode('Invalid role update.')}`);
  }

  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath('/users');
  return redirect(`/users?success=${encode('Role updated.')}`);
}

export async function setUserStatusAction(formData: FormData): Promise<never> {
  await requirePermission(PERMISSIONS.usersManage);

  const userId = String(formData.get('userId') ?? '');
  const status = String(formData.get('status') ?? '') as 'ACTIVE' | 'INACTIVE';
  if (!userId || !(status === 'ACTIVE' || status === 'INACTIVE')) {
    return redirect(`/users?error=${encode('Invalid status update.')}`);
  }

  await db.user.update({ where: { id: userId }, data: { status } });
  // Deactivating a user should kick their sessions — SSO proves who they are,
  // but HQ decides whether they're allowed in.
  if (status === 'INACTIVE') {
    await revokeAllSessionsForUser(userId);
  }
  revalidatePath('/users');
  return redirect(`/users?success=${encode('Status updated.')}`);
}
