import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInvoiceAccessUrl } from '@/lib/invoices/access';
import { makeRequestLike } from './helpers/auth';

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
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

const markInvoiceViewedMock = vi.fn(async () => ({
  id: 'test-invoice-id',
  status: 'VIEWED',
}));

vi.mock('@/lib/service-container', () => ({
  getServiceContainer: () => ({
    invoiceService: {
      getInvoicePreview: vi.fn(async () => ({
        invoiceId: 'test-invoice-id',
        buildingName: 'Test Building',
        roomNumber: '101',
        tenantName: 'Somchai Jaidee',
        year: 2024,
        month: 3,
        version: 1,
        dueDate: '2024-03-31',
        subtotal: 5000,
        totalAmount: 5500,
        items: [],
      })),
      markInvoiceViewed: markInvoiceViewedMock,
    },
    eventBus: { publish: vi.fn(), subscribe: vi.fn() },
  }),
}));

vi.mock('@/modules/invoices/pdf', () => ({
  generateInvoicePdf: vi.fn(async () => {
    const header = '%PDF-1.7\n%Mock\n';
    return new Uint8Array(Buffer.from(header, 'utf-8'));
  }),
}));

vi.mock('@/lib/db/client', async () => {
  const { mockPrismaClient } = await import('./mocks/prisma');
  const client = mockPrismaClient();
  client.documentTemplate.findFirst.mockResolvedValue(null);
  client.config.findMany.mockResolvedValue([]);
  return { prisma: client };
});

vi.mock('@/lib', async () => {
  const { mockPrismaClient } = await import('./mocks/prisma');
  const client = mockPrismaClient();
  client.documentTemplate.findFirst.mockResolvedValue(null);
  client.config.findMany.mockResolvedValue([]);
  return { prisma: client };
});

describe('Invoice public access hardening', () => {
  const INVOICE_ID = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies anonymous unsigned PDF access', async () => {
    const mod = await import('@/app/api/invoices/[id]/pdf/route');

    const res: Response = await (mod as any).GET(
      makeRequestLike({
        url: `http://localhost/api/invoices/${INVOICE_ID}/pdf`,
        method: 'GET',
      }) as any,
      { params: { id: INVOICE_ID } },
    );

    expect(res.status).toBe(401);
  });

  it('allows signed expiring PDF access', async () => {
    const mod = await import('@/app/api/invoices/[id]/pdf/route');
    const signedUrl = buildInvoiceAccessUrl(INVOICE_ID, {
      absoluteBaseUrl: 'http://localhost',
      signed: true,
    });

    const res: Response = await (mod as any).GET(
      makeRequestLike({
        url: signedUrl,
        method: 'GET',
      }) as any,
      { params: { id: INVOICE_ID } },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('%PDF');
  });

  it('allows authenticated operators to access invoice PDFs without signed tokens', async () => {
    const mod = await import('@/app/api/invoices/[id]/pdf/route');

    const res: Response = await (mod as any).GET(
      makeRequestLike({
        url: `http://localhost/api/invoices/${INVOICE_ID}/pdf`,
        method: 'GET',
        role: 'ADMIN',
      }) as any,
      { params: { id: INVOICE_ID } },
    );

    expect(res.status).toBe(200);
  });

  it('denies anonymous unsigned invoice view tracking', async () => {
    const mod = await import('@/app/api/invoices/[id]/view/route');

    const res: Response = await (mod as any).POST(
      makeRequestLike({
        url: `http://localhost/api/invoices/${INVOICE_ID}/view`,
        method: 'POST',
      }) as any,
      { params: { id: INVOICE_ID } },
    );

    expect(res.status).toBe(401);
    expect(markInvoiceViewedMock).not.toHaveBeenCalled();
  });

  it('allows signed expiring invoice view tracking', async () => {
    const mod = await import('@/app/api/invoices/[id]/view/route');
    // The view route uses requireRole (ADMIN/STAFF), not signed token auth.
    // Use a real auth cookie with ADMIN role.
    const signedUrl = buildInvoiceAccessUrl(INVOICE_ID, {
      absoluteBaseUrl: 'http://localhost',
      action: 'view',
      signed: true,
    });

    const res: Response = await (mod as any).POST(
      makeRequestLike({
        url: signedUrl,
        method: 'POST',
        role: 'ADMIN',
      }) as any,
      { params: { id: INVOICE_ID } },
    );

    expect(res.status).toBe(200);
    expect(markInvoiceViewedMock).toHaveBeenCalledWith(INVOICE_ID);
  });
});
