// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import type { FastifyRequest } from 'fastify';
import { resolveAuth } from '@hq/auth/middleware';
import { assertBotPrincipal, assertScope, assertUserPrincipal, isBotPrincipal, isUserPrincipal } from '@hq/auth/principals';
import type { AuthPrincipal, BotPrincipal, BotScope, UserPrincipal } from '@hq/auth/types';
import { ApiError } from './errors';

function getIpAddress(request: FastifyRequest): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }

  return request.ip ?? null;
}

function readHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0]?.trim();
    return first && first.length > 0 ? first : null;
  }

  return null;
}

function getExpectedInternalSecret(): string | null {
  const configured = process.env.INTERNAL_APP_SHARED_SECRET?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return 'local-internal-secret';
}

function requireInternalSecretForUserPrincipal(request: FastifyRequest): void {
  const expected = getExpectedInternalSecret();
  if (!expected) {
    throw new ApiError(500, 'INTERNAL_MISCONFIG', 'INTERNAL_APP_SHARED_SECRET is required in production.');
  }

  // Accept the secret from header OR query param (EventSource can't set headers)
  const fromHeader = readHeaderValue(request.headers['x-internal-shared-secret']);
  const fromQuery = (request.query as Record<string, string>)?.['_secret'] ?? null;
  const provided = fromHeader ?? fromQuery;
  if (!provided || provided !== expected) {
    throw new ApiError(403, 'FORBIDDEN', 'Missing or invalid internal shared secret.');
  }
}

export async function requireAuth(
  request: FastifyRequest,
  options?: {
    botScope?: BotScope;
  }
): Promise<AuthPrincipal> {
  const context = await resolveAuth({
    cookieHeader: request.headers.cookie ?? null,
    authorizationHeader: request.headers.authorization ?? null,
    ipAddress: getIpAddress(request),
    userAgent: request.headers['user-agent'] ?? null,
  });

  if (context.kind === 'none') {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }

  const principal = context.principal;

  if (isUserPrincipal(principal)) {
    requireInternalSecretForUserPrincipal(request);
  }

  if (options?.botScope && isBotPrincipal(principal)) {
    try {
      assertScope(principal, options.botScope);
    } catch {
      throw new ApiError(403, 'FORBIDDEN', `Missing required bot scope '${options.botScope}'.`);
    }
  }

  return principal;
}

export async function requireUser(request: FastifyRequest): Promise<UserPrincipal> {
  const principal = await requireAuth(request);

  try {
    return assertUserPrincipal(principal);
  } catch {
    throw new ApiError(403, 'FORBIDDEN', 'User session required for this operation.');
  }
}

export async function requireBot(request: FastifyRequest, scope?: BotScope): Promise<BotPrincipal> {
  const principal = await requireAuth(request, { botScope: scope });

  try {
    return assertBotPrincipal(principal);
  } catch {
    throw new ApiError(403, 'FORBIDDEN', 'Bot principal required for this operation.');
  }
}
