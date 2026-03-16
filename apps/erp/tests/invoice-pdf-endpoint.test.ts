import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/invoices/invoice-pdf.service', () => {
  return {
    getInvoicePDFService: () => ({
      generateInvoicePDF: vi.fn(async () => {
        // Minimal PDF header bytes to satisfy checks
        const header = '%PDF-1.4\n%Mock PDF\n';
        return Buffer.from(header, 'utf-8');
      }),
    }),
  };
});

describe('Singular Invoice PDF endpoint', () => {
  it('returns a PDF response', async () => {
    const mod = await import('@/app/api/invoice/[id]/pdf/route');
    const req: any = {
      url: 'http://localhost/api/invoice/123e4567-e89b-12d3-a456-426614174000/pdf?download=false',
      nextUrl: new URL('http://localhost/api/invoice/123e4567-e89b-12d3-a456-426614174000/pdf?download=false'),
    };
    const res: Response = await (mod as any).GET(req, {
      params: { id: '123e4567-e89b-12d3-a456-426614174000' },
    });
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    expect(header).toBe('%PDF'.slice(0, 4));
  });
});
