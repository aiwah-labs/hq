import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';

export default async function WorkshopPage() {
  await requirePermission(ROUTE_PERMISSIONS.workshop);
  redirect('/dashboard');
}
