import { db } from '@hq/db';
import { createHash, randomBytes } from 'crypto';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreateSessionOptions {
  ipAddress?: string | null;
  userAgent?: string | null;
  ttlMs?: number;
}

/**
 * Create a new session row and return the RAW token.
 * Only the hash is persisted — the raw token is shown to the client once.
 */
export async function createSession(
  userId: string,
  opts: CreateSessionOptions = {},
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const ttl = opts.ttlMs ?? SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);

  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });

  return token;
}

/** Look up the user for a raw session token. Returns null when expired, revoked, or unknown. */
export async function getSessionUser(token: string) {
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.user.status !== 'ACTIVE') return null;
  if (session.user.deletedAt) return null;
  return session.user;
}

/** Validate and return the session + user together. */
export async function validateSession(token: string) {
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.user.status !== 'ACTIVE') return null;
  if (session.user.deletedAt) return null;
  return session;
}

/** Soft-revoke a session (preserves row for audit). */
export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Legacy alias — soft-revoke instead of deleting. */
export async function deleteSession(token: string): Promise<void> {
  return revokeSession(token);
}

/** Revoke every session for a user (e.g. on password change or account suspension). */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export { hashToken };
