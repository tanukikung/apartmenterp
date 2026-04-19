import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { TenantRegistrationStatus } from '@prisma/client';

// ── Warning codes ─────────────────────────────────────────────────────────────

export type RegistrationWarning =
  | 'DUPLICATE_LINE_ACCOUNT'   // lineUserId already linked to a Tenant
  | 'CLAIMED_ROOM_MISMATCH'    // claimedRoom does not match any Room.roomNumber
  | 'ROOM_FULL'                // room has reached maxResidents active occupants
  | 'NO_PRIMARY_TENANT';       // room exists but has no active PRIMARY occupant

/**
 * Batch-compute warnings for a list of registrations.
 *
 * Avoids the original N+1 pattern (3 DB queries per registration) by issuing
 * exactly 2 queries regardless of list size:
 *   - one `tenant.findMany` over all distinct lineUserIds
 *   - one `room.findMany` over all distinct claimedRoom numbers
 *
 * For a 100-row page this is 2 queries instead of 300.
 */
async function computeWarningsForBatch(
  regs: { id: string; lineUserId: string; claimedRoom: string | null }[]
): Promise<Map<string, RegistrationWarning[]>> {
  const result = new Map<string, RegistrationWarning[]>();
  if (regs.length === 0) return result;

  const lineUserIds = Array.from(new Set(regs.map((r) => r.lineUserId).filter(Boolean)));
  const claimedRooms = Array.from(
    new Set(regs.map((r) => r.claimedRoom).filter((v): v is string => !!v))
  );

  // Batch 1: existing tenants by lineUserId
  const existingTenants =
    lineUserIds.length > 0
      ? await prisma.tenant.findMany({
          where: { lineUserId: { in: lineUserIds } },
          select: { lineUserId: true },
        })
      : [];
  const takenLineIds = new Set(existingTenants.map((t) => t.lineUserId).filter(Boolean) as string[]);

  // Batch 2: claimed rooms + their active occupants
  const rooms =
    claimedRooms.length > 0
      ? await prisma.room.findMany({
          where: { roomNo: { in: claimedRooms }, roomStatus: 'VACANT' },
          select: {
            roomNo: true,
            maxResidents: true,
            tenants: {
              where: { moveOutDate: null },
              select: { role: true },
            },
          },
        })
      : [];
  const roomByNo = new Map(rooms.map((r) => [r.roomNo, r]));

  for (const reg of regs) {
    const warnings: RegistrationWarning[] = [];

    if (reg.lineUserId && takenLineIds.has(reg.lineUserId)) {
      warnings.push('DUPLICATE_LINE_ACCOUNT');
    }

    if (reg.claimedRoom) {
      const room = roomByNo.get(reg.claimedRoom);
      if (!room) {
        warnings.push('CLAIMED_ROOM_MISMATCH');
      } else {
        if (!room.tenants.some((rt) => rt.role === 'PRIMARY')) warnings.push('NO_PRIMARY_TENANT');
        if (room.tenants.length >= room.maxResidents) warnings.push('ROOM_FULL');
      }
    }

    result.set(reg.id, warnings);
  }

  return result;
}

// ── GET /api/tenant-registrations ─────────────────────────────────────────────

const VALID_STATUSES: TenantRegistrationStatus[] = [
  'PENDING',
  'CORRECTION_REQUESTED',
  'APPROVED',
  'REJECTED',
];

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);

  const { searchParams } = req.nextUrl;
  const statusParam = searchParams.get('status');
  const pageSize = Math.min(Number(searchParams.get('pageSize') ?? '50'), 100);
  const page = Math.max(Number(searchParams.get('page') ?? '1'), 1);
  const skip = (page - 1) * pageSize;

  const status: TenantRegistrationStatus | undefined =
    statusParam && (VALID_STATUSES as string[]).includes(statusParam)
      ? (statusParam as TenantRegistrationStatus)
      : undefined;

  const where = status ? { status } : {};

  const [rows, total] = await Promise.all([
    prisma.tenantRegistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.tenantRegistration.count({ where }),
  ]);

  // Compute warnings only for actionable records — batched to avoid N+1
  const actionable = rows.filter(
    (r) => r.status === 'PENDING' || r.status === 'CORRECTION_REQUESTED'
  );
  const warningsByRegId = await computeWarningsForBatch(actionable);
  const data = rows.map((reg) => ({
    ...reg,
    warnings: warningsByRegId.get(reg.id) ?? [],
  }));

  return NextResponse.json({
    success: true,
    data: { data, total },
  } as ApiResponse<{ data: typeof data; total: number }>);
});
