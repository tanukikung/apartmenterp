import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole, getRequestIp } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

const createBankAccountSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(100),
  bankName: z.string().min(1).max(100),
  bankAccountNo: z.string().min(1).max(50),
  promptpay: z.string().max(20).optional().nullable(),
  active: z.boolean().default(true),
});

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const accounts = await prisma.bankAccount.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });

  return NextResponse.json({
    success: true,
    data: accounts,
  } as ApiResponse<typeof accounts>);
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
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
    actorId: session.sub,
    actorRole: session.role,
    action: 'BANK_ACCOUNT_CREATED',
    entityType: 'BankAccount',
    entityId: account.id,
    metadata: { name: account.name, bankName: account.bankName },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json(
    { success: true, data: account } as ApiResponse<typeof account>,
    { status: 201 }
  );
});
