/**
 * POST /api/templates/preview-screenshot
 *
 * Renders a template document with REAL data from the database and returns
 * a PNG screenshot via Puppeteer (Chromium).
 *
 * This is the "Real Preview" button — shows exactly what the printed PDF
 * will look like, including actual room/tenant/billing data.
 *
 * Two modes:
 *   1. templateId + context params → resolves real DB data, renders HTML server-side
 *   2. raw html string            → quick preview of arbitrary HTML (existing behaviour)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler } from '@/lib/utils/errors';
import { htmlToScreenshot } from '@/lib/puppeteer';
import { getDocumentTemplateService } from '@/modules/documents/template.service';
import { templatePreviewRequestSchema } from '@/modules/documents/types';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const body = await req.json().catch(() => ({}));
  const {
    html: rawHtml,
    templateId,
    roomId,
    billingCycleId,
    year,
    month,
    width = 794,
    height = 1123,
  } = body as {
    html?: string;
    templateId?: string;
    roomId?: string;
    billingCycleId?: string;
    year?: number;
    month?: number;
    width?: number;
    height?: number;
  };

  // ── Mode 1: Resolve real data from DB ────────────────────────────────────
  if (templateId) {
    const parsed = templatePreviewRequestSchema.safeParse({ roomId, billingCycleId, year, month });
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Invalid preview context', code: 'VALIDATION_ERROR' },
        },
        { status: 400 },
      );
    }

    const service = getDocumentTemplateService();
    const preview = await service.previewTemplate(templateId, parsed.data);

    // preview.html is the fully-rendered HTML with real DB values substituted
    const screenshotBuffer = await htmlToScreenshot(preview.html, {
      width,
      height,
      fullPage: true,
    });

    return new NextResponse(new Uint8Array(screenshotBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, max-age=0',
        'Content-Length': String(screenshotBuffer.length),
      },
    });
  }

  // ── Mode 2: Raw HTML preview (quick check) ───────────────────────────────
  if (!rawHtml || typeof rawHtml !== 'string') {
    return NextResponse.json(
      { success: false, error: { message: 'html field is required when no templateId given', code: 'INVALID_INPUT' } },
      { status: 400 },
    );
  }

  const screenshotBuffer = await htmlToScreenshot(rawHtml, { width, height, fullPage: true });

  return new NextResponse(new Uint8Array(screenshotBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Length': String(screenshotBuffer.length),
    },
  });
});
