/**
 * Credential encryption for integration connections.
 *
 * Uses AES-256-GCM with a 32-byte key supplied via
 * `INTEGRATION_ENCRYPTION_KEY` (base64-encoded). The ciphertext is stored
 * as a JSON envelope so the format can evolve:
 *
 *   { v: 1, alg: 'aes-256-gcm', iv, tag, ct }   // all base64
 *
 * If the env var is not set, the framework falls back to plaintext storage
 * with a one-time console warning. This keeps local dev friction low while
 * ensuring production deployments are prompted to set the key (surfaced as
 * a diagnostics warning by the health service).
 *
 * Key rotation: set `INTEGRATION_ENCRYPTION_KEY_PREV` to the old key; the
 * decryptor will try the current key first, then the previous key. Re-save
 * connections to migrate them to the new key.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;
const ENVELOPE_VERSION = 1;

interface Envelope {
  v: number;
  alg: string;
  iv: string;
  tag: string;
  ct: string;
}

let warnedAboutPlaintext = false;

function loadKey(envVar: string): Buffer | null {
  const raw = process.env[envVar];
  if (!raw) return null;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `${envVar} must decode to ${KEY_LEN} bytes (got ${buf.length}). Generate with: openssl rand -base64 32`,
    );
  }
  return buf;
}

function currentKey(): Buffer | null {
  return loadKey('INTEGRATION_ENCRYPTION_KEY');
}

function previousKey(): Buffer | null {
  return loadKey('INTEGRATION_ENCRYPTION_KEY_PREV');
}

/**
 * Encrypt a credentials object. Returns a serialized envelope string.
 *
 * When no key is configured, returns a plaintext marker envelope so the
 * caller can still persist and later decrypt. Logs a warning once.
 */
export function encryptCredentials(credentials: unknown): string {
  const key = currentKey();
  const plaintext = JSON.stringify(credentials);

  if (!key) {
    if (!warnedAboutPlaintext) {
      warnedAboutPlaintext = true;
      console.warn(
        '[integrations] INTEGRATION_ENCRYPTION_KEY is not set — credentials will be stored in plaintext. OK for local dev; set the key before deploying to production.',
      );
    }
    return JSON.stringify({ v: 0, alg: 'plaintext', ct: Buffer.from(plaintext, 'utf8').toString('base64') });
  }

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: Envelope = {
    v: ENVELOPE_VERSION,
    alg: ALG,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };
  return JSON.stringify(envelope);
}

/**
 * Decrypt a previously-encrypted credentials envelope. Throws on tampering
 * or key mismatch. Returns the parsed credentials object.
 */
export function decryptCredentials<T = unknown>(serialized: string): T {
  const parsed = JSON.parse(serialized) as { v: number; alg: string; iv?: string; tag?: string; ct: string };

  if (parsed.alg === 'plaintext') {
    return JSON.parse(Buffer.from(parsed.ct, 'base64').toString('utf8')) as T;
  }

  if (parsed.alg !== ALG) {
    throw new Error(`Unsupported credentials envelope algorithm: ${parsed.alg}`);
  }
  if (!parsed.iv || !parsed.tag) {
    throw new Error('Credentials envelope is missing iv/tag.');
  }

  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const ct = Buffer.from(parsed.ct, 'base64');

  const keys = [currentKey(), previousKey()].filter((k): k is Buffer => k !== null);
  if (keys.length === 0) {
    throw new Error(
      'Credentials are encrypted but no decryption key is configured. Set INTEGRATION_ENCRYPTION_KEY.',
    );
  }

  let lastError: unknown;
  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALG, key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
      return JSON.parse(plaintext) as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Failed to decrypt credentials with any configured key: ${String(lastError)}`);
}

/**
 * True if a current encryption key is configured. Used by diagnostics.
 */
export function isEncryptionConfigured(): boolean {
  return currentKey() !== null;
}
