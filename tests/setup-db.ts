import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

// NOTE: USE_PRISMA_TEST_DB is now checked inside beforeAll callbacks (not at module
// load time) so that test files can set the env var before the check runs.

// Lazy-instantiated real PrismaClient for DB setup, bypassing the mock applied
// to '@/lib/db/client' by tests/setup-mocks.ts. Integration tests that need
// the real client will later doUnmock and re-import '@/lib/db/client'.
// When USE_TEST_DB is false, we never spawn the engine or open a connection.
//
// CRITICAL: All PrismaClients in tests MUST use the SAME DATABASE_URL from .env.test.
// No hardcoded connections allowed.
let realPrisma: PrismaClient | null = null;
function getRealPrisma(): PrismaClient {
  if (!realPrisma) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('[setup-db] DATABASE_URL is not set — check .env.test');
    realPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  }
  return realPrisma;
}

beforeAll(async () => {
  if (process.env.USE_PRISMA_TEST_DB !== 'true') return;
  // Seed once per fork process (not once per test file). Vitest workers reuse
  // the same process across files in the same pool, so checking globalThis
  // avoids re-upserting on every file boot.
  const g = globalThis as any;
  if (g.__APT_ERP_SEEDED__) return;
  g.__APT_ERP_SEEDED__ = true;
  // Connection happens lazily on the first query.
  try {
    await (getRealPrisma() as any).bankAccount.upsert({
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
    await (getRealPrisma() as any).billingRule.upsert({
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
        penaltyPerDay: 50,
        maxPenalty: 500,
        gracePeriodDays: 3,
      },
    });

    // Keep the ad-hoc local test database compatible with the current Prisma
    // client when developers have not run migrations yet.
    await getRealPrisma().$executeRawUnsafe(
      'ALTER TABLE "billing_periods" ADD COLUMN IF NOT EXISTS "gracePeriodDays" INTEGER NOT NULL DEFAULT 0',
    );

    // Create document_access_tokens table for secure document download tokens
    await getRealPrisma().$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "document_access_tokens" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "tokenHash" TEXT UNIQUE NOT NULL,
        "documentId" TEXT,
        "invoiceId" TEXT,
        "purpose" TEXT DEFAULT 'DOCUMENT_DOWNLOAD',
        "expiresAt" TIMESTAMPTZ(6),
        "revokedAt" TIMESTAMPTZ(6),
        "useCount" INTEGER DEFAULT 0,
        "lastUsedAt" TIMESTAMPTZ(6),
        "createdAt" TIMESTAMPTZ(6) DEFAULT NOW(),
        "createdBy" TEXT,
        "metadata" JSONB
      )
    `);
    await getRealPrisma().$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "document_access_tokens_token_hash_idx" ON "document_access_tokens" ("tokenHash")`);
    await getRealPrisma().$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "document_access_tokens_document_id_idx" ON "document_access_tokens" ("documentId")`);
    await getRealPrisma().$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "document_access_tokens_invoice_id_idx" ON "document_access_tokens" ("invoiceId")`);
    await getRealPrisma().$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "document_access_tokens_expires_at_idx" ON "document_access_tokens" ("expiresAt")`);

    // Seed a default billing period for tests.
    // Use a random month so multiple test runs don't collide on (year, month).
    // Tests that specifically need a certain month handle that themselves.
    const bpYear = 2026;
    const bpMonth = ((Math.floor(Math.random() * 12)) + 1);
    const bpId = `BP-${bpYear}-${bpMonth}`;
    try {
      await (getRealPrisma() as any).billingPeriod.upsert({
        where: { year_month: { year: bpYear, month: bpMonth } },
        update: {},
        create: { id: bpId, year: bpYear, month: bpMonth, status: 'OPEN', dueDay: 25 },
      });
    } catch (e: any) {
      if (e.code !== 'P2002') console.error('[setup-db] bp seed error:', e.message);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[setup-db] seed failed:', e);
  }
});

afterAll(async () => {
  if (process.env.USE_PRISMA_TEST_DB !== 'true' || !realPrisma) return;
  try {
    await realPrisma.$disconnect();
  } catch {}
});

// Delete in dependency order (children before parents). This is called in a
// transaction so partial failures roll back. Keep seeded reference tables
// (bank_accounts, billing_rules) out of this list — they are not touched.
const DELETABLE_MODELS = [
  'deliveryOrderItem',
  'deliveryOrder',
  'generatedDocumentFile',
  'generatedDocument',
  'documentGenerationTarget',
  'documentGenerationJob',
  'documentTemplateFieldDefinition',
  'documentTemplateVersion',
  'documentTemplate',
  'moveOutItem',
  'moveOut',
  'notification',
  'message',
  'conversation',
  'maintenanceAttachment',
  'maintenanceComment',
  'maintenanceTicket',
  'lineMaintenanceState',
  'outboxEvent',
  'auditLog',
  'paymentMatch',
  'paymentTransaction',
  'payment',
  'invoiceDelivery',
  'invoice',
  'roomBilling',
  'billingPeriod',
  'importBatch',
  'contract',
  'roomTenant',
  'tenantRegistration',
  'tenant',
  'uploadedFile',
  'room',
  'expense',
  'lineUser',
  'broadcast',
  'reminderConfig',
  'passwordResetToken',
  'staffRegistrationRequest',
  'messageTemplate',
  'config',
] as const;

// NOTE: no automatic cleanup. With a multi-fork pool, any deleteMany on shared
// tables races against sibling forks that are mid-assertion. Tests instead
// isolate themselves via randomized IDs (roomNo, year/month, reference strings).
// If you want a clean DB, export WIPE_TEST_DB=true before running vitest.
beforeAll(async () => {
  if (process.env.USE_PRISMA_TEST_DB !== 'true') return;
  if (process.env.WIPE_TEST_DB !== 'true') return;
  const g = globalThis as any;
  if (g.__APT_ERP_CLEANED__) return;
  g.__APT_ERP_CLEANED__ = true;
  try {
    const p = getRealPrisma() as any;
    await p.$transaction(
      DELETABLE_MODELS
        .map((m) => p[m])
        .filter((model) => model && typeof model.deleteMany === 'function')
        .map((model) => model.deleteMany({}))
    );
  } catch {}
});
