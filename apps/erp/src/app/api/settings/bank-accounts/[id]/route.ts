import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole, getRequestIp } from '@/lib/auth/guards';
import { asyncHandler, NotFoundError, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

const patchBankAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bankName: z.string().min(1).max(100).optional(),
  bankAccountNo: z.string().min(1).max(50).optional(),
  promptpay: z.string().max(20).optional().nullable(),
  active: z.boolean().optional(),
});

export const PATCH = asyncHandler(
  async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN']);
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
      actorId: session.sub,
      actorRole: session.role,
      action: 'BANK_ACCOUNT_UPDATED',
      entityType: 'BankAccount',
      entityId: id,
      metadata: { changes: body },
      ipAddress: getRequestIp(req),
    });

    return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
  }
);

export const DELETE = asyncHandler(
  async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN']);
    const id = context?.params.id ?? '';

    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('BankAccount', id);

    // Soft delete: set active = false
    const updated = await prisma.bankAccount.update({
      where: { id },
      data: { active: false },
    });

    await logAudit({
      actorId: session.sub,
      actorRole: session.role,
      action: 'BANK_ACCOUNT_DEACTIVATED',
      entityType: 'BankAccount',
      entityId: id,
      metadata: { name: existing.name, bankName: existing.bankName },
      ipAddress: getRequestIp(req),
    });

    return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
  }
);
