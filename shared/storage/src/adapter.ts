import type { Readable } from 'node:stream';

/**
 * Bytes the adapter can accept or return for small files. `Readable` is used
 * for streaming large payloads; all adapters must accept both.
 */
export type StorageBytes = Buffer | Uint8Array;

export interface WriteOptions {
  mime?: string;
  /** Optional SHA-256 hex — if set, adapter may verify on write. */
  checksum?: string;
}

export interface StorageAdapter {
  /**
   * Identifier used by the factory and diagnostics. `"local"`, `"s3"`, …
   */
  readonly driver: string;

  /**
   * Whether this adapter can mint presigned URLs for direct browser I/O.
   * Local driver returns false → clients must go through the API upload/
   * download routes. S3-style drivers return true.
   */
  supportsPresignedUrls(): boolean;

  /**
   * Generate a presigned PUT URL for direct browser upload. Throws if
   * `supportsPresignedUrls()` is false.
   */
  presignedPut(key: string, mimeType: string, maxBytes: number, expiresInSeconds: number): Promise<string>;

  /**
   * Generate a presigned GET URL for time-limited download access. Throws if
   * `supportsPresignedUrls()` is false.
   */
  presignedGet(key: string, expiresInSeconds: number): Promise<string>;

  /** Server-side write — used for small uploads routed through the API. */
  write(key: string, data: StorageBytes | Readable, opts?: WriteOptions): Promise<void>;

  /** Server-side read as a buffer. Use `readStream` for large files. */
  readBuffer(key: string): Promise<Buffer>;

  /** Server-side read as a Node Readable stream. */
  readStream(key: string): Promise<Readable>;

  /** Delete the underlying object. Idempotent: missing keys do not throw. */
  delete(key: string): Promise<void>;

  /**
   * Returns a public URL if the bucket is configured as public, otherwise null.
   * When null, always use presignedGet for access.
   */
  publicUrl(key: string): string | null;
}
