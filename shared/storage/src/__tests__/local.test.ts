import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { LocalStorageAdapter } from '../local.js';

let root: string;
let adapter: LocalStorageAdapter;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hq-storage-local-'));
  adapter = new LocalStorageAdapter({ root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('LocalStorageAdapter', () => {
  it('round-trips a buffer write and readBuffer', async () => {
    await adapter.write('files/hello.txt', Buffer.from('hello world'));
    const out = await adapter.readBuffer('files/hello.txt');
    expect(out.toString('utf8')).toBe('hello world');
  });

  it('writes via a Readable stream', async () => {
    const stream = Readable.from([Buffer.from('abc'), Buffer.from('def')]);
    await adapter.write('files/stream.bin', stream);
    const out = await adapter.readBuffer('files/stream.bin');
    expect(out.toString('utf8')).toBe('abcdef');
  });

  it('readStream yields the file contents', async () => {
    await adapter.write('files/read.txt', Buffer.from('streamed'));
    const stream = await adapter.readStream('files/read.txt');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('utf8')).toBe('streamed');
  });

  it('readStream rejects for a missing key', async () => {
    await expect(adapter.readStream('files/missing.txt')).rejects.toThrow();
  });

  it('creates intermediate directories on write', async () => {
    await adapter.write('a/b/c/deep.txt', Buffer.from('deep'));
    const full = path.join(root, 'a/b/c/deep.txt');
    const s = await stat(full);
    expect(s.isFile()).toBe(true);
  });

  it('delete removes the underlying file', async () => {
    await adapter.write('files/bye.txt', Buffer.from('x'));
    await adapter.delete('files/bye.txt');
    await expect(stat(path.join(root, 'files/bye.txt'))).rejects.toThrow();
  });

  it('delete is idempotent for missing keys', async () => {
    await expect(adapter.delete('files/never.txt')).resolves.toBeUndefined();
  });

  it('rejects keys that traverse above the root', async () => {
    await expect(adapter.write('../escape.txt', Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
  });

  it('strips leading slashes so absolute-style keys stay inside the root', async () => {
    await adapter.write('/files/abs.txt', Buffer.from('x'));
    const s = await stat(path.join(root, 'files/abs.txt'));
    expect(s.isFile()).toBe(true);
  });

  it('supportsPresignedUrls returns false', () => {
    expect(adapter.supportsPresignedUrls()).toBe(false);
  });

  it('presignedPut throws', async () => {
    await expect(adapter.presignedPut('k', 'text/plain', 10, 60)).rejects.toThrow(/presigned/i);
  });

  it('presignedGet throws', async () => {
    await expect(adapter.presignedGet('k', 60)).rejects.toThrow(/presigned/i);
  });

  it('publicUrl returns null without a publicBaseUrl', () => {
    expect(adapter.publicUrl('files/x.txt')).toBeNull();
  });

  it('publicUrl joins publicBaseUrl with the key', () => {
    const pub = new LocalStorageAdapter({ root, publicBaseUrl: 'https://cdn.example.com/assets/' });
    expect(pub.publicUrl('files/a b.txt')).toBe('https://cdn.example.com/assets/files/a%20b.txt');
  });

  it('driver identifier is "local"', () => {
    expect(adapter.driver).toBe('local');
  });

  it('preserves file bytes on round-trip', async () => {
    const bytes = Buffer.from([0, 1, 2, 3, 255, 254]);
    await adapter.write('files/binary.bin', bytes);
    const onDisk = await readFile(path.join(root, 'files/binary.bin'));
    expect(onDisk.equals(bytes)).toBe(true);
  });
});
