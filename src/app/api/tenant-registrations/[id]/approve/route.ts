import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError, ConflictError, BadRequestError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

type Params = { params: { id: string } };

// POST /api/tenant-registrations/[id]/approve
export const POST = asyncHandler(async (req: NextRequest, context: Params): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const { id } = context.params;

  const reg = await prisma.tenantRegistration.findUnique({ where: { id } });
  if (!reg) throw new NotFoundError('TenantRegistration', id);

  if (reg.status !== 'PENDING' && reg.status !== 'CORRECTION_REQUESTED') {
    throw new BadRequestError(`Registration is already ${reg.status.toLowerCase()} and cannot be approved`);
  }

  // Validation 1: duplicate LINE account
  const existingTenant = await prisma.tenant.findUnique({
    where: { lineUserId: reg.lineUserId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (existingTenant) {
    throw new ConflictError(
      `LINE account ${reg.lineUserId} is already linked to tenant ${existingTenant.firstName} ${existingTenant.lastName} (id: ${existingTenant.id})`
    );
  }

  // Validation 2: claimed room must resolve to an actual room
  if (!reg.claimedRoom) {
    throw new BadRequestError('Registration has no claimed room number. Request a correction before approving.');
  }

  const room = await prisma.room.findFirst({
    where: { roomNo: reg.claimedRoom, roomStatus: 'VACANT' },
    select: { roomNo: true, maxResidents: true, tenants: { where: { moveOutDate: null }, select: { tenantId: true, role: true } } },
  });

  if (!room) {
    throw new BadRequestError(`Claimed room "${reg.claimedRoom}" does not match any active room. Request a correction before approving.`);
  }

  // Validation 3: room must not be full
  if (room.tenants.length >= room.maxResidents) {
    throw new BadRequestError(`Room ${room.roomNo} is full (${room.maxResidents}/${room.maxResidents} occupants). Cannot approve additional registration.`);
  }

  // Validation 4: room must have a primary tenant
  const hasPrimary = room.tenants.some((rt) => rt.role === 'PRIMARY');
  if (!hasPrimary) {
    throw new BadRequestError(`Room ${room.roomNo} has no primary tenant. Assign a primary tenant to the room before approving a secondary registration.`);
  }

  const primaryRoomTenant = room.tenants.find((rt) => rt.role === 'PRIMARY');

  // Single atomic transaction with row lock
  const approved = await prisma.$transaction(async (tx) => {
    const lockedReg = await tx.tenantRegistration.findUnique({ where: { id } });
    if (!lockedReg) throw new NotFoundError('TenantRegistration', id);
    if (lockedReg.status !== 'PENDING' && lockedReg.status !== 'CORRECTION_REQUESTED') {
      throw new BadRequestError(`Registration is already ${lockedReg.status.toLowerCase()} and cannot be approved`);
    }

    if (primaryRoomTenant) {
      const primaryTenant = await tx.tenant.findUnique({ where: { id: primaryRoomTenant.tenantId }, select: { id: true, lineUserId: true } });
      if (primaryTenant && !primaryTenant.lineUserId) {
        await tx.tenant.update({ where: { id: primaryRoomTenant.tenantId }, data: { lineUserId: reg.lineUserId } });
      }
    }

    return tx.tenantRegistration.update({
      where: { id },
      data: { status: 'APPROVED', resolvedRoomNo: room.roomNo, resolvedTenantId: primaryRoomTenant?.tenantId ?? null, reviewedById: session.sub, reviewedAt: new Date(), updatedAt: new Date() },
    });
  }, { timeout: 10_000 });

  await logAudit({ actorId: session.sub, actorRole: session.role, action: 'TENANT_REGISTRATION_APPROVED', entityType: 'TenantRegistration', entityId: id, metadata: { lineUserId: reg.lineUserId, resolvedRoomNo: room.roomNo, resolvedTenantId: primaryRoomTenant?.tenantId } });

  return NextResponse.json({ success: true, data: approved, message: 'Registration approved' } as ApiResponse<typeof approved>);
});