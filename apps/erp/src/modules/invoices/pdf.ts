/**
 * Invoice PDF generation — Unicode/Thai-safe via pdf-lib + fontkit.
 *
 * Fonts: Sarabun (Regular + Bold), an OFL-licensed Google Font that covers
 * both Latin (U+0000–U+00FF) and Thai (U+0E01–U+0E5B) in a single TTF file.
 *
 * Layout constants and font paths are centralised in pdf-config.ts.
 * NEVER import StandardFonts from pdf-lib here — WinAnsi tops out at U+00FF
 * and will crash on any Thai codepoint (U+0E00+).
 */
import { PDFDocument, rgb } from 'pdf-lib';
// @pdf-lib/fontkit ESM default export — Next.js webpack resolves the ESM
// bundle (dist/fontkit.es.js) which exports "export default fontkit".
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import type { InvoicePreviewResponse } from './types';
import { PDF_CONFIG } from './pdf-config';

export interface InvoicePdfOptions {
  /** Free-text block appended as a "Notes / Terms" footer in the PDF. */
  notes?: string;
  /** ID of the DocumentTemplate record that provided the notes. */
  templateId?: string;
}

export async function generateInvoicePdf(
  preview: InvoicePreviewResponse,
  opts?: InvoicePdfOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  // ── Register fontkit so pdf-lib can embed TTF/OTF fonts ──────────────────
  doc.registerFontkit(fontkit);

  // ── Embed Sarabun (supports Thai + Latin in one file) ────────────────────
  const regularBytes = readFileSync(PDF_CONFIG.fontPaths.regular());
  const boldBytes    = readFileSync(PDF_CONFIG.fontPaths.bold());
  const font = await doc.embedFont(regularBytes);
  const bold = await doc.embedFont(boldBytes);

  // ── Page setup ────────────────────────────────────────────────────────────
  const page = doc.addPage([PDF_CONFIG.page.width, PDF_CONFIG.page.height]); // A4
  let y = 800;

  const draw = (text: string, x: number, size = 12, b = false): void => {
    page.drawText(text, { x, y, size, font: b ? bold : font, color: rgb(0, 0, 0) });
    y -= size + 6;
  };

  // ── Header ────────────────────────────────────────────────────────────────
  draw('INVOICE', PDF_CONFIG.page.marginLeft, 22, true);
  draw(`${preview.buildingName}`, PDF_CONFIG.page.marginLeft, 14, true);
  draw(`Room: ${preview.roomNumber}`, PDF_CONFIG.page.marginLeft, 12);
  draw(`Tenant: ${preview.tenantName || '-'}`, PDF_CONFIG.page.marginLeft, 12);
  draw(
    `Year/Month: ${preview.year}-${String(preview.month).padStart(2, '0')}  Version: v${preview.version}`,
    PDF_CONFIG.page.marginLeft,
    12,
  );
  draw(`Due Date: ${preview.dueDate}`, PDF_CONFIG.page.marginLeft, 12);

  y -= 6;
  page.drawLine({
    start: { x: PDF_CONFIG.page.marginLeft, y },
    end:   { x: PDF_CONFIG.page.marginRight, y },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 12;

  // ── Line-item table ───────────────────────────────────────────────────────
  const headers = ['Item', 'Qty', 'Unit', 'Total'];
  const cols = [50, 330, 410, 480];

  headers.forEach((h, i) => {
    page.drawText(h, { x: cols[i], y, size: 12, font: bold });
  });
  y -= 16;

  for (const item of preview.items) {
    const name = [item.typeName, item.description || ''].filter(Boolean).join(' - ');
    page.drawText(name,                      { x: cols[0], y, size: 11, font });
    page.drawText(String(item.quantity),     { x: cols[1], y, size: 11, font });
    page.drawText(item.unitPrice.toFixed(2), { x: cols[2], y, size: 11, font });
    page.drawText(item.total.toFixed(2),     { x: cols[3], y, size: 11, font });
    y -= 14;
    if (y < 100) {
      y = 780;
      doc.addPage([PDF_CONFIG.page.width, PDF_CONFIG.page.height]);
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  y -= 6;
  page.drawLine({
    start: { x: PDF_CONFIG.page.marginLeft, y },
    end:   { x: PDF_CONFIG.page.marginRight, y },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 18;
  page.drawText('Subtotal:', { x: 380, y, size: 12, font: bold });
  page.drawText(preview.subtotal.toFixed(2), { x: 480, y, size: 12, font });
  y -= 16;
  page.drawText('Total:', { x: 380, y, size: 14, font: bold });
  page.drawText(preview.totalAmount.toFixed(2), { x: 480, y, size: 14, font: bold });

  // ── Notes / Terms section (from DocumentTemplate.body — may contain Thai) ─
  if (opts?.notes) {
    y -= 30;
    page.drawLine({
      start: { x: PDF_CONFIG.page.marginLeft, y },
      end:   { x: PDF_CONFIG.page.marginRight, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 14;
    page.drawText('Notes / Terms:', {
      x: PDF_CONFIG.page.marginLeft,
      y,
      size: 10,
      font: bold,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 14;

    // ── Thai-safe line rendering ──────────────────────────────────────────
    // Thai text does not separate words with spaces; wrap at a fixed
    // character count which works for both Thai and Latin at 9pt.
    const MAX_CHARS = PDF_CONFIG.notesMaxCharsPerLine;

    for (const rawLine of opts.notes.split('\n')) {
      if (y < 60) break;

      if (rawLine.trim() === '') {
        y -= 8; // blank line gap
        continue;
      }

      // Emit chunks of at most MAX_CHARS chars from this line
      let remaining = rawLine;
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, MAX_CHARS);
        remaining   = remaining.slice(MAX_CHARS);
        page.drawText(chunk, {
          x: PDF_CONFIG.page.marginLeft,
          y,
          size: 9,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 12;
        if (y < 60) break;
      }
    }
  }

  const pdf = await doc.save();
  return pdf;
}
