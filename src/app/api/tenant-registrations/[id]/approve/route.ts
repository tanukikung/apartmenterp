import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError, ConflictError, BadRequestError } from '@/lib/utils/errors';
import { getOutboxProcessor } from '@/lib/outbox';
import { logAudit } from '@/modules/audit';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 10;

type Params = { params: { id: string } };

// POST /api/tenant-registrations/[id]/approve
export const POST = asyncHandler(async (req: NextRequest, context: Params): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`tenant-registration-approve:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  const { id } = context.params;

  const reg = await prisma.tenantRegistration.findUnique({ where: { id } });
  if (!reg) throw new NotFoundError('TenantRegistration', id);

  if (reg.status !== 'PENDING' && reg.status !== 'CORRECTION_REQUESTED') {
    throw new BadRequestError(`Registration is already ${reg.status.toLowerCase()} and cannot be approved`);
  }

  // Validation: claimed room must be provided
  if (!reg.claimedRoom) {
    throw new BadRequestError('Registration has no claimed room number. Request a correction before approving.');
  }

  // Fetch room with current tenants
  const room = await prisma.room.findFirst({
    where: { roomNo: reg.claimedRoom },
    include: {
      tenants: { where: { moveOutDate: null }, include: { tenant: true } },
    },
  });

  if (!room) {
    throw new BadRequestError(`Claimed room "${reg.claimedRoom}" does not exist.`);
  }

  // Check capacity
  if (room.tenants.length >= room.maxResidents) {
    throw new BadRequestError(`Room ${room.roomNo} is full (${room.maxResidents}/${room.maxResidents} occupants).`);
  }

  // ─── CASE A: Room has no tenants (new primary tenant registration) ─
  if (room.tenants.length === 0) {
    // Parse name from lineDisplayName or fallback to phone
    // Sanitize to prevent XSS: strip any HTML/tag patterns before storing in DB
    const sanitize = (v: string) => v.replace(/<[^>]*>/g, '').trim();
    const displayName = reg.lineDisplayName || reg.phone || 'ผู้เช่า';
    const nameParts = displayName.trim().split(/\s+/);
    const firstName = sanitize(nameParts[0] || displayName);
    const lastName = nameParts.length > 1 ? sanitize(nameParts.slice(1).join(' ')) : '';

    let createdTenantId: string | undefined;

    // Atomic: create tenant + room tenant + update registration + link LINE
    await prisma.$transaction(async (tx) => {
      // Step 1: Create new tenant record
      const newTenant = await tx.tenant.create({
        data: {
          id: uuidv4(),
          firstName,
          lastName,
          phone: reg.phone || '',
          lineUserId: reg.lineUserId,
        },
      });
      createdTenantId = newTenant.id;

      // Step 2: Assign tenant to room as PRIMARY — this also marks room OCCUPIED
      await tx.roomTenant.create({
        data: {
          id: uuidv4(),
          roomNo: room.roomNo,
          tenantId: newTenant.id,
          role: 'PRIMARY',
          moveInDate: new Date(),
        },
      });

      // Step 3: Update registration to APPROVED
      await tx.tenantRegistration.update({
        where: { id },
        data: {
          status: 'APPROVED',
          resolvedRoomNo: room.roomNo,
          resolvedTenantId: newTenant.id,
          reviewedById: session.sub,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Step 3: Create LINE conversation for future messaging
      await tx.conversation.create({
        data: {
          id: uuidv4(),
          lineUserId: reg.lineUserId,
          tenantId: newTenant.id,
          roomNo: room.roomNo,
          lastMessageAt: new Date(),
          unreadCount: 0,
          status: 'ACTIVE',
        },
      });
    });

    // Step 6: Write welcome message to outbox (non-blocking)
    const processor = getOutboxProcessor();
    await processor.writeOne(
      'Conversation',
      reg.lineUserId, // aggregateId — conversation not created yet, use lineUserId
      'RegistrationApproved',
      {
        tenantId: createdTenantId,
        lineUserId: reg.lineUserId,
        roomNo: room.roomNo,
        tenantName: `${firstName} ${lastName}`.trim(),
        messageType: 'welcome',
      },
    );

    await logAudit({
      req,
      action: 'TENANT_REGISTRATION_APPROVED',
      entityType: 'TenantRegistration',
      entityId: id,
      metadata: { lineUserId: reg.lineUserId, roomNo: room.roomNo, tenantId: createdTenantId },
    });

    return NextResponse.json({
      success: true,
      data: { registrationId: id, tenantId: createdTenantId, roomNo: room.roomNo },
      message: 'Registration approved — tenant created and assigned to room',
    } as ApiResponse<{ registrationId: string; tenantId: string; roomNo: string }>);
  }

  // ─── CASE B: Room already has a primary tenant (secondary registration) ─
  const primaryRT = room.tenants.find((rt) => rt.role === 'PRIMARY');
  if (!primaryRT) {
    throw new BadRequestError(
      `Room ${room.roomNo} has no primary tenant. Assign a primary tenant before approving secondary registrations.`
    );
  }

  // Check duplicate LINE account — can't register the same LINE twice
  if (reg.lineUserId) {
    const existingTenant = await prisma.tenant.findUnique({
      where: { lineUserId: reg.lineUserId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (existingTenant) {
      throw new ConflictError(
        `LINE account is already linked to tenant ${existingTenant.firstName} ${existingTenant.lastName}`
      );
    }
  }

  // All writes wrapped in transaction — if any step fails, registration stays PENDING.
  await prisma.$transaction(async (tx) => {
    // Link LINE account to existing primary tenant
    if (reg.lineUserId && primaryRT.tenant && !primaryRT.tenant.lineUserId) {
      await tx.tenant.update({
        where: { id: primaryRT.tenantId },
        data: { lineUserId: reg.lineUserId },
      });
    }

    // Update registration to APPROVED
    await tx.tenantRegistration.update({
      where: { id },
      data: {
        status: 'APPROVED',
        resolvedRoomNo: room.roomNo,
        resolvedTenantId: primaryRT.tenantId,
        reviewedById: session.sub,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  await logAudit({
      req,
      action: 'TENANT_REGISTRATION_APPROVED',
      entityType: 'TenantRegistration',
      entityId: id,
      metadata: { lineUserId: reg.lineUserId, roomNo: room.roomNo, resolvedTenantId: primaryRT.tenantId },
    });

  return NextResponse.json({
    success: true,
    data: { registrationId: id, tenantId: primaryRT.tenantId, roomNo: room.roomNo },
    message: 'Registration approved — LINE account linked to existing primary tenant',
  } as ApiResponse<{ registrationId: string; tenantId: string; roomNo: string }>);
});
