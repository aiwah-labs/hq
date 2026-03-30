import { z } from 'zod';
import { BotMembershipRole, BotStatus, type ApiKey, type Bot, type BotMember } from '@hq/db';
import { createApiKey, revokeApiKey } from '@hq/auth/api-keys';
import { assertUserPrincipal, hasScope, isBotPrincipal, isAgentPrincipal } from '@hq/auth/principals';
import { BOT_SCOPES, type AuthPrincipal, type BotScope, type UserPrincipal } from '@hq/auth/types';
import type { ServiceContext } from './context';

const createBotSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(280).optional(),
});

const updateBotSchema = z.object({
  botId: z.string().min(1),
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(280).nullable().optional(),
  status: z.enum([BotStatus.ACTIVE, BotStatus.PAUSED, BotStatus.ARCHIVED]).optional(),
});

const addMemberSchema = z.object({
  botId: z.string().min(1),
  userEmail: z.email(),
  membershipRole: z.enum([BotMembershipRole.OWNER, BotMembershipRole.MAINTAINER, BotMembershipRole.VIEWER]),
});

const updateMemberSchema = z.object({
  botId: z.string().min(1),
  userId: z.string().min(1),
  membershipRole: z.enum([BotMembershipRole.OWNER, BotMembershipRole.MAINTAINER, BotMembershipRole.VIEWER]),
});

const removeMemberSchema = z.object({
  botId: z.string().min(1),
  userId: z.string().min(1),
});

const createKeySchema = z.object({
  botId: z.string().min(1),
  name: z.string().min(2).max(60),
  scopes: z.array(z.enum(BOT_SCOPES)).default([]),
  expiresAt: z.coerce.date().optional(),
});

const revokeKeySchema = z.object({
  botId: z.string().min(1),
  keyId: z.string().min(1),
});

function isAdminOverride(actor: UserPrincipal): boolean {
  return actor.isSuperadmin || actor.permissions['bots.manage.any'];
}

function normalizeSlugInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function buildUniqueSlug(context: ServiceContext, name: string): Promise<string> {
  const base = normalizeSlugInput(name) || 'bot';
  let attempt = base;
  let i = 2;

  while (true) {
    const exists = await context.dbClient.bot.findUnique({ where: { slug: attempt }, select: { id: true } });
    if (!exists) {
      return attempt;
    }
    attempt = `${base}-${i}`;
    i += 1;
  }
}

