'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { UserRole, UserStatus } from '@hq/db';
import { createServiceContext, createUser, updateUserRole, setUserStatus } from '@hq/services';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/access';

function toError(message: unknown): string {
  if (message instanceof Error) {
    return message.message;
  }

  return 'Action failed.';
}

export async function createUserAction(prevState: unknown, formData: FormData): Promise<{ success?: boolean; error?: string }> {
  const principal = await requirePermission(PERMISSIONS.usersManage);
  const context = createServiceContext(principal);

  try {
    await createUser(context, {
      email: String(formData.get('email') ?? ''),
      name: String(formData.get('name') ?? ''),
      password: String(formData.get('password') ?? ''),
      role: String(formData.get('role') ?? UserRole.MEMBER),
    });
    
    revalidatePath('/users');
    return { success: true };
  } catch (error) {
    return { success: false, error: toError(error) };
  }
}

export async function updateUserRoleAction(formData: FormData): Promise<never> {
  const principal = await requirePermission(PERMISSIONS.usersManage);
  const context = createServiceContext(principal);

  try {
    await updateUserRole(context, {
      userId: String(formData.get('userId') ?? ''),
      role: String(formData.get('role') ?? UserRole.MEMBER),
    });
  } catch (error) {
    return redirect(`/users?error=${encodeURIComponent(toError(error))}`);
  }

  revalidatePath('/users');
  return redirect('/users?success=Role%20updated');
}

export async function setUserStatusAction(formData: FormData): Promise<never> {
  const principal = await requirePermission(PERMISSIONS.usersManage);
  const context = createServiceContext(principal);

  try {
    await setUserStatus(context, {
      userId: String(formData.get('userId') ?? ''),
      status: String(formData.get('status') ?? UserStatus.ACTIVE),
    });
  } catch (error) {
    return redirect(`/users?error=${encodeURIComponent(toError(error))}`);
  }

  revalidatePath('/users');
  return redirect('/users?success=Status%20updated');
}
