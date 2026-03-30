import { db } from './client.js';
import { createHash } from 'crypto';

async function main() {
  const email = process.env.SUPERADMIN_EMAIL_ALLOWLIST?.split(',')[0]?.trim() ?? 'admin@example.com';
  const password = 'changeme';
  const passwordHash = createHash('sha256').update(password).digest('hex');

  await db.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: 'Admin', role: 'ADMIN' },
  });

  console.log(`Seeded admin user: ${email} / ${password}`);
}

main().catch(console.error).finally(() => db.$disconnect());
