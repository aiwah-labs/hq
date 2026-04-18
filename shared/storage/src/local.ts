import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { StorageAdapter, StorageBytes, WriteOptions } from './adapter.js';

export interface LocalStorageAdapterConfig {
  /** Root directory on disk where all files are stored. */
  root: string;
  /** Public base URL that maps to `root` (when the directory is served statically). */
  publicBaseUrl?: string;
}

/**
 * Filesystem-backed storage for dev and self-hosted deployments.
 *
 * Clients cannot upload directly — `supportsPresignedUrls()` returns false, so
 * the API routes stream bytes through `write()` / `readStream()`. Production
 * deployments on S3/R2/MinIO get direct browser uploads via the S3 adapter.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly driver = 'local';
  private root: string;
  private publicBaseUrl: string | null;

  constructor(config: LocalStorageAdapterConfig) {
    this.root = path.resolve(config.root);
    this.publicBaseUrl = config.publicBaseUrl ?? null;
  }

  supportsPresignedUrls(): boolean {
    return false;
  }

  async presignedPut(): Promise<string> {
    throw new Error('Local storage does not support presigned URLs. Upload through the API.');
  }

  async presignedGet(): Promise<string> {
    throw new Error('Local storage does not support presigned URLs. Download through the API.');
  }

  async write(key: string, data: StorageBytes | Readable, _opts?: WriteOptions): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    if (data instanceof Readable) {
      await pipeline(data, createWriteStream(full));
    } else {
      await writeFile(full, data);
    }
  }

  async readBuffer(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async readStream(key: string): Promise<Readable> {
    const full = this.resolve(key);
    // Surface missing files as a clear error (fs createReadStream would
    // emit 'error' asynchronously on first read otherwise).
    await stat(full);
    return createReadStream(full);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  publicUrl(key: string): string | null {
    if (!this.publicBaseUrl) return null;
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${encodeURI(key)}`;
  }

  private resolve(key: string): string {
    // Keys must be relative — reject anything that tries to escape the root.
    const normalized = path.posix.normalize(key).replace(/^\/+/, '');
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const full = path.resolve(this.root, normalized);
    if (!full.startsWith(this.root + path.sep) && full !== this.root) {
      throw new Error(`Storage key escapes root: ${key}`);
    }
    return full;
  }
}
