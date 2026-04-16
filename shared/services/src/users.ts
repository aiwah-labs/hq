import { db } from '@hq/db';

export async function getUserById(id: string) {
  return db.user.findUnique({ where: { id } });
}

export async function listUsers() {
  return db.user.findMany({ orderBy: { createdAt: 'desc' } });
}
