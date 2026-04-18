import path from 'node:path';
import type { StorageAdapter } from './adapter.js';
import { LocalStorageAdapter } from './local.js';
import { S3StorageAdapter } from './s3.js';

/**
 * Creates a storage adapter from environment variables.
 *
 * Driver selection: `STORAGE_DRIVER=local|s3` (default: "local").
 *
 * Local driver env:
 *   STORAGE_LOCAL_ROOT      — directory on disk (default: ".hq-storage" in cwd)
 *   STORAGE_PUBLIC_URL      — optional public base URL if the dir is served statically
 *
 * S3 driver env:
 *   STORAGE_BUCKET          — required
 *   STORAGE_ACCESS_KEY      — required
 *   STORAGE_SECRET_KEY      — required
 *   STORAGE_REGION          — default "auto" (works for R2)
 *   STORAGE_ENDPOINT        — optional custom endpoint for R2/MinIO
 *   STORAGE_PUBLIC_URL      — optional public base URL for a public bucket
 */
export function createStorageAdapter(): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();

  if (driver === 'local') {
    return new LocalStorageAdapter({
      root: process.env.STORAGE_LOCAL_ROOT ?? path.join(process.cwd(), '.hq-storage'),
      publicBaseUrl: process.env.STORAGE_PUBLIC_URL,
    });
  }

  if (driver === 's3') {
    const bucket = process.env.STORAGE_BUCKET;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.STORAGE_SECRET_KEY;

    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY.',
      );
    }

    return new S3StorageAdapter({
      bucket,
      accessKeyId,
      secretAccessKey,
      region: process.env.STORAGE_REGION ?? 'auto',
      endpoint: process.env.STORAGE_ENDPOINT,
      publicBaseUrl: process.env.STORAGE_PUBLIC_URL,
    });
  }

  throw new Error(`Unknown STORAGE_DRIVER: ${driver}. Use "local" or "s3".`);
}

let _adapter: StorageAdapter | null = null;

/** Returns a singleton storage adapter. */
export function getStorageAdapter(): StorageAdapter {
  if (!_adapter) _adapter = createStorageAdapter();
  return _adapter;
}

/** For tests: replace the singleton adapter. */
export function setStorageAdapterForTests(adapter: StorageAdapter | null): void {
  _adapter = adapter;
}
