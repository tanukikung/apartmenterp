import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError, ConflictError, BadRequestError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

type Params = { params: { id: string } };

// ── POST /api/tenant-registrations/[id]/approve ───────────────────────────────
// Validates all four warning conditions before approval:
//   1. DUPLICATE_LINE_ACCOUNT  – lineUserId already on a Tenant
//   2. CLAIMED_ROOM_MISMATCH   – no active room with that roomNumber
//   3. ROOM_FULL               – room.maxResidents already reached
//   4. NO_PRIMARY_TENANT       – room has no active PRIMARY occupant
//
// On success: sets status=APPROVED, records resolvedRoomId / resolvedTenantId,
// optionally links the lineUserId to the matched Tenant.

export const POST = asyncHandler(async (req: NextRequest, context?: Params): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const id = context?.params.id;
  if (!id) throw new NotFoundError('TenantRegistration');

  const reg = await prisma.tenantRegistration.findUnique({ where: { id } });
  if (!reg) throw new NotFoundError('TenantRegistration', id);

  if (reg.status !== 'PENDING' && reg.status !== 'CORRECTION_REQUESTED') {
    throw new BadRequestError(
      `Registration is already ${reg.status.toLowerCase()} and cannot be approved`
    );
  }

  // ── Validation 1: duplicate LINE account ──────────────────────────────────
  const existingTenant = await prisma.tenant.findUnique({
    where: { lineUserId: reg.lineUserId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (existingTenant) {
    throw new ConflictError(
      `LINE account ${reg.lineUserId} is already linked to tenant ${existingTenant.firstName} ${existingTenant.lastName} (id: ${existingTenant.id})`
    );
  }

  // ── Validation 2: claimed room must resolve to an actual room ─────────────
  if (!reg.claimedRoom) {
    throw new BadRequestError(
      'Registration has no claimed room number. Request a correction before approving.'
    );
  }

  const room = await prisma.room.findFirst({
    where: { roomNo: reg.claimedRoom, roomStatus: 'ACTIVE' },
    select: {
      roomNo: true,
      tenants: {
        where: { moveOutDate: null },
        select: { tenantId: true, role: true },
      },
    },
  });

  if (!room) {
    throw new BadRequestError(
      `Claimed room "${reg.claimedRoom}" does not match any active room. Request a correction before approving.`
    );
  }

  // ── Validation 4: room must have a primary tenant ─────────────────────────
  const hasPrimary = room.tenants.some((rt) => rt.role === 'PRIMARY');
  if (!hasPrimary) {
    throw new BadRequestError(
      `Room ${room.roomNo} has no primary tenant. Assign a primary tenant to the room before approving a secondary registration.`
    );
  }

  // ── Approval transaction ──────────────────────────────────────────────────
  // Link the lineUserId to the room's primary tenant's record if they don't
  // have a lineUserId yet, otherwise record the resolvedTenantId as the primary.
  const primaryRoomTenant = room.tenants.find((rt) => rt.role === 'PRIMARY');

  const approved = await prisma.$transaction(async (tx) => {
    // If the primary tenant has no LINE account yet, link it now
    if (primaryRoomTenant) {
      const primaryTenant = await tx.tenant.findUnique({
        where: { id: primaryRoomTenant.tenantId },
        select: { id: true, lineUserId: true },
      });
      if (primaryTenant && !primaryTenant.lineUserId) {
        await tx.tenant.update({
          where: { id: primaryRoomTenant.tenantId },
          data: { lineUserId: reg.lineUserId },
        });
      }
    }

    return tx.tenantRegistration.update({
      where: { id },
      data: {
        status: 'APPROVED',
        resolvedRoomNo: room.roomNo,
        resolvedTenantId: primaryRoomTenant?.tenantId ?? null,
        reviewedById: session.sub,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'TENANT_REGISTRATION_APPROVED',
    entityType: 'TenantRegistration',
    entityId: id,
    metadata: {
      lineUserId: reg.lineUserId,
      resolvedRoomNo: room.roomNo,
      resolvedTenantId: primaryRoomTenant?.tenantId,
    },
  });

  return NextResponse.json({
    success: true,
    data: approved,
    message: 'Registration approved',
  } as ApiResponse<typeof approved>);
});
