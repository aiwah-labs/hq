import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptCredentials, decryptCredentials, isEncryptionConfigured } from '../encrypt.js';

const genKey = () => randomBytes(32).toString('base64');

describe('encrypt', () => {
  const originalKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  const originalPrev = process.env.INTEGRATION_ENCRYPTION_KEY_PREV;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = originalKey;
    if (originalPrev === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY_PREV;
    else process.env.INTEGRATION_ENCRYPTION_KEY_PREV = originalPrev;
  });

  it('roundtrips credentials with a configured key', () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = genKey();
    const input = { apiKey: 'sk_live_abc', scope: 'read' };
    const envelope = encryptCredentials(input);
    const parsed = JSON.parse(envelope);
    expect(parsed.alg).toBe('aes-256-gcm');
    expect(parsed.ct).not.toContain('sk_live_abc'); // actually encrypted
    const back = decryptCredentials<typeof input>(envelope);
    expect(back).toEqual(input);
  });

  it('falls back to plaintext envelope when no key is set', () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    const input = { token: 'plain' };
    const envelope = encryptCredentials(input);
    const parsed = JSON.parse(envelope);
    expect(parsed.alg).toBe('plaintext');
    expect(decryptCredentials<typeof input>(envelope)).toEqual(input);
  });

  it('rejects invalid-length keys at encrypt time', () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptCredentials({ x: 1 })).toThrow(/must decode to 32 bytes/);
  });

  it('fails closed when ciphertext is tampered', () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = genKey();
    const envelope = encryptCredentials({ secret: 'xyz' });
    const parsed = JSON.parse(envelope);
    const tampered = Buffer.from(parsed.ct, 'base64');
    tampered[0] ^= 0xff;
    parsed.ct = tampered.toString('base64');
    expect(() => decryptCredentials(JSON.stringify(parsed))).toThrow(/Failed to decrypt/);
  });

  it('falls back to previous key during rotation', () => {
    const oldKey = genKey();
    const newKey = genKey();
    process.env.INTEGRATION_ENCRYPTION_KEY = oldKey;
    const envelope = encryptCredentials({ secret: 'rotated' });
    process.env.INTEGRATION_ENCRYPTION_KEY = newKey;
    process.env.INTEGRATION_ENCRYPTION_KEY_PREV = oldKey;
    expect(decryptCredentials<{ secret: string }>(envelope)).toEqual({ secret: 'rotated' });
  });

  it('reports whether encryption is configured', () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    process.env.INTEGRATION_ENCRYPTION_KEY = genKey();
    expect(isEncryptionConfigured()).toBe(true);
  });
});
