import { requireAuth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const principal = await requireAuth();
  return <AppShell principal={principal}>{children}</AppShell>;
}
