// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import type { AgentPrincipal, AuthPrincipal, BotPrincipal, BotScope, UserPrincipal } from './types';

export function isUserPrincipal(principal: AuthPrincipal): principal is UserPrincipal {
  return principal.kind === 'user';
}

export function assertUserPrincipal(principal: AuthPrincipal): UserPrincipal {
  if (!isUserPrincipal(principal)) {
    throw new Error('Forbidden: endpoint requires a user principal.');
  }

  return principal;
}

export function isBotPrincipal(principal: AuthPrincipal): principal is BotPrincipal {
  return principal.kind === 'bot';
}

export function assertBotPrincipal(principal: AuthPrincipal): BotPrincipal {
  if (!isBotPrincipal(principal)) {
    throw new Error('Forbidden: endpoint requires a bot principal.');
  }

  return principal;
}

export function isAgentPrincipal(principal: AuthPrincipal): principal is AgentPrincipal {
  return principal.kind === 'agent';
}

export function hasScope(principal: AuthPrincipal, scope: BotScope): boolean {
  return principal.scopes.includes(scope);
}

export function assertScope(principal: AuthPrincipal, scope: BotScope): void {
  if (!hasScope(principal, scope)) {
    throw new Error(`Forbidden: missing scope '${scope}'.`);
  }
}
