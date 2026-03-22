/**
 * invoice-pdf.service.ts — Legacy InvoicePDFService with QR, cache, storage.
 *
 * IMPORTANT: This service previously used StandardFonts.Helvetica (WinAnsi,
 * U+0000–U+00FF only) which crashes on Thai text.  It has been migrated to
 * use Sarabun TTF via @pdf-lib/fontkit — the same font as the active pdf.ts
 * path — so that all code paths are Thai-safe.
 *
 * Font paths are imported from pdf-config.ts (single source of truth).
 */
import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { prisma } from '@/lib';
import { logger } from '@/lib/utils/logger';
import { NotFoundError } from '@/lib/utils/errors';
import * as QRCode from 'qrcode';
import { config } from '@/config';
import { PDF_CONFIG } from './pdf-config';

interface InvoicePDFData {
  apartmentName: string;
  roomNumber: string;
  tenantName: string;
  billingItems: Array<{
    description: string;
    amount: number;
    quantity: number;
    total: number;
  }>;
  totalAmount: number;
  dueDate: Date;
  invoiceNumber: string;
  qrCodeData: string;
}

interface PDFGenerationOptions {
  includeQRCode?: boolean;
  template?: 'standard' | 'detailed';
}

export class InvoicePDFService {
  private readonly storagePath = '/storage/invoices';
  private readonly cachePath = '/storage/cache/invoices';

  constructor() {
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fsPromises.mkdir(this.storagePath, { recursive: true });
      await fsPromises.mkdir(this.cachePath, { recursive: true });
    } catch (error) {
      logger.error({
        type: 'invoice_storage_mkdir_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async generateInvoicePDF(
    invoiceId: string,
    options: PDFGenerationOptions = {}
  ): Promise<Buffer> {
    // Check cache first
    const cachedPDF = await this.getCachedPDF(invoiceId);
    if (cachedPDF) {
      logger.info({ type: 'invoice_pdf_cached_hit', invoiceId });
      return cachedPDF;
    }

    // Fetch invoice data
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        room: {
          include: {
            tenants: {
              where: { moveOutDate: null },
              include: { tenant: true },
            },
          },
        },
        roomBilling: true,
      },
    });

    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    const primaryTenant = (invoice.room as unknown as { tenants?: Array<{ tenant?: { firstName?: string; lastName?: string; lineUserId?: string | null } | null }> })?.tenants?.[0]?.tenant;
    if (!primaryTenant) throw new Error('No active tenant found for room');

    const computedInvoiceNumber = `INV-${invoice.year}${String(invoice.month).padStart(2, '0')}-${invoice.roomNo}`;
    const roomBilling = invoice.roomBilling;
    const billingItems: Array<{ description: string; amount: number; quantity: number; total: number }> = roomBilling
      ? [
          { description: 'Rent', amount: Number(roomBilling.rentAmount), quantity: 1, total: Number(roomBilling.rentAmount) },
          ...(Number(roomBilling.waterTotal) > 0 ? [{ description: 'Water', amount: Number(roomBilling.waterTotal), quantity: 1, total: Number(roomBilling.waterTotal) }] : []),
          ...(Number(roomBilling.electricTotal) > 0 ? [{ description: 'Electric', amount: Number(roomBilling.electricTotal), quantity: 1, total: Number(roomBilling.electricTotal) }] : []),
          ...(Number(roomBilling.furnitureFee) > 0 ? [{ description: 'Furniture', amount: Number(roomBilling.furnitureFee), quantity: 1, total: Number(roomBilling.furnitureFee) }] : []),
          ...(Number(roomBilling.otherFee) > 0 ? [{ description: 'Other', amount: Number(roomBilling.otherFee), quantity: 1, total: Number(roomBilling.otherFee) }] : []),
        ]
      : [];
    const pdfData: InvoicePDFData = {
      apartmentName: config.app.name,
      roomNumber: invoice.roomNo,
      tenantName: `${primaryTenant.firstName} ${primaryTenant.lastName}`,
      billingItems,
      totalAmount: Number(invoice.totalAmount),
      dueDate: invoice.dueDate,
      invoiceNumber: computedInvoiceNumber,
      qrCodeData: this.generateQRCodeData({
        id: invoice.id,
        invoiceNumber: computedInvoiceNumber,
        total: invoice.totalAmount,
        dueDate: invoice.dueDate,
        room: { roomNumber: invoice.roomNo },
      }),
    };

    const pdfBuffer = await this.createPDF(pdfData, options);
    await this.cachePDF(invoiceId, pdfBuffer);
    await this.saveToStorage(invoiceId, pdfBuffer);

