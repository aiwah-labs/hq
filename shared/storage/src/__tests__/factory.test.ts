import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createStorageAdapter,
  getStorageAdapter,
  setStorageAdapterForTests,
} from '../factory.js';
import { LocalStorageAdapter } from '../local.js';
import { S3StorageAdapter } from '../s3.js';

const ENV_KEYS = [
  'STORAGE_DRIVER',
  'STORAGE_LOCAL_ROOT',
  'STORAGE_PUBLIC_URL',
  'STORAGE_BUCKET',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_REGION',
  'STORAGE_ENDPOINT',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  setStorageAdapterForTests(null);
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  setStorageAdapterForTests(null);
});

describe('createStorageAdapter', () => {
  it('defaults to the local driver when STORAGE_DRIVER is unset', () => {
    const adapter = createStorageAdapter();
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    expect(adapter.driver).toBe('local');
  });

  it('returns a LocalStorageAdapter when STORAGE_DRIVER=local', () => {
    process.env.STORAGE_DRIVER = 'local';
    const adapter = createStorageAdapter();
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('accepts case-insensitive driver names', () => {
    process.env.STORAGE_DRIVER = 'LOCAL';
    expect(createStorageAdapter()).toBeInstanceOf(LocalStorageAdapter);
  });

  it('returns an S3StorageAdapter when STORAGE_DRIVER=s3 with all required vars', () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.STORAGE_BUCKET = 'my-bucket';
    process.env.STORAGE_ACCESS_KEY = 'ak';
    process.env.STORAGE_SECRET_KEY = 'sk';
    const adapter = createStorageAdapter();
    expect(adapter).toBeInstanceOf(S3StorageAdapter);
    expect(adapter.driver).toBe('s3');
  });

  it('throws when STORAGE_DRIVER=s3 but required env vars are missing', () => {
    process.env.STORAGE_DRIVER = 's3';
    expect(() => createStorageAdapter()).toThrow(/STORAGE_BUCKET/);
  });

  it('throws when STORAGE_DRIVER=s3 with only bucket set', () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.STORAGE_BUCKET = 'my-bucket';
    expect(() => createStorageAdapter()).toThrow();
  });

  it('throws for an unknown driver', () => {
    process.env.STORAGE_DRIVER = 'gcs';
    expect(() => createStorageAdapter()).toThrow(/Unknown STORAGE_DRIVER/);
  });
});

describe('getStorageAdapter singleton', () => {
  it('returns the same instance across calls', () => {
    const a = getStorageAdapter();
    const b = getStorageAdapter();
    expect(a).toBe(b);
  });

  it('setStorageAdapterForTests replaces the singleton', () => {
    const first = getStorageAdapter();
    setStorageAdapterForTests(null);
    const second = getStorageAdapter();
    expect(second).not.toBe(first);
  });
});
