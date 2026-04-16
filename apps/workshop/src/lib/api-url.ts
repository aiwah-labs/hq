/**
 * Returns the internal shared secret for API requests.
 * Client components use the NEXT_PUBLIC_ variant (baked in at build time).
 * Server components / route handlers use INTERNAL_APP_SHARED_SECRET directly.
 */
export function getInternalSecret(): string {
  return (
    process.env.NEXT_PUBLIC_INTERNAL_SHARED_SECRET ??
    process.env.INTERNAL_APP_SHARED_SECRET ??
    'local-internal-secret'
  );
}

/**
 * Returns the API base URL for client-side use.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // If NEXT_PUBLIC_API_BASE_URL is baked in and valid, use it
    if (process.env.NEXT_PUBLIC_API_BASE_URL && process.env.NEXT_PUBLIC_API_BASE_URL !== 'http://localhost:3003') {
      return process.env.NEXT_PUBLIC_API_BASE_URL;
    }
    // Fallback: derive from current window location
    const host = window.location.hostname;
    // If we're on a deployed server (e.g. your-server-ip on 4002), the API is on 4003
    if (window.location.port === '4002') return `http://${host}:4003`;
    // If dev server (3002), API is 3003
    if (window.location.port === '3002') return `http://${host}:3003`;
    
    // Prod domains: api.aiwahlabs.com
    if (host.includes('aiwahlabs.com')) return 'https://api.aiwahlabs.com';

    return `http://${host}:3003`;
  }
  return process.env.API_BASE_URL ?? 'http://localhost:3003';
}
