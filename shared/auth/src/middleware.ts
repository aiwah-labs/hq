import { BOT_SCOPES, type DbRole, type EffectiveRole, type AuthContext, type UserPrincipal, type BotPrincipal, type PermissionMap, type BotScope } from './types';
import { buildPermissionMap } from './policy';
import { isSuperadminEmail } from './superadmin';
import { validateApiKey } from './api-keys';
import { SESSION_COOKIE_NAME } from './cookies';
import { validateSession } from './sessions';

interface ResolveAuthInput {
  cookieHeader?: string | null;
  authorizationHeader?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) {
    return null;
  }

  const parts = header.split(';');
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey !== name) {
      continue;
    }

    return decodeURIComponent(rest.join('='));
  }

  return null;
}

function buildNoPermissions(): PermissionMap {
  return {
    'workshop.view': false,
    'content.all': false,
    'settings.view': false,
    'users.view': false,
    'users.manage': false,
    'admin.surface': false,
    'bots.view': false,
    'bots.create': false,
    'bots.manage.any': false,
    'messaging.view': false,
  };
}

export function userPrincipalFromData(input: {
  userId: string;
  email: string;
  dbRole: DbRole;
}): UserPrincipal {
  const superadmin = isSuperadminEmail(input.email);
  const effectiveRole: EffectiveRole = superadmin ? 'SUPERADMIN' : input.dbRole;

  return {
    kind: 'user',
    source: 'session',
    userId: input.userId,
    email: input.email,
    dbRole: input.dbRole,
    effectiveRole,
    isSuperadmin: superadmin,
    scopes: [],
    permissions: buildPermissionMap(effectiveRole),
  };
}

function botPrincipalFromData(input: {
  apiKeyId: string;
  botId: string;
  botName: string;
  scopes: BotScope[];
}): BotPrincipal {
  return {
    kind: 'bot',
    source: 'apikey',
    apiKeyId: input.apiKeyId,
    botId: input.botId,
    botName: input.botName,
    scopes: input.scopes,
    permissions: buildNoPermissions(),
  };
}

export async function resolveAuth(input: ResolveAuthInput): Promise<AuthContext> {
  const authHeader = input.authorizationHeader?.trim();

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const key = authHeader.slice(7).trim();
    const apiKey = await validateApiKey(key);
    if (apiKey) {
      return {
        kind: 'authenticated',
        principal: botPrincipalFromData({
          apiKeyId: apiKey.id,
          botId: apiKey.botId,
          botName: apiKey.bot.name,
          scopes: apiKey.bot.scopes.filter((scope): scope is BotScope => BOT_SCOPES.includes(scope as BotScope)),
        }),
      };
    }
  }

  const sessionToken = readCookie(input.cookieHeader, SESSION_COOKIE_NAME);
  if (!sessionToken) return { kind: 'none' };
  const session = await validateSession(sessionToken);

  if (!session) {
    return { kind: 'none' };
  }

  return {
    kind: 'authenticated',
    principal: userPrincipalFromData({
      userId: session.userId,
      email: session.user.email,
      dbRole: session.user.role as DbRole,
    }),
  };
}
