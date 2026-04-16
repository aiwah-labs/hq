import { headers } from 'next/headers';
import { createApiClient } from '@hq/api-client';

function getApiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:3003';
}

export async function getSessionApiClient() {
  const requestHeaders = await headers();

  return createApiClient({
    baseUrl: getApiBaseUrl(),
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
    internalSecret: process.env.INTERNAL_APP_SHARED_SECRET ?? 'local-internal-secret',
  });
}
