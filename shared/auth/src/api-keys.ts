import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@hq/db';

const API_KEY_ROUNDS = 12;
const DEV_DEFAULT_PEPPER = 'dev-insecure-pepper-change-in-prod';

function getApiKeyPepper(): string {
  const pepper = process.env.API_KEY_PEPPER;
  if (pepper && pepper.length > 0) {
    return pepper;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('API_KEY_PEPPER is required in production.');
  }

  return DEV_DEFAULT_PEPPER;
}

function withPepper(rawKey: string): string {
  return `${rawKey}.${getApiKeyPepper()}`;
}

export function generateApiKey(): { key: string } {
  const prefix = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `aiwah_${prefix}_${secret}`;
  return { key };
}

export async function createApiKey(options: {
  botId: string;
  label?: string;
}): Promise<{ id: string; key: string }> {
  const generated = generateApiKey();
  const keyHash = await bcrypt.hash(withPepper(generated.key), API_KEY_ROUNDS);

  const created = await db.botApiKey.create({
    data: {
      botId: options.botId,
      keyHash,
      label: options.label ?? null,
    },
  });

  return { id: created.id, key: generated.key };
}

export async function validateApiKey(key: string | undefined | null) {
  if (!key || !key.startsWith('aiwah_')) {
    return null;
  }

  const allKeys = await db.botApiKey.findMany({
    include: { bot: true },
  });

  for (const candidate of allKeys) {
    const isMatch = await bcrypt.compare(withPepper(key), candidate.keyHash);
    if (!isMatch) {
      continue;
    }

    await db.botApiKey.update({
      where: { id: candidate.id },
      data: { lastUsed: new Date() },
    });

    return candidate;
  }

  return null;
}

export async function revokeApiKey(id: string): Promise<void> {
  await db.botApiKey.delete({ where: { id } });
}
