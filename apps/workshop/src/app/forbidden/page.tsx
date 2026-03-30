import Link from 'next/link';
import { Button, Card, CardBody, CardHeader } from '@/components/ui';
import { requireAuth } from '@/lib/auth';

export default async function ForbiddenPage() {
  await requireAuth();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <h1 className="font-display text-[24px] font-semibold tracking-tight">403 Access denied</h1>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-[13px] text-muted">You do not have permission to view this page.</p>
          <Link href="/workshop" className="inline-block">
            <Button size="sm">Go to Workshop</Button>
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}
