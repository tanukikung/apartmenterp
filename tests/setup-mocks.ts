import { vi } from 'vitest';
import { mockPrismaClient } from './mocks/prisma';

if (!(globalThis as any).__PRISMA_MOCK__) {
  (globalThis as any).__PRISMA_MOCK__ = mockPrismaClient();
}

const prisma = (globalThis as any).__PRISMA_MOCK__;

vi.mock('@/lib/db/client', () => {
  const connectPrisma = async () => {};
  const disconnectPrisma = async () => {};
  const withTransaction = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    return prisma.$transaction(fn);
  };
  const rawQuery = vi.fn(async () => null);
  return { prisma, connectPrisma, disconnectPrisma, withTransaction, rawQuery };
});

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
    getLineUserProfile: vi.fn(async () => null),
    verifyLineSignature: vi.fn(() => true),
    parseWebhookEvent: vi.fn((raw: any) => raw),
    isLineConfigured: vi.fn(() => false),
  };
});
