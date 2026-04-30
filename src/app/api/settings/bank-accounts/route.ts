import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '').trim();

const createBankAccountSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(100).transform(stripHtml),
  bankName: z.string().min(1).max(100).transform(stripHtml),
  bankAccountNo: z.string().min(1).max(50),
  promptpay: z.string().max(20).optional().nullable(),
  active: z.boolean().default(true),
});

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const accounts = await prisma.bankAccount.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });

  return NextResponse.json({
    success: true,
    data: accounts,
  } as ApiResponse<typeof accounts>);
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`bank-account:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
  const body = createBankAccountSchema.parse(await req.json());

  const account = await prisma.bankAccount.create({
    data: {
      id: body.id,
      name: body.name,
      bankName: body.bankName,
      bankAccountNo: body.bankAccountNo,
      promptpay: body.promptpay ?? null,
      active: body.active,
    },
  });

  await logAudit({
    req,
    action: 'BANK_ACCOUNT_CREATED',
    entityType: 'BankAccount',
    entityId: account.id,
    metadata: { name: account.name, bankName: account.bankName },
  });

  return NextResponse.json(
    { success: true, data: account } as ApiResponse<typeof account>,
    { status: 201 }
  );
});
