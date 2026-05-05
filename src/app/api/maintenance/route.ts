import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getServiceContainer } from '@/lib/service-container';
import { requireRole } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

const querySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CLOSED', 'ALL']).optional().default('ALL'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  floorNo: z.number().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(100).optional().default(20),
});

/**
 * GET /api/maintenance
 * Admin: list all maintenance tickets with optional filters.
 *
 * Query params:
 * - status: OPEN | IN_PROGRESS | RESOLVED | CLOSED | ALL (default: ALL)
 * - priority: LOW | MEDIUM | HIGH | URGENT
 * - floorNo: number
 * - page: number (default: 1)
 * - pageSize: number (default: 20, max: 100)
 */
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, resetAt } = await limiter.check(`maintenance-list:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`,
      },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)) } },
    );
  }

  await requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const url = new URL(req.url);
  const rawQuery = {
    status: url.searchParams.get('status') || 'ALL',
    priority: url.searchParams.get('priority') || undefined,
    floorNo: url.searchParams.get('floorNo') ? Number(url.searchParams.get('floorNo')) : undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '20',
  };
  const validated = querySchema.parse(rawQuery);

  const { maintenanceService: service } = getServiceContainer();
  const result = await service.listTicketsPaginated({
    status: validated.status === 'ALL' ? undefined : validated.status,
    priority: validated.priority,
    floorNo: validated.floorNo,
    page: validated.page,
    pageSize: validated.pageSize,
  });

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
