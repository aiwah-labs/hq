// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db, ApiKeyEventType, BotStatus } from '@hq/db';
import { BOT_SCOPES, type BotScope } from './types';

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

export function generateApiKey(): { key: string; prefix: string } {
  const prefix = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `aiwah_${prefix}_${secret}`;
  return { key, prefix };
}

interface CreateApiKeyOptions {
  botId: string;
  createdByUserId: string;
  name: string;
  scopes?: BotScope[];
  expiresAt?: Date;
}

interface ValidateApiKeyMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createApiKey(options: CreateApiKeyOptions): Promise<{ id: string; key: string; prefix: string }> {
  const generated = generateApiKey();
  const keyHash = await bcrypt.hash(withPepper(generated.key), API_KEY_ROUNDS);

  const created = await db.apiKey.create({
    data: {
      botId: options.botId,
      createdByUserId: options.createdByUserId,
      name: options.name,
      keyHash,
      keyPrefix: generated.prefix,
      scopes: [...new Set((options.scopes ?? []).filter((scope): scope is BotScope => BOT_SCOPES.includes(scope)))],
      expiresAt: options.expiresAt,
    },
  });

  await db.apiKeyEvent.create({
    data: {
      apiKeyId: created.id,
      eventType: ApiKeyEventType.CREATED,
      detail: 'api_key_created',
    },
  });

  return { id: created.id, key: generated.key, prefix: generated.prefix };
}

export async function validateApiKey(key: string | undefined | null, metadata?: ValidateApiKeyMetadata) {
  if (!key || !key.startsWith('aiwah_')) {
    return null;
  }

  const [_, prefix] = key.split('_');
  if (!prefix) {
    return null;
  }

  const candidates = await db.apiKey.findMany({
    where: {
      keyPrefix: prefix,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      bot: true,
      createdByUser: true,
    },
  });

  for (const candidate of candidates) {
    const isMatch = await bcrypt.compare(withPepper(key), candidate.keyHash);
    if (!isMatch) {
      continue;
    }

    if (candidate.bot.status !== BotStatus.ACTIVE || candidate.bot.archivedAt) {
      await db.apiKeyEvent.create({
        data: {
          apiKeyId: candidate.id,
          eventType: ApiKeyEventType.AUTH_FAILURE,
          ipAddress: metadata?.ipAddress ?? undefined,
          userAgent: metadata?.userAgent ?? undefined,
          detail: 'bot_not_active',
        },
      });
      return null;
    }

    await db.$transaction([
      db.apiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      }),
      db.apiKeyEvent.create({
        data: {
          apiKeyId: candidate.id,
          eventType: ApiKeyEventType.AUTH_SUCCESS,
          ipAddress: metadata?.ipAddress ?? undefined,
          userAgent: metadata?.userAgent ?? undefined,
          detail: 'key_validated',
        },
      }),
    ]);

    return candidate;
  }

  if (candidates.length > 0) {
    await db.apiKeyEvent.createMany({
      data: candidates.map((candidate) => ({
        apiKeyId: candidate.id,
        eventType: ApiKeyEventType.AUTH_FAILURE,
        ipAddress: metadata?.ipAddress ?? undefined,
        userAgent: metadata?.userAgent ?? undefined,
        detail: 'hash_mismatch',
      })),
    });
  }

  return null;
}

export async function revokeApiKey(id: string): Promise<void> {
  const updated = await db.apiKey.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (updated.count > 0) {
    await db.apiKeyEvent.create({
      data: {
        apiKeyId: id,
        eventType: ApiKeyEventType.REVOKED,
        detail: 'api_key_revoked',
      },
    });
  }
}
