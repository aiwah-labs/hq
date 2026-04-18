import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import type { StorageAdapter, StorageBytes, WriteOptions } from './adapter.js';

export interface S3StorageAdapterConfig {
  endpoint?: string;    // for R2/MinIO: https://account.r2.cloudflarestorage.com
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string; // if set, publicUrl() returns this prefix + key
}

export class S3StorageAdapter implements StorageAdapter {
  readonly driver = 's3';
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string | null;

  constructor(config: S3StorageAdapterConfig) {
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl ?? null;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: !!config.endpoint, // required for MinIO / non-AWS endpoints
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  supportsPresignedUrls(): boolean {
    return true;
  }

  async presignedPut(key: string, mimeType: string, maxBytes: number, expiresInSeconds: number): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: maxBytes,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
  }

  async presignedGet(key: string, expiresInSeconds: number): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
  }

  async write(key: string, data: StorageBytes | Readable, opts?: WriteOptions): Promise<void> {
    const body = data instanceof Readable ? data : Buffer.from(data as Uint8Array);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: opts?.mime,
      ChecksumSHA256: opts?.checksum ? Buffer.from(opts.checksum, 'hex').toString('base64') : undefined,
    }));
  }

  async readBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = res.Body as Readable | undefined;
    if (!stream) throw new Error(`No body returned for key ${key}`);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async readStream(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = res.Body as Readable | undefined;
    if (!stream) throw new Error(`No body returned for key ${key}`);
    return stream;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrl(key: string): string | null {
    if (!this.publicBaseUrl) return null;
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
}
