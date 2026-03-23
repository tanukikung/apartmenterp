import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { generateInvoicePdf } from '@/modules/invoices/pdf';
import { asyncHandler } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import { documentTemplateHtmlToText, substituteInvoiceTemplateFields } from '@/lib/templates/document-template';
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
    const [preview, configs, template] = await Promise.all([
      invoiceService.getInvoicePreview(id),
      prisma.config.findMany({
        where: {
          key: {
            in: [
              'building.name', 'building.address', 'building.phone', 'building.taxId',
              'app.name',
            ],
          },
        },
      }),
      prisma.documentTemplate.findFirst({
        where: { type: 'INVOICE' },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const cfgStr = (key: string) => {
      const row = configs.find(c => c.key === key);
      return row ? String(row.value ?? '').trim() : '';
    };

    const building = {
      // building.name takes priority; fall back to app.name if not set
      name:    cfgStr('building.name') || cfgStr('app.name') || null,
      address: cfgStr('building.address') || null,
      phone:   cfgStr('building.phone')   || null,
      taxId:   cfgStr('building.taxId')   || null,
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
        notes: (() => {
          if (!template?.body) return undefined;
          const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
          const periodLabel = `${THAI_MONTHS[preview.month] ?? ''} ${preview.year + 543}`;
          const dt = new Date(preview.dueDate);
          const dueDateLabel = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()+543}`;
          const totalFormatted = `฿${preview.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
          const substituted = substituteInvoiceTemplateFields(template.body, {
            roomNo: preview.roomNo,
            floorNo: preview.floorNo,
            tenantName: preview.tenantName,
            tenantPhone: preview.tenantPhone,
            periodLabel,
            dueDateLabel,
            totalFormatted,
            items: preview.items,
          });
          return documentTemplateHtmlToText(substituted);
        })(),
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
