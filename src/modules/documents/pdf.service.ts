/**
 * PDF generation using Puppeteer (Chromium).
 *
 * Advantages over pdf-lib:
 *   - Full CSS layout support (flexbox, grid, tables)
 *   - Embedded web fonts (NotoSansThai, Sarabun)
 *   - Multi-page with proper page-break handling
 *   - Backgrounds, borders, shadows — all preserved
 *   - Pixel-perfect match to browser print output
 */
import { htmlToPdfBuffer } from '@/lib/puppeteer';

export type PdfOptions = {
  title?: string;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
};

export async function generateDocumentPdf(
  title: string,
  html: string,
  options: PdfOptions = {},
): Promise<Uint8Array> {
  const buffer = await htmlToPdfBuffer(html, {
    title,
    pageSize: options.pageSize ?? 'A4',
    orientation: options.orientation ?? 'portrait',
    marginTop: options.marginTop ?? '15mm',
    marginBottom: options.marginBottom ?? '15mm',
    marginLeft: options.marginLeft ?? '15mm',
    marginRight: options.marginRight ?? '15mm',
    printBackground: true,
    scale: 1,
  });

  return new Uint8Array(buffer);
}
