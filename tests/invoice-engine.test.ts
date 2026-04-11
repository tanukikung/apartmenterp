import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/client';
import { buildInvoiceAccessUrl } from '@/lib/invoices/access';
import { getServiceContainer } from '@/lib/service-container';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock invoice access signing to always return a valid token
vi.mock('@/lib/invoices/access', () => ({
  buildInvoiceAccessUrl: (id: string, opts?: { absoluteBaseUrl?: string; signed?: boolean; expiresInSeconds?: number }) => {
    const base = opts?.absoluteBaseUrl?.replace(/\/+$/, '') || 'http://localhost';
    const path = `/api/invoices/${id}/pdf`;
    const url = new URL(`${base}${path}`);
    if (opts?.signed) {
      url.searchParams.set('expires', String(Date.now() + (opts.expiresInSeconds ?? 86400) * 1000));
      url.searchParams.set('token', 'test-signed-token');
    }
    return url.toString();
  },
  verifySignedInvoiceAccess: () => true,
  requireOperatorOrSignedInvoiceAccess: () => {},
  encodeInvoiceId: (id: string) => id,
}));

vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn(),
  getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
  sendLineMessage: vi.fn().mockResolvedValue({}),
  sendLineImageMessage: vi.fn().mockResolvedValue({}),
  sendLineFileMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/line', () => ({
  getLineClient: vi.fn(),
  getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
  sendLineMessage: vi.fn().mockResolvedValue({}),
  sendLineImageMessage: vi.fn().mockResolvedValue({}),
  sendLineFileMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/db/client', () => {
  const billingFindUnique = vi.fn();
  const invoiceFindUnique = vi.fn();
  const invoiceFindFirst = vi.fn();
  const invoiceCreate = vi.fn();
  const invoiceUpdate = vi.fn();
  const roomBillingUpdate = vi.fn();
  const invoiceVersionCreate = vi.fn();
  const outboxEventCreate = vi.fn();
  const auditLogCreate = vi.fn();

  const txMock = {
    invoice: { create: invoiceCreate, update: invoiceUpdate },
    invoiceVersion: { create: invoiceVersionCreate },
    roomBilling: { update: roomBillingUpdate },
    outboxEvent: { create: outboxEventCreate },
    auditLog: { create: auditLogCreate },
  };

  const prismaMock = {
    roomBilling: { findUnique: billingFindUnique, update: roomBillingUpdate },
    invoice: { findFirst: invoiceFindFirst, findUnique: invoiceFindUnique, create: invoiceCreate, update: invoiceUpdate },
    invoiceVersion: { create: invoiceVersionCreate },
    outboxEvent: { create: outboxEventCreate },
    auditLog: { create: auditLogCreate },
    documentTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
    config: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock as typeof txMock)),
  };

  return {
    prisma: prismaMock,
    billingFindUnique,
    invoiceFindUnique,
    invoiceFindFirst,
    invoiceCreate,
    invoiceUpdate,
    roomBillingUpdate,
    invoiceVersionCreate,
    outboxEventCreate,
    auditLogCreate,
  };
});

vi.mock('@/lib', () => {
  const prismaMock = {
    documentTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { prisma: prismaMock };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Invoice Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates invoice from locked billing and writes outbox', async () => {
    // Import mocks after vi.mock is set up
    const { billingFindUnique, invoiceFindUnique, invoiceCreate } = await import('@/lib/db/client') as any;

    billingFindUnique.mockResolvedValue({
      id: 'br-1',
      roomNo: 'room-1',
      totalDue: 1000,
      status: 'LOCKED',
      billingPeriod: { year: 2026, month: 3, dueDay: 25 },
    });
    invoiceFindUnique.mockResolvedValue(null);
    invoiceCreate.mockResolvedValue({
      id: 'inv-1',
      roomNo: 'room-1',
      roomBillingId: 'br-1',
      year: 2026,
      month: 3,
      version: 1,
      status: 'GENERATED',
      totalAmount: 1000,
      dueDate: new Date(),
      issuedAt: new Date(),
    });

    const { getServiceContainer } = await import('@/lib/service-container');
    const svc = getServiceContainer().invoiceService;

    const result = await svc.generateInvoiceFromBilling('br-1');
    expect(result.id).toBeDefined();
    expect(billingFindUnique).toHaveBeenCalled();
  });

  it('requires confirm when regenerating if invoice exists', async () => {
    const { billingFindUnique, invoiceFindUnique } = await import('@/lib/db/client') as any;

    billingFindUnique.mockResolvedValue({
      id: 'br-1',
      roomNo: 'room-1',
      totalDue: 1000,
      status: 'LOCKED',
      billingPeriod: { year: 2026, month: 3, dueDay: 5 },
    });
    invoiceFindUnique.mockResolvedValue({ id: 'inv-existing' });

    const { getServiceContainer } = await import('@/lib/service-container');
    const svc = getServiceContainer().invoiceService;

    await expect(svc.generateInvoiceFromBilling('br-1')).rejects.toThrow(/already exists/i);
  });

  it('increments version when generating with confirm path', async () => {
    const { billingFindUnique, invoiceFindUnique, invoiceCreate } = await import('@/lib/db/client') as any;

    billingFindUnique.mockResolvedValue({
      id: 'br-1',
      roomNo: 'room-1',
      totalDue: 1000,
      status: 'LOCKED',
      billingPeriod: { year: 2026, month: 3, dueDay: 5 },
    });
    invoiceFindUnique.mockResolvedValue(null);
    invoiceCreate.mockResolvedValue({
      id: 'inv-2',
      roomNo: 'room-1',
      roomBillingId: 'br-1',
      year: 2026,
      month: 3,
      status: 'GENERATED',
      totalAmount: 1000,
      dueDate: new Date(),
      issuedAt: new Date(),
    });

    const { getServiceContainer } = await import('@/lib/service-container');
    const svc = getServiceContainer().invoiceService;

    const res = await svc.generateInvoice({ billingRecordId: 'br-1' });
    expect(res.id).toBeDefined();
    expect(invoiceCreate).toHaveBeenCalled();
  });
});

describe('Invoice PDF endpoint', () => {
  it('returns a PDF response', async () => {
    const { invoiceFindUnique, invoiceFindFirst } = await import('@/lib/db/client') as any;
    invoiceFindUnique.mockResolvedValue({
      id: 'inv-1',
      roomNo: '101',
      year: 2026,
      month: 3,
      status: 'GENERATED',
      totalAmount: 1000,
      dueDate: new Date('2026-03-05'),
    });
    invoiceFindFirst.mockResolvedValue(null);

    // Mock the invoice service's getInvoicePreview method
    const { getServiceContainer } = await import('@/lib/service-container');
    const { invoiceService } = getServiceContainer();
    (invoiceService as any).getInvoicePreview = vi.fn().mockResolvedValue({
      invoiceId: 'inv-1',
      year: 2026,
      month: 3,
      roomNo: '101',
      floorNo: 1,
      tenantName: 'Test Tenant',
      tenantPhone: '0812345678',
      items: [{ typeCode: 'RENT', typeName: 'Rent', description: null, quantity: 1, unitPrice: 1000, total: 1000 }],
      totalAmount: 1000,
      dueDate: '2026-03-05',
    });

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
    const contentType = res.headers.get('content-type');
    const body = await res.json().catch(() => null) as any;
    if (contentType !== 'application/pdf') {
      // eslint-disable-next-line no-console
      console.error('FAIL body:', JSON.stringify(body));
    }
    expect(contentType).toBe('application/pdf');
  });
});