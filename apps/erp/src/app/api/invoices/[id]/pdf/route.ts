import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { generateInvoicePdf } from '@/modules/invoices/pdf';
import { asyncHandler } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import { documentTemplateHtmlToText } from '@/lib/templates/document-template';
import { requireOperatorOrSignedInvoiceAccess } from '@/lib/invoices/access';

// ── GET /api/invoices/[id]/pdf ─────────────────────────────────────────────
// Intentionally public — tenant-facing PDF links delivered via LINE do not
// require an admin session.  Invoice IDs are non-guessable UUIDs; the admin
// JSON detail endpoint (/api/invoices/[id]) is separately auth-gated.
//
// Generates a PDF for the invoice.  Looks up the most-recently-updated INVOICE
// DocumentTemplate and injects its body as a Notes / Terms section.
// Template lineage is exposed via response headers and structured logs so the
// exact template version applied is traceable without storing the full PDF.

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const { id } = params;
    requireOperatorOrSignedInvoiceAccess(req, id, 'pdf');

    logger.info({ type: 'pdf_render_start', invoiceId: id });

    const { invoiceService } = getServiceContainer();

    // Fetch preview + building profile + document template in parallel
    const [preview, buildingConfigs, template] = await Promise.all([
      invoiceService.getInvoicePreview(id),
      prisma.config.findMany({
        where: { key: { in: ['building.name', 'building.address', 'building.phone', 'building.taxId'] } },
      }),
      prisma.documentTemplate.findFirst({
        where: { type: 'INVOICE' },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const bldStr = (key: string) => {
      const row = buildingConfigs.find(c => c.key === key);
      return row ? String(row.value ?? '') : '';
    };

    const building = {
      name:    bldStr('building.name')    || null,
      address: bldStr('building.address') || null,
      phone:   bldStr('building.phone')   || null,
      taxId:   bldStr('building.taxId')   || null,
    };

    if (template) {
      logger.info({
        type: 'pdf_template_selected',
        invoiceId: id,
        templateId: template.id,
        templateName: template.name,
        templateUpdatedAt: template.updatedAt,
      });
    } else {
      logger.info({ type: 'pdf_template_none', invoiceId: id });
    }

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generateInvoicePdf(preview, {
        notes: template?.body ? documentTemplateHtmlToText(template.body) : undefined,
        templateId: template?.id ?? undefined,
        building,
      });
    } catch (err) {
      logger.error({
        type: 'pdf_render_failure',
        invoiceId: id,
        templateId: template?.id ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // re-throw — asyncHandler converts to 500
    }

    logger.info({
      type: 'pdf_render_success',
      invoiceId: id,
      templateId: template?.id ?? null,
      sizeBytes: pdfBytes.length,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="invoice_${id}.pdf"`,
        'cache-control': 'no-store',
        // Expose template lineage in response headers for audit/debug.
        // x-document-template-updated-at lets callers detect template edits
        // made after this PDF was first sent.
        ...(template ? {
          'x-document-template-id': template.id,
          'x-document-template-updated-at': template.updatedAt.toISOString(),
        } : {}),
      },
    });
  }
);
