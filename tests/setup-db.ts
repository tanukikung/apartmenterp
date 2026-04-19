import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const USE_TEST_DB = process.env.USE_PRISMA_TEST_DB === 'true';

// Lazy-instantiated real PrismaClient for DB setup, bypassing the mock applied
// to '@/lib/db/client' by tests/setup-mocks.ts. Integration tests that need
// the real client will later doUnmock and re-import '@/lib/db/client'.
// When USE_TEST_DB is false, we never spawn the engine or open a connection.
let realPrisma: PrismaClient | null = null;
function getRealPrisma(): PrismaClient {
  if (!realPrisma) realPrisma = new PrismaClient();
  return realPrisma;
}

beforeAll(async () => {
  if (!USE_TEST_DB) return;
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
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[setup-db] seed failed:', e);
  }
});

afterAll(async () => {
  if (!USE_TEST_DB || !realPrisma) return;
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
  if (!USE_TEST_DB) return;
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