async function getBotOrThrow(context: ServiceContext, botId: string) {
  const bot = await context.dbClient.bot.findUnique({
    where: { id: botId },
    include: {
      createdByUser: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!bot) {
    throw new Error('Bot not found.');
  }

  return bot;
}

function assertBotAccessible(actor: AuthPrincipal, bot: Bot & { members: BotMember[] }): BotMembershipRole | null {
  if (isBotPrincipal(actor)) {
    if (actor.botId !== bot.id) {
      throw new Error('Forbidden: bot principal cannot access another bot.');
    }
    return BotMembershipRole.OWNER;
  }

  if (isAgentPrincipal(actor)) {
    throw new Error('Forbidden: agent principal cannot access bots.');
  }

  if (isAdminOverride(actor)) {
    const ownMembership = bot.members.find((member) => member.userId === actor.userId);
    return ownMembership?.membershipRole ?? null;
  }

  const membership = bot.members.find((member) => member.userId === actor.userId);
  if (!membership) {
    throw new Error('Forbidden: bot access denied.');
  }

  return membership.membershipRole;
}

function assertCanManageMembers(actor: UserPrincipal, role: BotMembershipRole | null): void {
  if (isAdminOverride(actor)) {
    return;
  }

  if (role !== BotMembershipRole.OWNER) {
    throw new Error('Forbidden: only bot owners can manage members.');
  }
}

function assertCanManageKeys(actor: UserPrincipal, role: BotMembershipRole | null): void {
  if (isAdminOverride(actor)) {
    return;
  }

  if (role !== BotMembershipRole.OWNER && role !== BotMembershipRole.MAINTAINER) {
    throw new Error('Forbidden: only owners/maintainers can manage keys.');
  }
}

function assertCanEditBot(actor: UserPrincipal, role: BotMembershipRole | null, inputHasStatus: boolean): void {
  if (isAdminOverride(actor)) {
    return;
  }

  if (role !== BotMembershipRole.OWNER && role !== BotMembershipRole.MAINTAINER) {
    throw new Error('Forbidden: only owners/maintainers can edit bot details.');
  }

  if (inputHasStatus && role !== BotMembershipRole.OWNER) {
    throw new Error('Forbidden: only owners can change bot status.');
  }
}

async function countOwners(context: ServiceContext, botId: string): Promise<number> {
  return context.dbClient.botMember.count({
    where: {
      botId,
      membershipRole: BotMembershipRole.OWNER,
    },
  });
}

export async function listBots(context: ServiceContext) {
  const actor = context.actor;

  if (isAgentPrincipal(actor)) {
    return []; // agents cannot list bots
  }

  if (isBotPrincipal(actor)) {
    const bot = await context.dbClient.bot.findUnique({
      where: { id: actor.botId },
      include: {
        createdByUser: {
          select: { id: true, email: true, name: true },
        },
      },
    });
    if (!bot) {
      return [];
    }

    return [
      {
        id: bot.id,
        name: bot.name,
        slug: bot.slug,
        description: bot.description,
        status: bot.status,
        createdAt: bot.createdAt,
        updatedAt: bot.updatedAt,
        createdByUser: bot.createdByUser,
        membershipRole: BotMembershipRole.OWNER,
      },
    ];
  }

  const adminOverride = isAdminOverride(actor);
  const bots = await context.dbClient.bot.findMany({
    where: adminOverride
      ? {}
      : {
          members: {
            some: {
              userId: actor.userId,
            },
          },
        },
    include: {
      createdByUser: {
        select: { id: true, email: true, name: true },
      },
      members: {
        where: {
          userId: actor.userId,
        },
        select: {
          membershipRole: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return bots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    slug: bot.slug,
    description: bot.description,
    status: bot.status,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
    createdByUser: bot.createdByUser,
    membershipRole: bot.members[0]?.membershipRole ?? null,
  }));
}

export async function getBot(context: ServiceContext, botId: string) {
  const bot = await getBotOrThrow(context, botId);
  const membershipRole = assertBotAccessible(context.actor, bot);

  return {
    id: bot.id,
    name: bot.name,
    slug: bot.slug,
    description: bot.description,
    status: bot.status,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
    createdByUser: bot.createdByUser,
    membershipRole,
    members: bot.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      membershipRole: member.membershipRole,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: member.user,
    })),
  };
}

export async function createBot(context: ServiceContext, input: unknown) {
  const actor = assertUserPrincipal(context.actor);

  if (!actor.permissions['bots.create']) {
    throw new Error('Forbidden: missing bots.create permission.');
  }

  const parsed = createBotSchema.parse(input);
  const slug = await buildUniqueSlug(context, parsed.name);

  return context.dbClient.$transaction(async (tx) => {
    const created = await tx.bot.create({
      data: {
        name: parsed.name.trim(),
        slug,
        description: parsed.description?.trim() || null,
        status: BotStatus.ACTIVE,
        createdByUserId: actor.userId,
      },
    });

    await tx.botMember.create({
      data: {
        botId: created.id,
        userId: actor.userId,
        membershipRole: BotMembershipRole.OWNER,
      },
    });

    return created;
  });
}

export async function updateBot(context: ServiceContext, input: unknown) {
  const actor = assertUserPrincipal(context.actor);
  const parsed = updateBotSchema.parse(input);
  const bot = await getBotOrThrow(context, parsed.botId);
  const role = assertBotAccessible(actor, bot);
  const hasStatusUpdate = typeof parsed.status !== 'undefined';

  assertCanEditBot(actor, role, hasStatusUpdate);

  return context.dbClient.bot.update({
    where: { id: parsed.botId },
    data: {
      name: parsed.name?.trim(),
      description: parsed.description === null ? null : parsed.description?.trim(),
      status: parsed.status,
      archivedAt: parsed.status === BotStatus.ARCHIVED ? new Date() : null,
    },
  });
}

export async function addBotMember(context: ServiceContext, input: unknown) {
  const actor = assertUserPrincipal(context.actor);
  const parsed = addMemberSchema.parse(input);
  const bot = await getBotOrThrow(context, parsed.botId);
  const role = assertBotAccessible(actor, bot);

  assertCanManageMembers(actor, role);

  const email = parsed.userEmail.toLowerCase().trim();
  const target = await context.dbClient.user.findUnique({ where: { email } });
  if (!target || target.deletedAt) {
    throw new Error('Target user not found.');
  }

  return context.dbClient.botMember.upsert({
    where: {
      botId_userId: {
        botId: parsed.botId,
        userId: target.id,
      },
    },
    create: {
      botId: parsed.botId,
      userId: target.id,
      membershipRole: parsed.membershipRole,
    },
    update: {
      membershipRole: parsed.membershipRole,
    },
  });
}

export async function updateBotMember(context: ServiceContext, input: unknown) {
  const actor = assertUserPrincipal(context.actor);
  const parsed = updateMemberSchema.parse(input);
  const bot = await getBotOrThrow(context, parsed.botId);
  const role = assertBotAccessible(actor, bot);

  assertCanManageMembers(actor, role);

  if (parsed.userId === bot.createdByUserId && parsed.membershipRole !== BotMembershipRole.OWNER) {
    throw new Error('Forbidden: bot creator must remain an owner.');
  }

  const existing = await context.dbClient.botMember.findUnique({
    where: {
      botId_userId: {
        botId: parsed.botId,
        userId: parsed.userId,
      },
    },
  });

  if (!existing) {
    throw new Error('Bot member not found.');
  }

  if (existing.membershipRole === BotMembershipRole.OWNER && parsed.membershipRole !== BotMembershipRole.OWNER) {
    const ownerCount = await countOwners(context, parsed.botId);
    if (ownerCount <= 1) {
      throw new Error('Forbidden: bot must keep at least one owner.');
    }
  }

  return context.dbClient.botMember.update({
    where: {
      botId_userId: {
        botId: parsed.botId,
        userId: parsed.userId,
      },
    },
    data: {
      membershipRole: parsed.membershipRole,
    },
  });
}

export async function removeBotMember(context: ServiceContext, input: unknown) {
  const actor = assertUserPrincipal(context.actor);
  const parsed = removeMemberSchema.parse(input);
  const bot = await getBotOrThrow(context, parsed.botId);
  const role = assertBotAccessible(actor, bot);

  assertCanManageMembers(actor, role);

  if (parsed.userId === bot.createdByUserId) {
    throw new Error('Forbidden: bot creator cannot be removed.');
  }

  const existing = await context.dbClient.botMember.findUnique({
    where: {
      botId_userId: {
        botId: parsed.botId,
        userId: parsed.userId,
      },
    },
  });
  if (!existing) {
    throw new Error('Bot member not found.');
  }

  if (existing.membershipRole === BotMembershipRole.OWNER) {
    const ownerCount = await countOwners(context, parsed.botId);
    if (ownerCount <= 1) {
      throw new Error('Forbidden: bot must keep at least one owner.');
    }
  }

  await context.dbClient.botMember.delete({
    where: {
      botId_userId: {
        botId: parsed.botId,
        userId: parsed.userId,
      },
    },
  });
}

function toSafeKey(input: ApiKey) {
  return {
    id: input.id,
    name: input.name,
    keyPrefix: input.keyPrefix,
    scopes: input.scopes,
    lastUsedAt: input.lastUsedAt,
    expiresAt: input.expiresAt,
    revokedAt: input.revokedAt,
    createdAt: input.createdAt,
    botId: input.botId,
    createdByUserId: input.createdByUserId,
  };
}

export async function listBotKeys(context: ServiceContext, botId: string) {
  const bot = await getBotOrThrow(context, botId);
  const role = assertBotAccessible(context.actor, bot);

  if (!isBotPrincipal(context.actor)) {
    assertCanManageKeys(assertUserPrincipal(context.actor), role);
  }

  const keys = await context.dbClient.apiKey.findMany({
    where: {
      botId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return keys.map(toSafeKey);
}

export async function createBotKey(context: ServiceContext, input: unknown) {
  const parsed = createKeySchema.parse(input);
  const actor = context.actor;
  let createdByUserId: string;

  if (isBotPrincipal(actor)) {
    if (actor.botId !== parsed.botId) {
      throw new Error('Forbidden: bot principal cannot create keys for another bot.');
    }
    if (!hasScope(actor, 'content.write')) {
      throw new Error("Forbidden: bot principal requires 'content.write' scope to create keys.");
    }
    createdByUserId = actor.createdByUserId;
  } else {
    const userActor = assertUserPrincipal(actor);
    const bot = await getBotOrThrow(context, parsed.botId);
    const role = assertBotAccessible(userActor, bot);
    assertCanManageKeys(userActor, role);
    createdByUserId = userActor.userId;
  }

  const created = await createApiKey({
    botId: parsed.botId,
    createdByUserId,
    name: parsed.name.trim(),
    scopes: parsed.scopes as BotScope[],
    expiresAt: parsed.expiresAt,
  });

  return created;
}

export async function revokeBotKey(context: ServiceContext, input: unknown) {
  const parsed = revokeKeySchema.parse(input);
  const actor = context.actor;

  if (isBotPrincipal(actor)) {
    if (actor.botId !== parsed.botId) {
      throw new Error('Forbidden: bot principal cannot revoke keys for another bot.');
    }
    if (!hasScope(actor, 'content.write')) {
      throw new Error("Forbidden: bot principal requires 'content.write' scope to revoke keys.");
    }
  } else {
    const userActor = assertUserPrincipal(actor);
    const bot = await getBotOrThrow(context, parsed.botId);
    const role = assertBotAccessible(userActor, bot);
    assertCanManageKeys(userActor, role);
  }

  const key = await context.dbClient.apiKey.findFirst({
    where: {
      id: parsed.keyId,
      botId: parsed.botId,
    },
  });

  if (!key) {
    throw new Error('API key not found.');
  }

  await revokeApiKey(key.id);
}
