import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServiceContext } from '@hq/services';
import { completeOAuthFlow, OAuthStateError, OAuthTokenError } from '@hq/integrations';
import { requireAuth } from '@/lib/auth';

/**
 * OAuth callback for all integrations. The provider redirects the user here
 * with `?state=...&code=...`; we complete the flow and redirect to the
 * integrations list with a success/error toast.
 */
interface Props {
  searchParams: Promise<{ state?: string; code?: string; error?: string; error_description?: string }>;
}

export default async function OAuthCallback({ searchParams }: Props) {
  const principal = await requireAuth();
  const { state, code, error, error_description } = await searchParams;

  if (error) {
    const msg = error_description ?? error;
    redirect(`/settings/integrations?error=${encodeURIComponent(`OAuth error: ${msg}`)}`);
  }
  if (!state || !code) {
    redirect(`/settings/integrations?error=${encodeURIComponent('OAuth callback missing state or code.')}`);
  }

  const reqHeaders = await headers();
  const host = reqHeaders.get('host');
  const proto = reqHeaders.get('x-forwarded-proto') ?? 'http';
  const redirectUri = `${proto}://${host}/settings/integrations/oauth/callback`;

  const ctx = createServiceContext(principal);
  try {
    await completeOAuthFlow(ctx, { state, code, redirectUri });
  } catch (err) {
    const msg =
      err instanceof OAuthStateError
        ? err.message
        : err instanceof OAuthTokenError
          ? `Provider rejected token request: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'OAuth flow failed.';
    redirect(`/settings/integrations?error=${encodeURIComponent(msg)}`);
  }

  redirect('/settings/integrations?success=Integration%20connected.');
}
