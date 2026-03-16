import { vi } from 'vitest';
import { prisma } from '@/lib/db/client';

type ModelMock = { findMany: ReturnType<typeof vi.fn> };

export const prismaMock: {
  conversation: ModelMock;
  message: ModelMock;
  invoice: ModelMock;
  outboxEvent: ModelMock;
  $reset: () => void;
} = {
  conversation: { findMany: vi.fn() },
  message: { findMany: vi.fn() },
  invoice: { findMany: vi.fn() },
  outboxEvent: { findMany: vi.fn() },
  $reset: () => {
    prismaMock.conversation.findMany.mockReset();
    prismaMock.message.findMany.mockReset();
    prismaMock.invoice.findMany.mockReset();
    prismaMock.outboxEvent.findMany.mockReset();
  },
};

export function mockPrisma() {
  const p: any = prisma as any;
  const billingFindUnique = p?.billingRecord?.findUnique
    ? vi.spyOn(p.billingRecord, 'findUnique')
    : vi.fn();
  const invoiceFindFirst = p?.invoice?.findFirst
    ? vi.spyOn(p.invoice, 'findFirst')
    : vi.fn();
  const invoiceCreate = p?.invoice?.create
    ? vi.spyOn(p.invoice, 'create')
    : vi.fn();
  const paymentCreate = p?.payment?.create
    ? vi.spyOn(p.payment, 'create')
    : vi.fn();
  return { billingFindUnique, invoiceFindFirst, invoiceCreate, paymentCreate };
}
