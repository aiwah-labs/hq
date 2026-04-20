import { db } from './client.js';
import bcrypt from 'bcryptjs';
import { seedModules } from './seed-modules/index.js';

async function main() {
  // Platform seed: canonical admin user. Runs on every seed call.
  const email = process.env.SUPERADMIN_EMAIL_ALLOWLIST?.split(',')[0]?.trim() ?? 'admin@example.com';
  const password = 'changeme';
  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.upsert({
    where: { email },
    update: { passwordHash, status: 'ACTIVE', role: 'ADMIN' },
    create: { email, passwordHash, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' },
  });

  console.log(`Seeded admin user: ${email} / ${password}`);

  // Example-module seeds. Remove entries from `seed-modules/index.ts` when
  // forking the template for a real deployment.
  for (const mod of seedModules) {
    try {
      await mod.seed(db);
    } catch (err) {
      console.warn(`Seed module "${mod.name}" failed:`, err);
    }
  }
}

main().catch(console.error).finally(() => db.$disconnect());
