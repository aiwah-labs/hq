import Image from 'next/image';
import Link from 'next/link';
import { Alert, Card, CardBody, CardHeader, Field, Input, Label, SubmitButton } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { loginAction } from './actions';

interface Props {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const current = await getCurrentUser();
  if (current) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
        <Card className="w-full">
          <CardBody className="space-y-4 text-center">
            <p className="font-display text-[24px] font-semibold leading-tight tracking-tight">Already signed in</p>
            <Link
              href="/workshop"
              className="inline-flex h-8 items-center justify-center rounded-[6px] border border-brand-teal bg-brand-teal px-3 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-colors hover:border-brand-teal-dark hover:bg-brand-teal-dark"
            >
              Open Workshop
            </Link>
          </CardBody>
        </Card>
      </main>
    );
  }

  const { error } = await searchParams;

  return (
    <main className="login-shell mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <Card className="w-full border-divider/80">
        <CardHeader className="border-b-0 pb-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-brand-teal/10 ring-1 ring-brand-teal/25">
              <Image src="/assets/brand/logo-icon.svg" alt="Aiwah logo" width={21} height={21} priority />
            </div>
            <p className="font-wordmark text-[14px] font-light uppercase tracking-[0.12em] text-[var(--app-fg)]">
              WORKSHOP
            </p>
          </div>

          <div className="mt-4">
            <h1 className="font-display text-[28px] font-semibold leading-[1.1] tracking-tight">Sign in to Workshop</h1>
            <p className="mt-1.5 text-[13px] text-muted">Use your workspace credentials to continue.</p>
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <form action={loginAction} className="space-y-3.5">
            <Field>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>

            <Field>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>

            <SubmitButton className="w-full" size="md">
              Continue
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
