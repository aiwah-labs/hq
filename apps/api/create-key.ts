import { db } from '@hq/db';
import { createApiKey } from '@hq/auth/api-keys';

async function run() {
  let bot = await db.bot.findFirst();
  if (!bot) {
    bot = await db.bot.create({
      data: {
        name: 'Test Bot',
        scopes: ['content.read', 'content.write'],
      }
    });
  }

  const keyInfo = await createApiKey({
    botId: bot.id,
    label: 'Test Key',
  });
  console.log(keyInfo.key);
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) });
