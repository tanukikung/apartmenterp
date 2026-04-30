import { vi } from 'vitest';
import { mockPrismaClient } from './mocks/prisma';
import './helpers/line-mock';

if (!(globalThis as any).__PRISMA_MOCK__) {
  (globalThis as any).__PRISMA_MOCK__ = mockPrismaClient();
}

const prisma = (globalThis as any).__PRISMA_MOCK__;

// Ensure $queryRaw is available at the top level for health checks and other raw queries
if (!prisma.$queryRaw) {
  prisma.$queryRaw = vi.fn().mockResolvedValue([]);
}

vi.mock('@/lib/db/client', () => {
  const connectPrisma = async () => {};
  const disconnectPrisma = async () => {};
  const withTransaction = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    return prisma.$transaction(fn);
  };
  const rawQuery = vi.fn(async () => null);
  return { prisma, connectPrisma, disconnectPrisma, withTransaction, rawQuery };
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration test mode (USE_PRISMA_TEST_DB=true)
//
// When the flag is set, we inject a real Prisma client into the mock so that
// $transaction(...) calls go to the real DB. This is intentionally synchronous
// to avoid race conditions with vi.mock module factory hoisting.
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.USE_PRISMA_TEST_DB === 'true') {
  // Inject directly into the shared global so vi.mock module factory sees it.
  // Defensive: only replace if the swap hasn't already happened.
  const g = globalThis as any;
  if (g.__PRISMA_MOCK__ && !g.__REAL_TXSWAP__) {
    (async () => {
      try {
        const { PrismaClient } = await import('@prisma/client');
        const realPrisma = new PrismaClient();
        g.__PRISMA_MOCK__.$transaction = async (fn: (tx: any) => Promise<any>) => {
          return realPrisma.$transaction(fn);
        };
        g.__REAL_TXSWAP__ = true;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[setup-mocks] real Prisma swap failed:', e);
      }
    })();
  }
}

vi.mock('@/lib/line/client', () => {
  return {
    getLineClient: vi.fn(() => ({} as any)),
    getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
    sendLineMessage: vi.fn(async () => ({ status: 200 })),
    sendFlexMessage: vi.fn(async () => ({ status: 200 })),
    sendInvoiceMessage: vi.fn(async () => ({ status: 200 })),
    sendReminderMessage: vi.fn(async () => ({ status: 200 })),
    sendOverdueNotice: vi.fn(async () => ({ status: 200 })),
    sendWelcomeMessage: vi.fn(async () => ({ status: 200 })),
    sendTemplateMessage: vi.fn(async () => ({ status: 200 })),
    sendReplyMessage: vi.fn(async () => ({ status: 200 })),
    sendLineImageMessage: vi.fn(async () => ({ status: 200 })),
    sendLineFileMessage: vi.fn(async () => ({ status: 200 })),
    sendTextWithQuickReply: vi.fn(async () => ({ status: 200 })),
    getLineUserProfile: vi.fn(async () => null),
    verifyLineSignature: vi.fn(() => true),
    parseWebhookEvent: vi.fn((raw: any) => raw),
    isLineConfigured: vi.fn(() => false),
  };
});
