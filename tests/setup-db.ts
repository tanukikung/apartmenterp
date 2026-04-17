import { beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, connectPrisma, disconnectPrisma } from '@/lib/db/client';

const USE_TEST_DB = process.env.USE_PRISMA_TEST_DB === 'true';

beforeAll(async () => {
  if (!USE_TEST_DB) return;
  try {
    await connectPrisma();
  } catch {}
});

afterAll(async () => {
  if (!USE_TEST_DB) return;
  try {
    await disconnectPrisma();
  } catch {}
});

beforeEach(async () => {
  if (!USE_TEST_DB) return;
  // Order matters — children before parents to avoid FK violations
  const deletable = [
    'message',
    'conversation',
    'outboxEvent',
    'paymentTransaction',
    'payment',
    'invoice',
    'roomBilling',
    'billingPeriod',
    'tenant',
    'deliveryOrderItem',
    'deliveryOrder',
    'generatedDocument',
    'documentTemplateVersion',
    'documentTemplate',
    'uploadedFile',
    'maintenanceAttachment',
    'maintenanceComment',
    'maintenanceTicket',
    'room',
    'lineUser',
  ] as const;
  try {
    await prisma.$transaction(
      deletable
        .map((m) => (prisma as any)[m])
        .filter((model) => model && typeof model.deleteMany === 'function')
        .map((model) => model.deleteMany({}))
    );
  } catch {}
});