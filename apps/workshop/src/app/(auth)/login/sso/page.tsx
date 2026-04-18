import Link from 'next/link';
import { readOidcEnv, describeOidcProvider } from '@hq/auth/providers';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function SsoLoginPage({ searchParams }: Props) {
  const env = readOidcEnv();
  const provider = describeOidcProvider(env);
  const { error } = await searchParams;

  if (!provider.enabled) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
        <Card className="w-full">
          <CardHeader className="border-b-0 pb-0">
            <h1 className="font-display text-[24px] font-semibold leading-tight">SSO is not configured</h1>
            <p className="mt-1 text-[13px] text-muted">
              Set <code>AUTH_OIDC_ENABLED=true</code> plus the matching issuer, client ID, client secret, and redirect
              URI to enable SSO. See <code>docs/sso.md</code>.
            </p>
          </CardHeader>
          <CardBody>
            <Link
              href="/login"
              className="inline-flex h-8 items-center rounded-[6px] border border-divider px-3 text-[13px] font-medium"
            >
              Back to email + password sign-in
            </Link>
          </CardBody>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader className="border-b-0 pb-0">
          <h1 className="font-display text-[24px] font-semibold leading-tight">Continue with SSO</h1>
          <p className="mt-1 text-[13px] text-muted">
            You'll be redirected to your company identity provider to sign in.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <a
            href="/api/auth/oidc/start"
            className="inline-flex h-9 w-full items-center justify-center rounded-[6px] border border-brand-teal bg-brand-teal px-3 text-[13px] font-medium text-white hover:bg-brand-teal-dark"
          >
            {provider.label}
          </a>
          <Link
            href="/login"
            className="block text-center text-[12px] text-muted hover:underline"
          >
            Or sign in with email + password
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}
