'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { dispatchAction } from '@hq/actions';

export async function completeTaskAction(taskId: string, projectId: string) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  await dispatchAction('task.complete', { taskId }, principal);
  revalidatePath(`/projects/${projectId}`);
}

export async function markTaskInProgressAction(taskId: string, projectId: string) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const { db } = await import('@hq/db');
  await db.task.update({ where: { id: taskId }, data: { status: 'IN_PROGRESS' } });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProjectStatusAction(
  projectId: string,
  status: 'PLANNED' | 'ACTIVE' | 'BLOCKED' | 'DONE' | 'CANCELLED',
) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  await dispatchAction('project.updateStatus', { projectId, status }, principal);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
}

export async function createTaskAction(formData: FormData) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const projectId = formData.get('projectId') as string;
  const title = (formData.get('title') as string)?.trim();
  const priority = (formData.get('priority') as string) || 'MEDIUM';
  const dueInDays = formData.get('dueInDays') ? Number(formData.get('dueInDays')) : undefined;

  if (!title || !projectId) return;

  await dispatchAction('task.create', { projectId, title, priority, dueInDays }, principal);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function createProjectAction(formData: FormData) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.workshop);
  const name = (formData.get('name') as string)?.trim();
  const summary = (formData.get('summary') as string)?.trim() || undefined;
  const status = (formData.get('status') as string) || 'PLANNED';
  const priority = (formData.get('priority') as string) || 'MEDIUM';
  const targetInDays = formData.get('targetInDays') ? Number(formData.get('targetInDays')) : undefined;

  if (!name) return;

  const outcome = await dispatchAction(
    'project.create',
    { name, summary, status, priority, targetInDays },
    principal,
  );

  if (outcome.ok && outcome.result) {
    const project = outcome.result as { id: string };
    redirect(`/projects/${project.id}`);
  }

  revalidatePath('/projects');
  redirect('/projects');
}
