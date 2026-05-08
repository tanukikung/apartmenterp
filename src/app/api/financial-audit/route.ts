import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getFinancialAuditForEntity } from '@/modules/financial-audit';

const querySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
});

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireRole(req, ['ADMIN', 'OWNER', 'STAFF']);

  const { searchParams } = new URL(req.url);
  const raw = Object.fromEntries(searchParams.entries());
  const validation = querySchema.safeParse(raw);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: { message: validation.error.errors[0]?.message ?? 'Invalid query', statusCode: 400, name: 'ValidationError', code: 'VALIDATION_ERROR' } },
      { status: 400 }
    );
  }

  const { entityType, entityId, limit } = validation.data;

  let rows;
  if (entityId) {
    rows = await getFinancialAuditForEntity(entityType, entityId, limit);
  } else {
    // List all for entity type (admin overview)
    const { prisma } = await import('@/lib');
    rows = await prisma.financialAuditLog.findMany({
      where: { entityType },
      orderBy: { timestamp: 'desc' },
      take: limit,
    }) as unknown as Awaited<ReturnType<typeof getFinancialAuditForEntity>>;
  }

  return NextResponse.json({
    success: true,
    data: rows,
    meta: { count: rows.length, entityType },
  } as ApiResponse<unknown>);
});