import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { asyncHandler } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import { requireOperatorOrSignedInvoiceAccess } from '@/lib/invoices/access';
import { htmlToPdfBuffer } from '@/lib/puppeteer';
import { renderTemplate, buildInvoiceTemplateData } from '@/lib/template-engine';
import { generateInvoicePdf } from '@/modules/invoices/pdf';

// ── GET /api/invoices/[id]/pdf ─────────────────────────────────────────────
// Intentionally public — tenant-facing PDF links delivered via LINE do not
// require an admin session.  Invoice IDs are non-guessable UUIDs; the admin
// JSON detail endpoint (/api/invoices/[id]) is separately auth-gated.
//
// Uses the DB DocumentTemplate body as the FULL HTML template, rendered
// via a minimal handlebars-like engine ({{field}}, {{#if}}, {{#each}}).

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
        where: { type: 'INVOICE', status: 'ACTIVE', activeVersionId: { not: null } },
        include: { activeVersion: true },
      }),
    ]);
    const normalizedPreview = {
      ...preview,
      roomNo: preview.roomNo ?? (preview as unknown as { roomNumber?: string }).roomNumber ?? '',
    };

    // Guard: cancelled invoices cannot have their PDF regenerated — return 410 Gone
    // to prevent tenant confusion and unnecessary Puppeteer resource usage.
    if (normalizedPreview.status === 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: 'This invoice has been cancelled and cannot generate a PDF' },
        { status: 410 }
      );
    }

    // Fetch the room's default bank account (sequential — needs preview.roomNo first)
    const roomAccount = await prisma.room.findUnique({
      where: { roomNo: normalizedPreview.roomNo },
      select: { defaultAccountId: true },
    }).then(r => r?.defaultAccountId
      ? prisma.bankAccount.findUnique({ where: { id: r.defaultAccountId } })
      : prisma.bankAccount.findFirst({ where: { active: true } }),
    );

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
      // Get template body — prefer activeVersion, fall back to body
      const templateBody = template?.activeVersion?.body ?? template?.body ?? '';

      const templateData = buildInvoiceTemplateData(normalizedPreview, {
        building,
        bankAccount: roomAccount ? {
          bankName: roomAccount.bankName || null,
          accountNo: roomAccount.bankAccountNo || null,
          accountName: roomAccount.name || null,
        } : undefined,
      });

      const invoiceNumber = normalizedPreview.invoiceNumber || `INV-${normalizedPreview.year}${String(normalizedPreview.month).padStart(2, '0')}-${normalizedPreview.roomNo}`;

      if (templateBody.trim()) {
        const renderedHtml = renderTemplate(templateBody, templateData);
        pdfBytes = await htmlToPdfBuffer(renderedHtml, {
          title: invoiceNumber,
          pageSize: 'A4',
          orientation: 'portrait',
          marginTop: '0',
          marginBottom: '0',
          marginLeft: '0',
          marginRight: '0',
          printBackground: true,
          scale: 1,
        });
      } else {
        pdfBytes = await generateInvoicePdf(normalizedPreview, { building });
      }
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
