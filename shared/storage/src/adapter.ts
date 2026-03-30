export interface StorageAdapter {
  /**
   * Generate a presigned PUT URL for direct browser upload.
   * The client uploads directly to S3/R2; no binary data passes through the API.
   */
  presignedPut(key: string, mimeType: string, maxBytes: number, expiresInSeconds: number): Promise<string>;

  /**
   * Generate a presigned GET URL for time-limited download access.
   */
  presignedGet(key: string, expiresInSeconds: number): Promise<string>;

  /**
   * Delete an object.
   */
  delete(key: string): Promise<void>;

  /**
   * Returns a public URL if the bucket is configured as public, otherwise null.
   * When null, always use presignedGet for access.
   */
  publicUrl(key: string): string | null;
}
