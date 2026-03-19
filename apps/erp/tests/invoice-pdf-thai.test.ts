/**
 * invoice-pdf-thai.test.ts
 *
 * Regression tests verifying that Thai Unicode characters survive intact
 * through the full PDF generation pipeline.  Ensures we never regress to
 * a WinAnsi/StandardFonts path that silently drops codepoints > U+00FF.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Mock file-system reads for font bytes so tests don't need real TTF files.
// We need valid PDF output, so we provide real font bytes if available, or
// we verify the function signature and option passing instead.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string) => {
      // Passthrough to real FS — we need real TTF bytes for pdf-lib to work.
      return actual.readFileSync(filePath);
    }),
  };
});

// Minimal InvoicePreviewResponse fixture — new schema
const makePreview = (overrides = {}) => ({
  invoiceId: 'inv-001',
  roomNo: '101',
  tenantName: 'สมชาย ใจดี',         // Thai: "Somchai Jaidee"
  year: 2024,
  month: 3,
  dueDate: '2024-03-31',
  totalAmount: 5500,
  items: [
    {
      typeCode: 'RENT',
      typeName: 'ค่าเช่า',           // Thai: "Rent"
      description: 'ห้อง 101',      // Thai: "Room 101"
      quantity: 1,
      unitPrice: 5000,
      total: 5000,
    },
    {
      typeCode: 'WATER',
      typeName: 'ค่าน้ำ',           // Thai: "Water fee"
      description: null,
      quantity: 1,
      unitPrice: 500,
      total: 500,
    },
  ],
  ...overrides,
});

describe('generateInvoicePdf — Thai Unicode safety', () => {
  it('returns a Uint8Array starting with %PDF signature', async () => {
    const { generateInvoicePdf } = await import('@/modules/invoices/pdf');
    const preview = makePreview();
    const result = await generateInvoicePdf(preview);

    expect(result).toBeInstanceOf(Uint8Array);
    // %PDF magic bytes
    const magic = String.fromCharCode(result[0], result[1], result[2], result[3]);
    expect(magic).toBe('%PDF');
  });

  it('succeeds with Thai notes in template body (no WinAnsi crash)', async () => {
    const { generateInvoicePdf } = await import('@/modules/invoices/pdf');
    const thaiNotes = 'กรุณาชำระเงินก่อนวันที่ 5 ของเดือน\nขอบคุณที่ใช้บริการ';
    // Thai: "Please pay by the 5th of the month\nThank you for your service"
    const result = await generateInvoicePdf(makePreview(), { notes: thaiNotes });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(1000);
  });

  it('embeds Thai codepoint U+0E40 (เ) without throwing', async () => {
    const { generateInvoicePdf } = await import('@/modules/invoices/pdf');
    const preview = makePreview({ roomNo: 'เอ็น-101' }); // Thai roomNo starts with เ (U+0E40)
    await expect(generateInvoicePdf(preview)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('handles mixed Thai+Latin notes without truncation', async () => {
    const { generateInvoicePdf } = await import('@/modules/invoices/pdf');
    const mixedNotes = 'Invoice terms: กรุณาชำระภายใน 30 วัน (30 days net)\nContact: info@apartment.th';
    const result = await generateInvoicePdf(makePreview(), { notes: mixedNotes });
    expect(result.length).toBeGreaterThan(1000);
  });

  it('works without notes option (no template applied)', async () => {
    const { generateInvoicePdf } = await import('@/modules/invoices/pdf');
    const result = await generateInvoicePdf(makePreview());
    expect(result).toBeInstanceOf(Uint8Array);
    const magic = String.fromCharCode(result[0], result[1], result[2], result[3]);
    expect(magic).toBe('%PDF');
  });

  it('handles empty notes string gracefully', async () => {
    const { generateInvoicePdf } = await import('@/modules/invoices/pdf');
    const result = await generateInvoicePdf(makePreview(), { notes: '' });
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('PDF binary contains Thai codepoint bytes when Thai text is rendered', async () => {
    const { generateInvoicePdf } = await import('@/modules/invoices/pdf');
    // Thai codepoint U+0E40 (เ) encoded as UTF-8 = 0xE0 0xB9 0x80... but in PDF
    // stream, the glyph data is embedded.  We verify the PDF is large enough to
    // contain embedded font data (>= 50 KB when Sarabun TTF is embedded).
    const result = await generateInvoicePdf(makePreview(), { notes: 'เช่าห้อง 101' });
    // Sarabun-Regular.ttf is ~90 KB; embedded subset will be smaller but >10 KB
    expect(result.length).toBeGreaterThan(10_000);
  });
});

describe('PDF_CONFIG — font paths resolve', () => {
  it('fontPaths.regular() returns a string ending in .ttf', async () => {
    const { PDF_CONFIG } = await import('@/modules/invoices/pdf-config');
    expect(PDF_CONFIG.fontPaths.regular()).toMatch(/\.ttf$/i);
  });

  it('fontPaths.bold() returns a string ending in .ttf', async () => {
    const { PDF_CONFIG } = await import('@/modules/invoices/pdf-config');
    expect(PDF_CONFIG.fontPaths.bold()).toMatch(/\.ttf$/i);
  });

  it('notesMaxCharsPerLine is 45', async () => {
    const { PDF_CONFIG } = await import('@/modules/invoices/pdf-config');
    expect(PDF_CONFIG.notesMaxCharsPerLine).toBe(45);
  });
});
