import { z } from 'zod';
import { createApiKey, revokeApiKey } from '@hq/auth/api-keys';
import { assertUserPrincipal, isBotPrincipal, isAgentPrincipal } from '@hq/auth/principals';
import { BOT_SCOPES } from '@hq/auth/types';
import type { ServiceContext } from './context';

const createBotSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(280).optional(),
  scopes: z.array(z.enum(BOT_SCOPES)).default([]),
});

const updateBotSchema = z.object({
  botId: z.string().min(1),
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(280).nullable().optional(),
  scopes: z.array(z.enum(BOT_SCOPES)).optional(),
});

const createKeySchema = z.object({
  botId: z.string().min(1),
  label: z.string().min(1).max(60).optional(),
});

const revokeKeySchema = z.object({
  botId: z.string().min(1),
  keyId: z.string().min(1),
});

async function getBotOrThrow(context: ServiceContext, botId: string) {
  const bot = await context.dbClient.bot.findUnique({
    where: { id: botId },
    include: { apiKeys: { orderBy: { createdAt: 'desc' } } },
  });

  if (!bot) {
    throw new Error('Bot not found.');
  }

  return bot;
}

function assertBotAccess(context: ServiceContext, bot: { id: string }) {
  const actor = context.actor;

  if (isAgentPrincipal(actor)) {
    throw new Error('Forbidden: agent principal cannot access bots.');
  }

  if (isBotPrincipal(actor) && actor.botId !== bot.id) {
    throw new Error('Forbidden: bot principal cannot access another bot.');
  }

  if (!isBotPrincipal(actor)) {
    const user = assertUserPrincipal(actor);
    if (!user.isSuperadmin && !user.permissions['bots.manage.any'] && !user.permissions['bots.view']) {
      throw new Error('Forbidden: missing bot access permission.');
    }
  }
}

export async function listBots(context: ServiceContext) {
  const actor = context.actor;

  if (isAgentPrincipal(actor)) {
    return [];
  }

  if (isBotPrincipal(actor)) {
    const bot = await context.dbClient.bot.findUnique({ where: { id: actor.botId } });
    return bot ? [bot] : [];
  }

  return context.dbClient.bot.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getBot(context: ServiceContext, botId: string) {
  const bot = await getBotOrThrow(context, botId);
  assertBotAccess(context, bot);
  return bot;
}

export async function createBot(context: ServiceContext, input: unknown) {
  const actor = assertUserPrincipal(context.actor);

  if (!actor.permissions['bots.create']) {
    throw new Error('Forbidden: missing bots.create permission.');
  }

  const parsed = createBotSchema.parse(input);

  return context.dbClient.bot.create({
    data: {
      name: parsed.name.trim(),
      description: parsed.description?.trim() || null,
      scopes: parsed.scopes,
    },
  });
}

export async function updateBot(context: ServiceContext, input: unknown) {
  assertUserPrincipal(context.actor);
  const parsed = updateBotSchema.parse(input);
  const bot = await getBotOrThrow(context, parsed.botId);
  assertBotAccess(context, bot);

  return context.dbClient.bot.update({
    where: { id: parsed.botId },
    data: {
      name: parsed.name?.trim(),
      description: parsed.description === null ? null : parsed.description?.trim(),
      scopes: parsed.scopes,
    },
  });
}

export async function deleteBot(context: ServiceContext, botId: string) {
  const actor = assertUserPrincipal(context.actor);

  if (!actor.isSuperadmin && !actor.permissions['bots.manage.any']) {
    throw new Error('Forbidden: missing bots.manage.any permission.');
  }

  await context.dbClient.bot.delete({ where: { id: botId } });
}

export async function listBotKeys(context: ServiceContext, botId: string) {
  const bot = await getBotOrThrow(context, botId);
  assertBotAccess(context, bot);

  return context.dbClient.botApiKey.findMany({
    where: { botId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, lastUsed: true, createdAt: true, botId: true },
  });
}

export async function createBotKey(context: ServiceContext, input: unknown) {
  const parsed = createKeySchema.parse(input);
  const bot = await getBotOrThrow(context, parsed.botId);
  assertBotAccess(context, bot);

  return createApiKey({ botId: parsed.botId, label: parsed.label });
}

export async function revokeBotKey(context: ServiceContext, input: unknown) {
  const parsed = revokeKeySchema.parse(input);
  const bot = await getBotOrThrow(context, parsed.botId);
  assertBotAccess(context, bot);

  const key = await context.dbClient.botApiKey.findFirst({
    where: { id: parsed.keyId, botId: parsed.botId },
  });

  if (!key) {
    throw new Error('API key not found.');
  }

  await revokeApiKey(key.id);
}
