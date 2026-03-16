import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { generateInvoicePdf } from '@/modules/invoices/pdf';
import { asyncHandler } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

// ── GET /api/invoices/[id]/pdf ─────────────────────────────────────────────
// Generates a PDF for the invoice.  Looks up the most-recently-updated INVOICE
// DocumentTemplate and injects its body as a Notes / Terms section so that
// template management is connected to runtime generation.

export const GET = asyncHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const { id } = params;
    const invoiceService = getInvoiceService();
    const preview = await invoiceService.getInvoicePreview(id);

    // DocumentTemplate runtime lookup — uses the active INVOICE template if one exists.
    const template = await prisma.documentTemplate.findFirst({
      where: { type: 'INVOICE' },
      orderBy: { updatedAt: 'desc' },
    });

    if (template) {
      logger.info({
        type: 'invoice_pdf_template_applied',
        invoiceId: id,
        templateId: template.id,
        templateName: template.name,
      });
    }

    const pdfBytes = await generateInvoicePdf(preview, {
      notes: template?.body ?? undefined,
      templateId: template?.id ?? undefined,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="invoice_${id}.pdf"`,
        'cache-control': 'no-store',
        // Expose template lineage in response header for audit/debug.
        ...(template ? { 'x-document-template-id': template.id } : {}),
      },
    });
  }
);
