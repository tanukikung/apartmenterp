import { vi } from 'vitest';

type Fn = ReturnType<typeof vi.fn>;

function model() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

export function mockPrismaClient() {
  const prisma = {
    invoice: model(),
    invoiceVersion: model(),
    billingRecord: model(),
    billingItem: model(),
    payment: model(),
    paymentTransaction: model(),
    outboxEvent: model(),
    room: model(),
    floor: model(),
    tenant: model(),
    conversation: model(),
    message: model(),
    lineUser: model(),
    uploadedFile: model(),
    $transaction: vi.fn(async (fn: (tx: any) => any) => {
      const tx = {
        invoice: prisma.invoice,
        invoiceVersion: prisma.invoiceVersion,
        billingRecord: prisma.billingRecord,
        billingItem: prisma.billingItem,
        payment: prisma.payment,
        paymentTransaction: prisma.paymentTransaction,
        outboxEvent: prisma.outboxEvent,
        room: prisma.room,
        floor: prisma.floor,
        tenant: prisma.tenant,
        conversation: prisma.conversation,
        message: prisma.message,
        lineUser: prisma.lineUser,
        uploadedFile: prisma.uploadedFile,
      };
      return fn(tx);
    }),
  } as any;
  return prisma;
}

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA_MOCK__: any | undefined;
}
