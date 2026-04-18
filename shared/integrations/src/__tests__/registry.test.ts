import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerIntegration,
  getIntegration,
  listIntegrations,
  resetIntegrationRegistry,
} from '../registry.js';

beforeEach(() => resetIntegrationRegistry());

const staticDef = {
  key: 'demo',
  name: 'Demo',
  description: 'Test integration.',
  scope: 'org' as const,
  multiplicity: 'single' as const,
  auth: {
    kind: 'static' as const,
    fields: [{ name: 'apiKey', label: 'API key', type: 'password' as const, required: true }],
  },
};

describe('registry', () => {
  it('registers and retrieves an integration', () => {
    registerIntegration(staticDef);
    expect(getIntegration('demo')).toMatchObject({ key: 'demo', name: 'Demo' });
    expect(listIntegrations()).toHaveLength(1);
  });

  it('rejects duplicate keys', () => {
    registerIntegration(staticDef);
    expect(() => registerIntegration(staticDef)).toThrow(/already registered/);
  });

  it('validates key format', () => {
    expect(() => registerIntegration({ ...staticDef, key: 'Bad-Key' })).toThrow(/invalid/);
    expect(() => registerIntegration({ ...staticDef, key: '1starts-with-digit' })).toThrow(/invalid/);
  });

  it('rejects user-scope + multiple', () => {
    expect(() =>
      registerIntegration({ ...staticDef, scope: 'user', multiplicity: 'multiple' }),
    ).toThrow(/implicitly single-instance/);
  });

  it('requires at least one field for static auth', () => {
    expect(() =>
      registerIntegration({
        ...staticDef,
        auth: { kind: 'static', fields: [] },
      }),
    ).toThrow(/at least one field/);
  });

  it('rejects duplicate field names', () => {
    expect(() =>
      registerIntegration({
        ...staticDef,
        auth: {
          kind: 'static',
          fields: [
            { name: 'apiKey', label: 'A', type: 'password' },
            { name: 'apiKey', label: 'B', type: 'password' },
          ],
        },
      }),
    ).toThrow(/duplicate credential field/);
  });

  it('requires OAuth client env vars', () => {
    expect(() =>
      registerIntegration({
        key: 'oauth-demo',
        name: 'OAuth Demo',
        description: 'x',
        scope: 'user',
        multiplicity: 'single',
        auth: {
          kind: 'oauth',
          authorizeUrl: 'https://example.com/authorize',
          tokenUrl: 'https://example.com/token',
          scopes: [],
          clientIdEnv: '',
          clientSecretEnv: 'DEMO_SECRET',
        },
      }),
    ).toThrow(/clientIdEnv is required/);
  });

  it('resetIntegrationRegistry wipes all entries', () => {
    registerIntegration(staticDef);
    expect(listIntegrations()).toHaveLength(1);
    resetIntegrationRegistry();
    expect(listIntegrations()).toHaveLength(0);
  });
});
