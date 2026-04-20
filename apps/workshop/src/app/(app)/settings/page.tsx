import Link from 'next/link';
import { cookies } from 'next/headers';
import { THEME_COOKIE_NAME } from '@hq/auth/cookies';
import { Alert, Card, CardBody, CardHeader, SubmitButton } from '@/components/ui';
import { can, requirePermission } from '@/lib/auth';
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/access';
import { AppearanceToggle } from '@/components/settings/AppearanceToggle';
import { getThemePreference } from '@/lib/theme';
import { logoutAction } from '@/app/(auth)/login/actions';
import { setThemePreferenceAction } from './actions';

interface Props {
  searchParams: Promise<{
    success?: string;
  }>;
}

export default async function SettingsPage({ searchParams }: Props) {
  const principal = await requirePermission(ROUTE_PERMISSIONS.settings);
  const cookieStore = await cookies();
  const current = getThemePreference(cookieStore.get(THEME_COOKIE_NAME)?.value);
  const { success } = await searchParams;
  const showIntegrations = can(principal, PERMISSIONS.integrationsView);

  return (
    <main className="max-w-[760px] space-y-3">
      {success ? <Alert tone="success">{success}</Alert> : null}

      <Card>
        <CardHeader>
          <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">Settings</h1>
        </CardHeader>
        <CardBody className="space-y-5 pt-1">
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Appearance</h2>
            <AppearanceToggle current={current} action={setThemePreferenceAction} />
          </section>

          {showIntegrations ? (
            <section className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Integrations</h2>
              <p className="text-[12px] text-[#62666d]">
                Connect third-party services (Shopify, GitHub, Slack, …) so actions and agents can
                use them.
              </p>
              <Link
                href="/settings/integrations"
                className="inline-flex items-center text-[13px] text-[#009E85] underline-offset-2 hover:underline"
                data-testid="settings-integrations-link"
              >
                Manage integrations →
              </Link>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">Account</h2>
            <form action={logoutAction}>
              <SubmitButton variant="secondary" size="sm">
                Log out
              </SubmitButton>
            </form>
          </section>
        </CardBody>
      </Card>
    </main>
  );
}
