import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@hq/db';
import { BOT_SCOPES, type BotScope } from './types.js';

const API_KEY_ROUNDS = 12;
const DEV_DEFAULT_PEPPER = 'dev-insecure-pepper-change-in-prod';

// CUSTOMIZE: set `API_KEY_PREFIX` env var (e.g. `acme_`) to rebrand bot API keys.
// Defaults to `hq_`. Must end with an underscore. Changing in production breaks
// existing keys — set this BEFORE deploy or rotate keys after.
function getApiKeyPrefix(): string {
  const raw = process.env.API_KEY_PREFIX?.trim();
  if (raw && raw.length > 0) return raw.endsWith('_') ? raw : `${raw}_`;
  return 'hq_';
}

function getApiKeyPepper(): string {
  const pepper = process.env.API_KEY_PEPPER;
  if (pepper && pepper.length > 0) return pepper;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('API_KEY_PEPPER is required in production.');
  }
  return DEV_DEFAULT_PEPPER;
}

function withPepper(rawKey: string): string {
  return `${rawKey}.${getApiKeyPepper()}`;
}

export function generateApiKey(): { key: string; prefix: string } {
  const prefix = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `${getApiKeyPrefix()}${prefix}_${secret}`;
  return { key, prefix };
}

export async function createApiKey(options: {
  botId: string;
  createdByUserId: string;
  name: string;
  scopes?: string[];
}): Promise<{ id: string; key: string; prefix: string }> {
  const generated = generateApiKey();
  const keyHash = await bcrypt.hash(withPepper(generated.key), API_KEY_ROUNDS);

  const validScopes = [
    ...new Set(
      (options.scopes ?? []).filter((s) => (BOT_SCOPES as readonly string[]).includes(s))
    ),
  ] as BotScope[];

  const created = await (db as any).apiKey.create({
    data: {
      botId: options.botId,
      createdByUserId: options.createdByUserId,
      name: options.name,
      keyHash,
      scopes: validScopes,
    },
  });

  await (db as any).apiKeyEvent.create({
    data: { apiKeyId: created.id, eventType: 'CREATED' },
  });

  return { id: created.id, key: generated.key, prefix: generated.prefix };
}

export async function validateApiKey(
  key: string | undefined | null,
  opts?: { ipAddress?: string; userAgent?: string }
) {
  if (!key || !key.startsWith(getApiKeyPrefix())) return null;

  const candidates = await (db as any).apiKey.findMany({
    include: { bot: true, createdByUser: true },
  });

  for (const candidate of candidates) {
    const isMatch = await bcrypt.compare(withPepper(key), candidate.keyHash);
    if (!isMatch) continue;

    if (candidate.bot.status !== 'ACTIVE') {
      await (db as any).apiKeyEvent.create({
        data: { apiKeyId: candidate.id, eventType: 'AUTH_FAILURE', detail: 'bot_not_active' },
      });
      return null;
    }

    await (db as any).$transaction([
      (db as any).apiKey.update({ where: { id: candidate.id }, data: { lastUsed: new Date() } }),
      (db as any).apiKeyEvent.create({
        data: {
          apiKeyId: candidate.id,
          eventType: 'AUTH_SUCCESS',
          ipAddress: opts?.ipAddress,
          userAgent: opts?.userAgent,
        },
      }),
    ]);

    return candidate;
  }

  await (db as any).apiKeyEvent.createMany({ data: [] });

  return null;
}

export async function revokeApiKey(id: string): Promise<void> {
  const result = await (db as any).apiKey.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count > 0) {
    await (db as any).apiKeyEvent.create({
      data: { apiKeyId: id, eventType: 'REVOKED' },
    });
  }
}
