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

async function computeWarnings(reg: {
  lineUserId: string;
  claimedRoom: string | null;
}): Promise<RegistrationWarning[]> {
  const warnings: RegistrationWarning[] = [];

  // 1. Duplicate LINE account
  const existingTenant = await prisma.tenant.findUnique({
    where: { lineUserId: reg.lineUserId },
    select: { id: true },
  });
  if (existingTenant) warnings.push('DUPLICATE_LINE_ACCOUNT');

  // 2–4. Claimed room validations
  if (reg.claimedRoom) {
    const room = await prisma.room.findFirst({
      where: { roomNo: reg.claimedRoom, roomStatus: 'ACTIVE' },
      select: {
        roomNo: true,
        tenants: {
          where: { moveOutDate: null },
          select: { role: true },
        },
      },
    });

    if (!room) {
      warnings.push('CLAIMED_ROOM_MISMATCH');
    } else {
      if (!room.tenants.some((rt) => rt.role === 'PRIMARY')) warnings.push('NO_PRIMARY_TENANT');
    }
  }

  return warnings;
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

  // Compute warnings only for actionable records
  const data = await Promise.all(
    rows.map(async (reg) => {
      const warnings =
        reg.status === 'PENDING' || reg.status === 'CORRECTION_REQUESTED'
          ? await computeWarnings({ lineUserId: reg.lineUserId, claimedRoom: reg.claimedRoom })
          : [];
      return { ...reg, warnings };
    })
  );

  return NextResponse.json({
    success: true,
    data: { data, total },
  } as ApiResponse<{ data: typeof data; total: number }>);
});
