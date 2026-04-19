import { beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const USE_TEST_DB = process.env.USE_PRISMA_TEST_DB === 'true';

// Use a dedicated real PrismaClient for DB setup, bypassing the mock applied
// to '@/lib/db/client' by tests/setup-mocks.ts. Integration tests that need
// the real client will later doUnmock and re-import '@/lib/db/client'.
const realPrisma: PrismaClient = new PrismaClient();

beforeAll(async () => {
  if (!USE_TEST_DB) return;
  try {
    await realPrisma.$connect();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[setup-db] connect failed:', e);
  }
  // Seed minimal reference data required by room factories (bankAccount + billingRule).
  // These are not truncated by beforeEach, so one-time seeding is enough.
  try {
    await (realPrisma as any).bankAccount.upsert({
      where: { id: 'ACC_F1' },
      update: {},
      create: {
        id: 'ACC_F1',
        name: 'Test Floor 1 Account',
        bankName: 'Test Bank',
        bankAccountNo: '000-0-00001-0',
        active: true,
      },
    });
    await (realPrisma as any).billingRule.upsert({
      where: { code: 'STANDARD' },
      update: {},
      create: {
        code: 'STANDARD',
        descriptionTh: 'มาตรฐาน',
        waterEnabled: true,
        waterUnitPrice: 20,
        waterMinCharge: 100,
        waterServiceFeeMode: 'FLAT_ROOM',
        waterServiceFeeAmount: 20,
        electricEnabled: true,
        electricUnitPrice: 9,
        electricMinCharge: 45,
        electricServiceFeeMode: 'FLAT_ROOM',
        electricServiceFeeAmount: 20,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[setup-db] seed failed:', e);
  }
});

afterAll(async () => {
  if (!USE_TEST_DB) return;
  try {
    await realPrisma.$disconnect();
  } catch {}
});

// Tables that should NOT be truncated between tests (seeded reference data).
const PRESERVE_TABLES = new Set<string>([
  'bank_accounts',
  'billing_rules',
  '_prisma_migrations',
]);

beforeEach(async () => {
  if (!USE_TEST_DB) return;
  try {
    // Discover all public tables so cleanup stays in sync with the schema.
    const rows = await realPrisma.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const targets = rows
      .map((r) => r.tablename)
      .filter((t) => !PRESERVE_TABLES.has(t));
    if (targets.length > 0) {
      const quoted = targets.map((t) => `"${t}"`).join(', ');
      await realPrisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`
      );
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[setup-db] beforeEach truncate failed:', e);
  }
});
