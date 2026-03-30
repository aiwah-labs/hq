/**
 * Direct agent trigger test — run from apps/api/ with: tsx test-agent-trigger.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env
for (const envFile of [
  resolve('../../.env'),
  resolve('../../shared/db/.env'),
  resolve('.env.local'),
]) {
  try {
    const lines = readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}

console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY?.slice(0, 20) + '...');
console.log('DATABASE_URL:', process.env.DATABASE_URL?.split('@')[1]);

const THREAD_ID = 'cmn0igwiq0000l4s0rtmiptdk';
const USER_ID   = 'cmmc72boa0000pancqta68bpn';

async function main() {
  const { onChannelMessage } = await import('@hq/agents/triggers');
  const { db } = await import('@hq/db');

  const before = await db.msgMessage.findMany({
    where: { threadId: THREAD_ID },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { content: true, senderType: true, createdAt: true }
  });
  console.log('\nBefore:', before.map(m => `[${m.senderType}] ${m.content.slice(0,60)}`));

  console.log('\nFiring trigger for @workshop-assistant...');
  await onChannelMessage({
    id: `test-${Date.now()}`,
    threadId: THREAD_ID,
    channelId: THREAD_ID,
    channelType: 'messaging',
    senderId: USER_ID,
    senderType: 'USER',
    content: '@workshop-assistant Quick summary: how many companies and contacts in the CRM?',
    isDm: false,
  });
  console.log('✅ Job queued — waiting 30s for pg-boss to process...');

  await new Promise(r => setTimeout(r, 30000));

  const after = await db.msgMessage.findMany({
    where: { threadId: THREAD_ID },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { content: true, senderType: true, createdAt: true }
  });
  console.log('\nAfter:');
  for (const m of after) {
    console.log(`  [${m.senderType}] ${m.content.slice(0, 120)}`);
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
