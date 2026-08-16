import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  // Never bake a fixed credential into the repo: generate one and print it once.
  const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, displayName: 'Platform Admin', role: 'ADMIN' },
  });

  console.log(`Seeded admin user: ${email}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Generated password (shown once): ${password}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
