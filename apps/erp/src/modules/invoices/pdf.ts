import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { InvoicePreviewResponse } from './types';

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
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const draw = (text: string, x: number, size = 12, b = false) => {
    page.drawText(text, { x, y, size, font: b ? bold : font, color: rgb(0, 0, 0) });
    y -= size + 6;
  };
  draw('INVOICE', 50, 22, true);
  draw(`${preview.buildingName}`, 50, 14, true);
  draw(`Room: ${preview.roomNumber}`, 50, 12);
  draw(`Tenant: ${preview.tenantName || '-'}`, 50, 12);
  draw(`Year/Month: ${preview.year}-${String(preview.month).padStart(2, '0')}  Version: v${preview.version}`, 50, 12);
  draw(`Due Date: ${preview.dueDate}`, 50, 12);
  y -= 6;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
  y -= 12;
  const headers = ['Item', 'Qty', 'Unit', 'Total'];
  const cols = [50, 330, 410, 480];
  page.drawText(headers[0], { x: cols[0], y, size: 12, font: bold });
  page.drawText(headers[1], { x: cols[1], y, size: 12, font: bold });
  page.drawText(headers[2], { x: cols[2], y, size: 12, font: bold });
  page.drawText(headers[3], { x: cols[3], y, size: 12, font: bold });
  y -= 16;
  for (const item of preview.items) {
    const name = [item.typeName, item.description || ''].filter(Boolean).join(' - ');
    page.drawText(name, { x: cols[0], y, size: 11, font });
    page.drawText(String(item.quantity), { x: cols[1], y, size: 11, font });
    page.drawText(item.unitPrice.toFixed(2), { x: cols[2], y, size: 11, font });
    page.drawText(item.total.toFixed(2), { x: cols[3], y, size: 11, font });
    y -= 14;
    if (y < 100) {
      y = 780;
      doc.addPage([595.28, 841.89]);
    }
  }
  y -= 6;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;
  page.drawText('Subtotal:', { x: 380, y, size: 12, font: bold });
  page.drawText(preview.subtotal.toFixed(2), { x: 480, y, size: 12, font });
  y -= 16;
  page.drawText('Total:', { x: 380, y, size: 14, font: bold });
  page.drawText(preview.totalAmount.toFixed(2), { x: 480, y, size: 14, font: bold });

  // ── Notes / Terms section (populated from DocumentTemplate.body) ──────────
  if (opts?.notes) {
    y -= 30;
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 14;
    page.drawText('Notes / Terms:', { x: 50, y, size: 10, font: bold, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;
    // Render template body, wrapping at ~90 chars per line (basic word wrap).
    const words = opts.notes.replace(/\n/g, ' ').split(' ');
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 90) {
        if (line.trim()) {
          page.drawText(line.trim(), { x: 50, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
          y -= 12;
          if (y < 60) break; // guard page overflow
        }
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line.trim() && y >= 60) {
      page.drawText(line.trim(), { x: 50, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    }
  }

  const pdf = await doc.save();
  return pdf;
}
