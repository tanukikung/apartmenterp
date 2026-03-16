/**
 * invoice-pdf-endpoint.test.ts
 *
 * Integration-style test for GET /api/invoices/[id]/pdf
 *
 * Mocks:
 *  - @/lib/db/client (prisma)          — via setup-mocks.ts global mock
 *  - @/modules/invoices/invoice.service — getInvoiceService().getInvoicePreview()
 *  - @/modules/invoices/pdf            — generateInvoicePdf() returns mock bytes
 *
 * NOTE: The active route is at app/api/invoices/[id]/pdf/route.ts (plural).
 *       The previous version incorrectly referenced the singular path
 *       /api/invoice/[id]/pdf which does not exist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the invoice service ──────────────────────────────────────────────────
vi.mock('@/modules/invoices/invoice.service', () => ({
  getInvoiceService: () => ({
    getInvoicePreview: vi.fn(async () => ({
      invoiceId: 'test-invoice-id',
      buildingName: 'Test Building',
      roomNumber: '101',
      tenantName: 'สมชาย ใจดี',     // Thai name — must survive unmodified
      year: 2024,
      month: 3,
      version: 1,
      dueDate: '2024-03-31',
      subtotal: 5000,
      totalAmount: 5500,
      items: [],
    })),
  }),
}));

// ── Mock the PDF generator — return a realistic %PDF header ──────────────────
vi.mock('@/modules/invoices/pdf', () => ({
  generateInvoicePdf: vi.fn(async () => {
    const header = '%PDF-1.7\n%Mock-Sarabun-Thai\n';
    return new Uint8Array(Buffer.from(header, 'utf-8'));
  }),
}));

// ── documentTemplate must be available in the prisma mock ────────────────────
// (The route does: prisma.documentTemplate.findFirst({ where: { type: 'INVOICE' } }))
// setup-mocks.ts provides the global prisma mock; we extend it here.
vi.mock('@/lib/db/client', async () => {
  const { mockPrismaClient } = await import('./mocks/prisma');
  const client = mockPrismaClient();
  // Return null template — route handles this gracefully (no notes applied)
  client.documentTemplate.findFirst.mockResolvedValue(null);
  return { prisma: client };
});

// ── Also mock @/lib so dynamic import('@/lib') inside route works ─────────────
vi.mock('@/lib', async () => {
  const { mockPrismaClient } = await import('./mocks/prisma');
  const client = mockPrismaClient();
  client.documentTemplate.findFirst.mockResolvedValue(null);
  return { prisma: client };
});

describe('GET /api/invoices/[id]/pdf', () => {
  const INVOICE_ID = '123e4567-e89b-12d3-a456-426614174000';

  it('returns 200 with content-type application/pdf', async () => {
    const mod = await import('@/app/api/invoices/[id]/pdf/route');
    const req: any = {
      url: `http://localhost/api/invoices/${INVOICE_ID}/pdf`,
      nextUrl: new URL(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
    };

    const res: Response = await (mod as any).GET(req, { params: { id: INVOICE_ID } });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('returns %PDF magic bytes in body', async () => {
    const mod = await import('@/app/api/invoices/[id]/pdf/route');
    const req: any = {
      url: `http://localhost/api/invoices/${INVOICE_ID}/pdf`,
      nextUrl: new URL(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
    };

    const res: Response = await (mod as any).GET(req, { params: { id: INVOICE_ID } });
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    expect(magic).toBe('%PDF');
  });

  it('sets cache-control: no-store', async () => {
    const mod = await import('@/app/api/invoices/[id]/pdf/route');
    const req: any = {
      url: `http://localhost/api/invoices/${INVOICE_ID}/pdf`,
      nextUrl: new URL(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
    };

    const res: Response = await (mod as any).GET(req, { params: { id: INVOICE_ID } });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('sets content-disposition inline with invoice filename', async () => {
    const mod = await import('@/app/api/invoices/[id]/pdf/route');
    const req: any = {
      url: `http://localhost/api/invoices/${INVOICE_ID}/pdf`,
      nextUrl: new URL(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
    };

    const res: Response = await (mod as any).GET(req, { params: { id: INVOICE_ID } });
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain('inline');
    expect(cd).toContain(INVOICE_ID);
  });

  it('does NOT include x-document-template-id when no template exists', async () => {
    const mod = await import('@/app/api/invoices/[id]/pdf/route');
    const req: any = {
      url: `http://localhost/api/invoices/${INVOICE_ID}/pdf`,
      nextUrl: new URL(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
    };

    const res: Response = await (mod as any).GET(req, { params: { id: INVOICE_ID } });
    expect(res.headers.get('x-document-template-id')).toBeNull();
  });
});
