import { db } from '@hq/db';
import { createApiKey } from '@hq/auth/api-keys';

async function run() {
  const user = await db.user.findFirst();
  let bot = await db.bot.findFirst();
  if (!bot) {
    bot = await db.bot.create({
      data: {
        name: 'Test Bot',
        slug: 'test-bot',
        createdByUserId: user.id,
      }
    });
  }
  
  const keyInfo = await createApiKey({
    botId: bot.id,
    createdByUserId: user.id,
    name: 'Test Key',
    scopes: ['content.read', 'content.write'] as any
  });
  console.log(keyInfo.key);
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) });
