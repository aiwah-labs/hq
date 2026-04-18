/**
 * Integration registry — mirrors the object/action/agent registries.
 *
 * Builders add an integration by calling `registerIntegration(def)` at
 * import time (typically from a module index file that runs during app
 * startup). `listIntegrations()` returns everything known to the registry
 * in insertion order; the Workshop UI reads from this to render the
 * `/settings/integrations` page.
 */
import type { IntegrationDefinition } from './types.js';

const registry = new Map<string, IntegrationDefinition>();

export function registerIntegration(def: IntegrationDefinition): void {
  validateDefinition(def);
  if (registry.has(def.key)) {
    throw new Error(`Integration "${def.key}" is already registered.`);
  }
  registry.set(def.key, def);
}

export function getIntegration(key: string): IntegrationDefinition | undefined {
  return registry.get(key);
}

export function listIntegrations(): IntegrationDefinition[] {
  return [...registry.values()];
}

/** Clear the registry. Test-only helper. */
export function resetIntegrationRegistry(): void {
  registry.clear();
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateDefinition(def: IntegrationDefinition): void {
  if (!def.key || !/^[a-z][a-z0-9._-]*$/.test(def.key)) {
    throw new Error(
      `Integration key "${def.key}" is invalid. Use lowercase letters, digits, '.', '-', '_' (must start with a letter).`,
    );
  }
  if (!def.name) throw new Error(`Integration "${def.key}" is missing a name.`);
  if (!def.description) throw new Error(`Integration "${def.key}" is missing a description.`);
  if (def.scope !== 'org' && def.scope !== 'user') {
    throw new Error(`Integration "${def.key}" has invalid scope "${def.scope}".`);
  }
  if (def.multiplicity !== 'single' && def.multiplicity !== 'multiple') {
    throw new Error(`Integration "${def.key}" has invalid multiplicity "${def.multiplicity}".`);
  }
  if (def.scope === 'user' && def.multiplicity === 'multiple') {
    throw new Error(
      `Integration "${def.key}": user-scoped integrations are implicitly single-instance per user. Set multiplicity: "single".`,
    );
  }
  if (def.auth.kind === 'static') {
    if (!def.auth.fields || def.auth.fields.length === 0) {
      throw new Error(`Integration "${def.key}" static auth must declare at least one field.`);
    }
    const seen = new Set<string>();
    for (const field of def.auth.fields) {
      if (seen.has(field.name)) {
        throw new Error(`Integration "${def.key}" has duplicate credential field "${field.name}".`);
      }
      seen.add(field.name);
    }
  } else if (def.auth.kind === 'oauth') {
    if (!def.auth.authorizeUrl) throw new Error(`Integration "${def.key}" oauth.authorizeUrl is required.`);
    if (!def.auth.tokenUrl) throw new Error(`Integration "${def.key}" oauth.tokenUrl is required.`);
    if (!def.auth.clientIdEnv) throw new Error(`Integration "${def.key}" oauth.clientIdEnv is required.`);
    if (!def.auth.clientSecretEnv) throw new Error(`Integration "${def.key}" oauth.clientSecretEnv is required.`);
  }
}
