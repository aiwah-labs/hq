import type { StorageAdapter } from './adapter.js';
import { S3StorageAdapter } from './s3.js';

/**
 * Creates a storage adapter from environment variables.
 *
 * Required env vars:
 *   STORAGE_BUCKET       — S3/R2/MinIO bucket name
 *   STORAGE_ACCESS_KEY   — access key ID
 *   STORAGE_SECRET_KEY   — secret access key
 *   STORAGE_REGION       — region (default: "auto" for Cloudflare R2)
 *
 * Optional:
 *   STORAGE_ENDPOINT     — custom endpoint URL (for R2/MinIO)
 *   STORAGE_PUBLIC_URL   — public base URL if bucket is public
 */
export function createStorageAdapter(): StorageAdapter {
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.STORAGE_SECRET_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Storage not configured. Set STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY.'
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

let _adapter: StorageAdapter | null = null;

/**
 * Returns a singleton storage adapter. Throws if env is not configured.
 */
export function getStorageAdapter(): StorageAdapter {
  if (!_adapter) {
    _adapter = createStorageAdapter();
  }
  return _adapter;
}
