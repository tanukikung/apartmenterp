import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';

type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'DONE' | 'CLOSED';

const VALID_STATUSES: MaintenanceStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'DONE', 'CLOSED'];

// ── GET /api/admin/maintenance ────────────────────────────────────────────────
// Supports filters: tenantId, status, pageSize
// Previously ignored all query params; now passes them to the DB query so that
// tenant-detail "Open Tickets" KPI is correctly scoped per-tenant.

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const { searchParams } = req.nextUrl;
  const tenantId = searchParams.get('tenantId') ?? undefined;
  const statusParam = searchParams.get('status') ?? undefined;
  const pageSize = Math.min(Number(searchParams.get('pageSize') ?? '50'), 200);

  const status: MaintenanceStatus | undefined =
    statusParam && (VALID_STATUSES as string[]).includes(statusParam)
      ? (statusParam as MaintenanceStatus)
      : undefined;

  // Build a typed Prisma where clause
  type WhereClause = {
    tenantId?: string;
    status?: MaintenanceStatus;
  };
  const where: WhereClause = {};
  if (tenantId) where.tenantId = tenantId;
  if (status) where.status = status;

  // Use raw prisma to avoid casting issues with the MaintenanceService wrapper
  const [tickets, total] = await Promise.all([
    (prisma as any as {
      maintenanceTicket: {
        findMany(args: { where: WhereClause; include: { room: boolean; tenant: boolean }; orderBy: { createdAt: 'desc' }; take: number }): Promise<unknown[]>;
      };
    }).maintenanceTicket.findMany({
      where,
      include: { room: true, tenant: true },
      orderBy: { createdAt: 'desc' },
      take: pageSize,
    }),
    (prisma as any as {
      maintenanceTicket: {
        count(args: { where: WhereClause }): Promise<number>;
      };
    }).maintenanceTicket.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: { data: tickets, total },
  } as ApiResponse<{ data: unknown[]; total: number }>);
});
