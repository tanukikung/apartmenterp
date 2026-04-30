import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, NotFoundError, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '').trim();

const patchBankAccountSchema = z.object({
  name: z.string().min(1).max(100).transform(stripHtml).optional(),
  bankName: z.string().min(1).max(100).transform(stripHtml).optional(),
  bankAccountNo: z.string().min(1).max(50).optional(),
  promptpay: z.string().max(20).optional().nullable(),
  active: z.boolean().optional(),
});

export const PATCH = asyncHandler(
  async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`bank-account-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    requireRole(req, ['ADMIN', 'OWNER']);
    const id = context?.params.id ?? '';

    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('BankAccount', id);

    const body = patchBankAccountSchema.parse(await req.json());

    const updated = await prisma.bankAccount.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.bankName !== undefined && { bankName: body.bankName }),
        ...(body.bankAccountNo !== undefined && { bankAccountNo: body.bankAccountNo }),
        ...(body.promptpay !== undefined && { promptpay: body.promptpay }),
        ...(body.active !== undefined && { active: body.active }),
      },
    });

    await logAudit({
      req,
      action: 'BANK_ACCOUNT_UPDATED',
      entityType: 'BankAccount',
      entityId: id,
      metadata: { changes: body },
    });

    return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
  }
);

export const DELETE = asyncHandler(
  async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`bank-account-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    requireRole(req, ['ADMIN', 'OWNER']);
    const id = context?.params.id ?? '';

    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('BankAccount', id);

    // Soft delete: set active = false
    const updated = await prisma.bankAccount.update({
      where: { id },
      data: { active: false },
    });

    await logAudit({
      req,
      action: 'BANK_ACCOUNT_DEACTIVATED',
      entityType: 'BankAccount',
      entityId: id,
      metadata: { name: existing.name, bankName: existing.bankName },
    });

    return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
  }
);