    logger.info({ type: 'invoice_pdf_generated', invoiceId, size: pdfBuffer.length });
    return pdfBuffer;
  }

  private async createPDF(
    data: InvoicePDFData,
    options: PDFGenerationOptions
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();

    // ── Register fontkit + embed Sarabun (Thai-safe Unicode TTF) ─────────────
    pdfDoc.registerFontkit(fontkit);
    const regularBytes = readFileSync(PDF_CONFIG.fontPaths.regular());
    const boldBytes    = readFileSync(PDF_CONFIG.fontPaths.bold());
    const font     = await pdfDoc.embedFont(regularBytes);
    const boldFont = await pdfDoc.embedFont(boldBytes);

    const page = pdfDoc.addPage([PDF_CONFIG.page.width, PDF_CONFIG.page.height]); // A4
    const { height } = page.getSize();

    const black     = rgb(0, 0, 0);
    const gray      = rgb(0.5, 0.5, 0.5);
    const lightGray = rgb(0.95, 0.95, 0.95);

    let yPosition = height - 50;

    this.drawHeader(page, data, boldFont, black, yPosition);
    yPosition -= 100;

    this.drawInvoiceInfo(page, data, font, boldFont, gray, black, yPosition);
    yPosition -= 80;

    yPosition = this.drawBillingItems(
      page, data.billingItems, font, boldFont, gray, black, lightGray, yPosition
    );

    yPosition -= 30;
    this.drawTotal(page, data.totalAmount, boldFont, black, yPosition);

    if (options.includeQRCode !== false) {
      yPosition -= 100;
      await this.drawQRCode(pdfDoc, page, data.qrCodeData, yPosition, font);
    }

    this.drawFooter(page, font, gray, 50);

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private drawHeader(
    page: PDFPage,
    data: InvoicePDFData,
    boldFont: PDFFont,
    color: ReturnType<typeof rgb>,
    y: number
  ): void {
    const { width } = page.getSize();
    page.drawText(data.apartmentName, { x: 50, y, size: 24, font: boldFont, color });
    page.drawText('INVOICE', { x: width - 150, y, size: 24, font: boldFont, color });
    page.drawText(`Invoice #: ${data.invoiceNumber}`, {
      x: width - 150, y: y - 30, size: 12, font: boldFont, color,
    });
  }

  private drawInvoiceInfo(
    page: PDFPage,
    data: InvoicePDFData,
    font: PDFFont,
    boldFont: PDFFont,
    gray: ReturnType<typeof rgb>,
    black: ReturnType<typeof rgb>,
    y: number
  ): void {
    const { width } = page.getSize();
    page.drawText('Bill To:', { x: 50, y, size: 12, font: boldFont, color: gray });
    page.drawText(data.tenantName, { x: 50, y: y - 20, size: 14, font: boldFont, color: black });
    page.drawText(`Room ${data.roomNumber}`, { x: 50, y: y - 40, size: 12, font, color: black });

    const rightX = width - 150;
    page.drawText('Invoice Date:', { x: rightX, y, size: 12, font: boldFont, color: gray });
    page.drawText(new Date().toLocaleDateString(), { x: rightX, y: y - 20, size: 12, font, color: black });
    page.drawText('Due Date:', { x: rightX, y: y - 40, size: 12, font: boldFont, color: gray });
    page.drawText(data.dueDate.toLocaleDateString(), { x: rightX, y: y - 60, size: 12, font, color: black });
  }

  private drawBillingItems(
    page: PDFPage,
    items: Array<{ description: string; amount: number; quantity: number; total: number }>,
    font: PDFFont,
    boldFont: PDFFont,
    gray: ReturnType<typeof rgb>,
    black: ReturnType<typeof rgb>,
    lightGray: ReturnType<typeof rgb>,
    startY: number
  ): number {
    const { width } = page.getSize();
    const headers  = ['Description', 'Quantity', 'Unit Price', 'Total'];
    const columnX  = [50, 300, 380, 480];
    let y = startY;

    // Table header background
    page.drawRectangle({ x: 50, y: y + 10, width: width - 100, height: 30, color: lightGray });
    headers.forEach((header, i) => {
      page.drawText(header, { x: columnX[i], y, size: 12, font: boldFont, color: black });
    });
    y -= 20;

    items.forEach((item) => {
      y -= 20;
      page.drawText(item.description, { x: columnX[0], y, size: 11, font, color: black });
      page.drawText(item.quantity.toString(), { x: columnX[1], y, size: 11, font, color: black });
      page.drawText(`฿${item.amount.toFixed(2)}`, { x: columnX[2], y, size: 11, font, color: black });
      page.drawText(`฿${item.total.toFixed(2)}`, { x: columnX[3], y, size: 11, font, color: black });
    });

    // suppress unused variable warning
    void gray;
    return y - 20;
  }

  private drawTotal(
    page: PDFPage,
    total: number,
    boldFont: PDFFont,
    black: ReturnType<typeof rgb>,
    y: number
  ): void {
    const { width } = page.getSize();
    page.drawText('Total:', { x: width - 200, y, size: 14, font: boldFont, color: black });
    page.drawText(`฿${total.toFixed(2)}`, { x: width - 120, y, size: 14, font: boldFont, color: black });
  }

  /**
   * Draw QR code image and "Scan to pay" label using the provided Sarabun font.
   * The `font` parameter must originate from the same PDFDocument instance
   * (registered via fontkit + embedFont) so Thai-safe rendering is guaranteed.
   */
  private async drawQRCode(
    pdfDoc: PDFDocument,
    page: PDFPage,
    qrData: string,
    y: number,
    font: PDFFont
  ): Promise<void> {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(qrData, { width: 100, margin: 1 });
      const base64 = qrCodeDataURL.split(',')[1];
      const imageBytes = Uint8Array.from(Buffer.from(base64, 'base64'));
      const qrImage = await pdfDoc.embedPng(imageBytes);
      const qrDims = qrImage.scale(0.5);
      page.drawImage(qrImage, {
        x: 50,
        y: y - qrDims.height,
        width: qrDims.width,
        height: qrDims.height,
      });
      // Use the passed Sarabun font — no StandardFonts.Helvetica anywhere
      page.drawText('Scan to pay', {
        x: 50,
        y: y - qrDims.height - 20,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      });
    } catch (error) {
      logger.error({
        type: 'invoice_qr_generate_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private drawFooter(
    page: PDFPage,
    font: PDFFont,
    gray: ReturnType<typeof rgb>,
    y: number
  ): void {
    const footerText = 'Thank you for your business!';
    const { width } = page.getSize();
    const textWidth = font.widthOfTextAtSize(footerText, 10);
    page.drawText(footerText, {
      x: (width - textWidth) / 2,
      y,
      size: 10,
      font,
      color: gray,
    });
  }

  private generateQRCodeData(invoice: {
    id: string;
    invoiceNumber: string;
    total: unknown;
    dueDate: Date;
    room: { roomNumber: string };
  }): string {
    return JSON.stringify({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.total),
      dueDate: invoice.dueDate,
      roomNumber: invoice.room.roomNumber,
    });
  }

  private async getCachedPDF(invoiceId: string): Promise<Buffer | null> {
    try {
      const cacheFile = path.join(this.cachePath, `${invoiceId}.pdf`);
      const exists = await fsPromises.access(cacheFile).then(() => true).catch(() => false);
      if (exists) {
        const stats = await fsPromises.stat(cacheFile);
        const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - stats.mtime.getTime() < cacheExpiry) {
          return await fsPromises.readFile(cacheFile);
        }
      }
      return null;
    } catch (error) {
      logger.error({
        type: 'invoice_pdf_cache_read_failed',
        invoiceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async cachePDF(invoiceId: string, pdfBuffer: Buffer): Promise<void> {
    try {
      const cacheFile = path.join(this.cachePath, `${invoiceId}.pdf`);
      await fsPromises.writeFile(cacheFile, pdfBuffer);
      await this.cleanupCache();
    } catch (error) {
      logger.error({
        type: 'invoice_pdf_cache_write_failed',
        invoiceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async saveToStorage(invoiceId: string, pdfBuffer: Buffer): Promise<void> {
    try {
      const filePath = path.join(this.storagePath, `${invoiceId}.pdf`);
      await fsPromises.writeFile(filePath, pdfBuffer);
      logger.info({ type: 'invoice_pdf_stored', invoiceId, path: filePath });
    } catch (error) {
      logger.error({
        type: 'invoice_pdf_store_failed',
        invoiceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async cleanupCache(): Promise<void> {
    try {
      const files = await fsPromises.readdir(this.cachePath);
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(this.cachePath, file);
          const stats = await fsPromises.stat(filePath);
          return { file, stats };
        })
      );
      fileStats.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());
      const filesToRemove = fileStats.slice(0, -100);
      await Promise.all(
        filesToRemove.map(({ file }) => fsPromises.unlink(path.join(this.cachePath, file)))
      );
      logger.info({ type: 'invoice_pdf_cache_cleanup', removed: filesToRemove.length });
    } catch (error) {
      logger.error({
        type: 'invoice_pdf_cache_cleanup_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async clearCache(invoiceId?: string): Promise<void> {
    try {
      if (invoiceId) {
        const cacheFile = path.join(this.cachePath, `${invoiceId}.pdf`);
        await fsPromises.unlink(cacheFile).catch(() => {});
        logger.info({ type: 'invoice_pdf_cache_cleared', invoiceId });
      } else {
        const files = await fsPromises.readdir(this.cachePath);
        await Promise.all(files.map((file) => fsPromises.unlink(path.join(this.cachePath, file))));
        logger.info({ type: 'invoice_pdf_cache_cleared_all' });
      }
    } catch (error) {
      logger.error({
        type: 'invoice_pdf_cache_clear_failed',
        invoiceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function createInvoicePDFService(): InvoicePDFService {
  return new InvoicePDFService();
}
