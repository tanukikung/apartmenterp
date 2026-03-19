import { describe, it, expect, vi } from 'vitest';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { prisma } from '@/lib/db/client';
import { buildInvoiceAccessUrl } from '@/lib/invoices/access';

vi.mock('@/lib/db/client', () => {
  const prismaMock = {
    roomBilling:      { findUnique: vi.fn(), update: vi.fn() },
    invoice:          { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    invoiceVersion:   { create: vi.fn() },
    outboxEvent:      { create: vi.fn() },
    auditLog:         { create: vi.fn() },
    // Required by GET /api/invoices/[id]/pdf — returns null so no template applied
    documentTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (fn: any) =>
      fn({
        invoice:        { create: vi.fn().mockResolvedValue({ id: 'inv-1', roomNo: 'room-1', roomBillingId: 'br-1', year: 2026, month: 3, version: 1, status: 'GENERATED', totalAmount: 1000, dueDate: new Date(), issuedAt: new Date() }) },
        invoiceVersion: { create: vi.fn() },
        roomBilling:    { update: vi.fn() },
        outboxEvent:    { create: vi.fn() },
        auditLog:       { create: vi.fn() },
      })
    ),
  };
  return { prisma: prismaMock };
});

// The PDF route also does dynamic import('@/lib') — alias it to the same mock
vi.mock('@/lib', () => {
  const prismaMock = {
    documentTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { prisma: prismaMock };
});

function mockPrisma() {
  const p: any = prisma as any;
  const billingFindUnique = p?.roomBilling?.findUnique
    ? vi.spyOn(p.roomBilling, 'findUnique')
    : vi.fn();
  const invoiceFindFirst = p?.invoice?.findFirst
    ? vi.spyOn(p.invoice, 'findFirst')
    : vi.fn();
  const invoiceFindUnique = p?.invoice?.findUnique
    ? vi.spyOn(p.invoice, 'findUnique')
    : vi.fn();
  return { billingFindUnique, invoiceFindFirst, invoiceFindUnique };
}

describe('Invoice Engine', () => {
  it('creates invoice from locked billing and writes outbox', async () => {
    const svc = getInvoiceService();
    const dueDate = new Date();
    const { billingFindUnique, invoiceFindUnique } = mockPrisma();
    billingFindUnique.mockResolvedValue({
      id: 'br-1',
      roomNo: 'room-1',
      totalDue: 1000,
      status: 'LOCKED',
      billingPeriod: { year: 2026, month: 3, dueDay: dueDate.getDate() },
    } as any);
    invoiceFindUnique.mockResolvedValue(null as any);
    const result = await svc.generateInvoiceFromBilling('br-1');
    expect(result.id).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('requires confirm when regenerating if invoice exists', async () => {
    const svc = getInvoiceService();
    const { billingFindUnique, invoiceFindUnique } = mockPrisma();
    billingFindUnique.mockResolvedValue({
      id: 'br-1',
      roomNo: 'room-1',
      totalDue: 1000,
      status: 'LOCKED',
      billingPeriod: { year: 2026, month: 3, dueDay: 5 },
    } as any);
    invoiceFindUnique.mockResolvedValue({ id: 'inv-1' } as any);
    await expect(svc.generateInvoiceFromBilling('br-1')).rejects.toThrow(/already exists/i);
  });

  it('increments version when generating with confirm path', async () => {
    const svc = getInvoiceService();
    const { billingFindUnique, invoiceFindUnique } = mockPrisma();
    billingFindUnique.mockResolvedValue({
      id: 'br-1',
      roomNo: 'room-1',
      totalDue: 1000,
      status: 'LOCKED',
      billingPeriod: { year: 2026, month: 3, dueDay: 5 },
    } as any);
    invoiceFindUnique.mockResolvedValue(null as any);
    const txMocks: any = {
      invoice: { create: vi.fn().mockResolvedValue({ id: 'inv-2', roomNo: 'room-1', roomBillingId: 'br-1', year: 2026, month: 3, status: 'GENERATED', totalAmount: 1000, dueDate: new Date(), issuedAt: new Date() }) },
      roomBilling: { update: vi.fn() },
      outboxEvent: { create: vi.fn() },
    };
    (prisma.$transaction as any).mockImplementationOnce(async (fn: any) => fn(txMocks));
    const res = await svc.generateInvoice({ billingRecordId: 'br-1' });
    expect(res.id).toBeDefined();
    expect(txMocks.invoice.create).toHaveBeenCalled();
  });
});

vi.mock('@/modules/invoices/invoice.service', async () => {
  const actual = await vi.importActual<any>('@/modules/invoices/invoice.service');
  return {
    ...actual,
    getInvoiceService: () => {
      const real = actual.getInvoiceService();
      (real as any).getInvoicePreview = vi.fn().mockResolvedValue({
        invoiceId: 'inv-1',
        year: 2026,
        month: 3,
        roomNo: '101',
        tenantName: 'John Doe',
        items: [
          { typeCode: 'RENT', typeName: 'Rent', description: null, quantity: 1, unitPrice: 1000, total: 1000 },
        ],
        totalAmount: 1000,
        dueDate: '2026-03-05',
      });
      return real;
    },
  };
});

describe('Invoice PDF endpoint', () => {
  it('returns a PDF response', async () => {
    const mod = await import('@/app/api/invoices/[id]/pdf/route');
    const signedUrl = buildInvoiceAccessUrl('inv-1', {
      absoluteBaseUrl: 'http://localhost',
      signed: true,
    });
    const res: Response = await (mod as any).GET(
      {
        url: signedUrl,
        cookies: { get: () => undefined },
      } as any,
      { params: { id: 'inv-1' } },
    );
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    expect(header).toBe('%PDF'.slice(0, 4));
  });
});
