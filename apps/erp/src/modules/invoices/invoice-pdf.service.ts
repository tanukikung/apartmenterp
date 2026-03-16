import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';
import { prisma } from '@/lib';
import { logger } from '@/lib/utils/logger';
import { NotFoundError } from '@/lib/utils/errors';
import * as QRCode from 'qrcode';
import { config } from '@/config';

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

  private async ensureDirectories() {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.mkdir(this.cachePath, { recursive: true });
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
      logger.info({
        type: 'invoice_pdf_cached_hit',
        invoiceId,
      });
      return cachedPDF;
    }

    // Fetch invoice data
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        room: {
          include: {
            roomTenants: {
              where: { moveOutDate: null },
              include: { tenant: true },
            },
          },
        },
        billingRecord: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    const primaryTenant = invoice.room.roomTenants[0]?.tenant;
    if (!primaryTenant) {
      throw new Error('No active tenant found for room');
    }

    // Prepare PDF data
    const computedInvoiceNumber = `INV-${invoice.year}${String(invoice.month).padStart(2, '0')}-${invoice.room.roomNumber}-V${invoice.version}`;
    const pdfData: InvoicePDFData = {
      apartmentName: config.app.name,
      roomNumber: invoice.room.roomNumber,
      tenantName: `${primaryTenant.firstName} ${primaryTenant.lastName}`,
      billingItems: invoice.billingRecord.items.map((item) => ({
        description: item.description ?? '',
        amount: Number(item.unitPrice),
        quantity: Number(item.quantity),
        total: Number(item.amount),
      })),
      totalAmount: Number(invoice.total),
      dueDate: invoice.dueDate,
      invoiceNumber: computedInvoiceNumber,
      qrCodeData: this.generateQRCodeData({
        id: invoice.id,
        invoiceNumber: computedInvoiceNumber,
        total: invoice.total,
        dueDate: invoice.dueDate,
        room: { roomNumber: invoice.room.roomNumber },
      }),
    };

    // Generate PDF
    const pdfBuffer = await this.createPDF(pdfData, options);

    // Cache the PDF
    await this.cachePDF(invoiceId, pdfBuffer);
    // Persist a copy under storage for long-term retrieval
    await this.saveToStorage(invoiceId, pdfBuffer);

    logger.info({
      type: 'invoice_pdf_generated',
      invoiceId,
      size: pdfBuffer.length,
    });
    return pdfBuffer;
  }

  private async createPDF(
    data: InvoicePDFData,
    options: PDFGenerationOptions
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { height } = page.getSize();

    // Load fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Colors
    const black = rgb(0, 0, 0);
    const gray = rgb(0.5, 0.5, 0.5);
    const lightGray = rgb(0.95, 0.95, 0.95);
    // const blue = rgb(0.2, 0.4, 0.8);

    let yPosition = height - 50;

    // Header
    this.drawHeader(page, data, helveticaBoldFont, black, yPosition);
    yPosition -= 100;

    // Invoice info
    this.drawInvoiceInfo(page, data, helveticaFont, helveticaBoldFont, gray, black, yPosition);
    yPosition -= 80;

    // Billing items table
    yPosition = this.drawBillingItems(
      page,
      data.billingItems,
      helveticaFont,
      helveticaBoldFont,
      gray,
      black,
      lightGray,
      yPosition
    );

    // Total
    yPosition -= 30;
    this.drawTotal(page, data.totalAmount, helveticaBoldFont, black, yPosition);

    // QR Code
    if (options.includeQRCode !== false) {
      yPosition -= 100;
      await this.drawQRCode(pdfDoc, page, data.qrCodeData, yPosition);
    }

    // Footer
    this.drawFooter(page, helveticaFont, gray, 50);

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
    
    // Company name
    page.drawText(data.apartmentName, {
      x: 50,
      y,
      size: 24,
      font: boldFont,
      color,
    });

    // Invoice title
    page.drawText('INVOICE', {
      x: width - 150,
      y,
      size: 24,
      font: boldFont,
      color,
    });

    // Invoice number
    page.drawText(`Invoice #: ${data.invoiceNumber}`, {
      x: width - 150,
      y: y - 30,
      size: 12,
      font: boldFont,
      color,
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

    // Left column - Bill To
    page.drawText('Bill To:', {
      x: 50,
      y,
      size: 12,
      font: boldFont,
      color: gray,
    });

    page.drawText(data.tenantName, {
      x: 50,
      y: y - 20,
      size: 14,
      font: boldFont,
      color: black,
    });

    page.drawText(`Room ${data.roomNumber}`, {
      x: 50,
      y: y - 40,
      size: 12,
      font,
      color: black,
    });

    // Right column - Invoice Details
    const rightX = width - 150;
    
    page.drawText('Invoice Date:', {
      x: rightX,
      y,
      size: 12,
      font: boldFont,
      color: gray,
    });
    
    page.drawText(new Date().toLocaleDateString(), {
      x: rightX,
      y: y - 20,
      size: 12,
      font,
      color: black,
    });

    page.drawText('Due Date:', {
      x: rightX,
      y: y - 40,
      size: 12,
      font: boldFont,
      color: gray,
    });
    
    page.drawText(data.dueDate.toLocaleDateString(), {
      x: rightX,
      y: y - 60,
      size: 12,
      font,
      color: black,
    });
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
    const headers = ['Description', 'Quantity', 'Unit Price', 'Total'];
    // const columnWidths = [250, 80, 100, 100];
    const columnX = [50, 300, 380, 480];

    let y = startY;

    // Table header
    page.drawRectangle({
      x: 50,
      y: y + 10,
      width: width - 100,
      height: 30,
      color: lightGray,
    });

    headers.forEach((header, i) => {
      page.drawText(header, {
        x: columnX[i],
        y: y,
        size: 12,
        font: boldFont,
        color: black,
      });
    });

    y -= 20;

    // Table rows
    items.forEach((item) => {
      y -= 20;
      
      page.drawText(item.description, {
        x: columnX[0],
        y,
        size: 11,
        font,
        color: black,
      });
      
      page.drawText(item.quantity.toString(), {
        x: columnX[1],
        y,
        size: 11,
        font,
        color: black,
      });
      
      page.drawText(`฿${item.amount.toFixed(2)}`, {
        x: columnX[2],
        y,
        size: 11,
        font,
        color: black,
      });
      
      page.drawText(`฿${item.total.toFixed(2)}`, {
        x: columnX[3],
        y,
        size: 11,
        font,
        color: black,
      });
    });

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
    
    page.drawText('Total:', {
      x: width - 200,
      y,
      size: 14,
      font: boldFont,
      color: black,
    });
    
    page.drawText(`฿${total.toFixed(2)}`, {
      x: width - 120,
      y,
      size: 14,
      font: boldFont,
      color: black,
    });
  }

  private async drawQRCode(
    pdfDoc: PDFDocument,
    page: PDFPage,
    qrData: string,
    y: number
  ): Promise<void> {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(qrData, {
        width: 100,
        margin: 1,
      });
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
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      page.drawText('Scan to pay', {
        x: 50,
        y: y - qrDims.height - 20,
        size: 10,
        font: helvetica,
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
    // Generate QR code data for payment
    // This could be a payment link, bank account info, etc.
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
      const exists = await fs.access(cacheFile).then(() => true).catch(() => false);
      
      if (exists) {
        const stats = await fs.stat(cacheFile);
        const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
        
        if (Date.now() - stats.mtime.getTime() < cacheExpiry) {
          return await fs.readFile(cacheFile);
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
      await fs.writeFile(cacheFile, pdfBuffer);
      
      // Clean up old cache files (keep last 100)
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
      await fs.writeFile(filePath, pdfBuffer);
      logger.info({
        type: 'invoice_pdf_stored',
        invoiceId,
        path: filePath,
      });
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
      const files = await fs.readdir(this.cachePath);
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(this.cachePath, file);
          const stats = await fs.stat(filePath);
          return { file, stats };
        })
      );
      
      // Sort by modification time (oldest first)
      fileStats.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());
      
      // Remove files if more than 100
      const filesToRemove = fileStats.slice(0, -100);
      await Promise.all(
        filesToRemove.map(({ file }) => fs.unlink(path.join(this.cachePath, file)))
      );
      
      logger.info({
        type: 'invoice_pdf_cache_cleanup',
        removed: filesToRemove.length,
      });
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
        await fs.unlink(cacheFile).catch(() => {}); // Ignore if doesn't exist
        logger.info({
          type: 'invoice_pdf_cache_cleared',
          invoiceId,
        });
      } else {
        // Clear all cache
        const files = await fs.readdir(this.cachePath);
        await Promise.all(
          files.map(file => fs.unlink(path.join(this.cachePath, file)))
        );
        logger.info({
          type: 'invoice_pdf_cache_cleared_all',
        });
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

let invoicePDFServiceInstance: InvoicePDFService | null = null;
export function getInvoicePDFService(): InvoicePDFService {
  if (!invoicePDFServiceInstance) {
    invoicePDFServiceInstance = new InvoicePDFService();
  }
  return invoicePDFServiceInstance;
}
