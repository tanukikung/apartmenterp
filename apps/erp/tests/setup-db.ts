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
  const deletable = [
    'message',
    'conversation',
    'maintenanceAttachment',
    'maintenanceComment',
    'maintenanceTicket',
    'outboxEvent',
    'paymentTransaction',
    'payment',
    'invoiceVersion',
    'invoice',
    'billingItem',
    'billingRecord',
    'tenant',
    'room',
    'floor',
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
