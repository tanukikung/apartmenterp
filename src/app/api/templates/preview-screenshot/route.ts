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
import { z } from 'zod';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const UPLOAD_WINDOW_MS = 60 * 1000;
const UPLOAD_MAX_ATTEMPTS = 5;

const previewSchema = z.object({
  html: z.string().optional(),
  templateId: z.string().optional(),
  roomId: z.string().optional(),
  billingCycleId: z.string().optional(),
  year: z.number().optional(),
  month: z.number().optional(),
  width: z.number().default(794),
  height: z.number().default(1123),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`template-preview-screenshot:${ip}`, UPLOAD_MAX_ATTEMPTS, UPLOAD_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const input = previewSchema.parse(await req.json());
  const {
    html: rawHtml,
    templateId,
    roomId,
    billingCycleId,
    year,
    month,
    width = 794,
    height = 1123,
  } = input;

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
