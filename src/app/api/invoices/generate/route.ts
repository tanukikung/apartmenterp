import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';
import { getServiceContainer } from '@/lib/service-container';
import { generateInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireRole } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { prisma } from '@/lib';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const IDEMPOTENCY_RECORD_RESOURCE_TYPE = 'Invoice';

// ============================================================================
// POST /api/invoices/generate - Generate invoice from billing
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`invoice-generate:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  // ── Idempotency key ──────────────────────────────────────────────────────
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (idempotencyKey) {
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { key: idempotencyKey },
    });
    if (existing && existing.result !== null) {
      logger.info({
        type: 'invoice_generate_idempotent_hit',
        idempotencyKey,
        resourceId: existing.resourceId,
      });
      return NextResponse.json({
        success: true,
        data: existing.result,
        message: 'Invoice already generated (idempotent response)',
      } as ApiResponse<typeof existing.result>, { status: 200 });
    }
  }

  const body = await req.json();
  const input = generateInvoiceSchema.parse(body);
  const { searchParams } = new URL(req.url);
  const confirm = searchParams.get('confirm') === 'true';

  const { invoiceService } = getServiceContainer();
  let invoice;
  if (confirm) {
    invoice = await invoiceService.generateInvoice(input);
  } else {
    invoice = await invoiceService.generateInvoiceFromBilling(input.billingRecordId);
  }

  logger.info({
    type: 'invoice_generated_api',
    invoiceId: invoice.id,
    billingRecordId: input.billingRecordId,
  });

  // ── Store idempotency record ────────────────────────────────────────────
  if (idempotencyKey) {
    await prisma.idempotencyRecord.upsert({
      where: { key: idempotencyKey },
      create: {
        id: uuidv4(),
        key: idempotencyKey,
        resourceType: IDEMPOTENCY_RECORD_RESOURCE_TYPE,
        resourceId: invoice.id,
        result: invoice as unknown as Prisma.InputJsonValue,
      },
      update: {
        resourceId: invoice.id,
        result: invoice as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: invoice,
    message: 'Invoice generated successfully',
  } as ApiResponse<typeof invoice>, { status: 201 });
});
