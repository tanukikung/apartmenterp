import { NextRequest, NextResponse } from 'next/server';
import { requireOperatorOrSignedInvoiceAccess } from '@/lib/invoices/access';
import { htmlToScreenshot } from '@/lib/puppeteer';
import { renderTemplate, buildInvoiceTemplateData } from '@/lib/template-engine';
import { getServiceContainer } from '@/lib/service-container';
import { prisma } from '@/lib/db/client';
import { asyncHandler } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ── GET /api/invoices/[id]/image ─────────────────────────────────────────────
// Returns the invoice as a full-page A4 PNG screenshot (2x scale for retina).
// Uses the same HTML template as the PDF endpoint.

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const { id } = params;
    requireOperatorOrSignedInvoiceAccess(req, id, 'image');

    logger.info({ type: 'image_render_start', invoiceId: id });

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

    // Guard: cancelled invoices cannot generate images
    if (preview.status === 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: 'This invoice has been cancelled and cannot generate an image' },
        { status: 410 }
      );
    }

    // Fetch the room's default bank account
    const roomAccount = await prisma.room.findUnique({
      where: { roomNo: preview.roomNo },
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
      name:    cfgStr('building.name') || cfgStr('app.name') || null,
      address: cfgStr('building.address') || null,
      phone:   cfgStr('building.phone')   || null,
      taxId:   cfgStr('building.taxId')   || null,
    };

    if (template) {
      logger.info({
        type: 'image_template_selected',
        invoiceId: id,
        templateId: template.id,
        templateName: template.name,
        templateUpdatedAt: template.updatedAt,
      });
    } else {
      logger.info({ type: 'image_template_none', invoiceId: id });
    }

    let imageBuffer: Buffer;
    try {
      const templateBody = template?.activeVersion?.body ?? template?.body ?? '';

      const templateData = buildInvoiceTemplateData(preview, {
        building,
        bankAccount: roomAccount ? {
          bankName: roomAccount.bankName || null,
          accountNo: roomAccount.bankAccountNo || null,
          accountName: roomAccount.name || null,
        } : undefined,
      });

      const renderedHtml = renderTemplate(templateBody, templateData);
      const invoiceNumber = preview.invoiceNumber || `INV-${preview.year}${String(preview.month).padStart(2, '0')}-${preview.roomNo}`;

      // A4 at 2x scale = 2480 x 3508 px
      // We use viewport width ~794 (A4 at 96dpi) and let fullPage capture everything
      imageBuffer = await htmlToScreenshot(renderedHtml, {
        width: 794,
        fullPage: true,
      });
    } catch (err) {
      logger.error({
        type: 'image_render_failure',
        invoiceId: id,
        templateId: template?.id ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    logger.info({
      type: 'image_render_success',
      invoiceId: id,
      templateId: template?.id ?? null,
      sizeBytes: imageBuffer.length,
    });

    const filename = `invoice_${id}.png`;

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-disposition': `inline; filename="${filename}"`,
        'cache-control': 'no-store',
        ...(template ? {
          'x-document-template-id': template.id,
          'x-document-template-updated-at': template.updatedAt.toISOString(),
        } : {}),
      },
    });
  }
);