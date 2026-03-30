import { db } from '@hq/db';
import { createHash, randomBytes } from 'crypto';

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await db.session.create({ data: { userId, token, expiresAt } });
  return token;
}

export async function getSessionUser(token: string) {
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function deleteSession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { token } });
}
