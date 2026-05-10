import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuthSession, requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, BadRequestError, NotFoundError } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string } },
  ): Promise<NextResponse> => {
    requireAuthSession(req);

    const period = await prisma.billingPeriod.findUnique({
      where: { id: params.id },
      include: {
        importBatches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
        roomBillings: {
          include: {
            invoice: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!period) {
      throw new NotFoundError('BillingPeriod', params.id);
    }

    const totalRecords = period.roomBillings.length;
    const totalAmount = period.roomBillings.reduce((sum, record) => sum + Number(record.totalDue), 0);
    const invoices = period.roomBillings
      .map((r) => r.invoice)
      .filter((inv): inv is NonNullable<typeof inv> => inv !== null);
    const invoicesIssued = invoices.length;
    const paymentsReceived = invoices.filter((invoice) => invoice.status === 'PAID').length;

    const totalActiveRooms = await prisma.room.count({ where: { roomStatus: { in: ['VACANT', 'OCCUPIED'] } } });
    const totalRooms = totalActiveRooms;
    const missingRooms = totalActiveRooms - totalRecords;

    const data = {
      id: period.id,
      year: period.year,
      month: period.month,
      status: period.status,
      dueDay: period.dueDay,
      gracePeriodDays: period.gracePeriodDays,
      importBatchId: period.importBatches[0]?.id ?? null,
      totalRecords,
      totalRooms,
      missingRooms,
      totalAmount,
      invoicesIssued,
      paymentsReceived,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data,
    } as ApiResponse<typeof data>);
  },
);

export const PATCH = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string } },
  ): Promise<NextResponse> => {
    await requireRole(req, ['ADMIN', 'OWNER']);

    const body = await req.json() as {
      dueDay?: unknown;
      gracePeriodDays?: unknown;
    };

    const updateData: { dueDay?: number; gracePeriodDays?: number; version?: { increment: number } } = {
      version: { increment: 1 },
    };

    if (body.dueDay !== undefined) {
      const dueDay = Number(body.dueDay);
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        throw new BadRequestError('dueDay must be an integer between 1 and 31');
      }
      updateData.dueDay = dueDay;
    }

    if (body.gracePeriodDays !== undefined) {
      const gracePeriodDays = Number(body.gracePeriodDays);
      if (!Number.isInteger(gracePeriodDays) || gracePeriodDays < 0 || gracePeriodDays > 365) {
        throw new BadRequestError('gracePeriodDays must be an integer between 0 and 365');
      }
      updateData.gracePeriodDays = gracePeriodDays;
    }

    if (updateData.dueDay === undefined && updateData.gracePeriodDays === undefined) {
      throw new BadRequestError('No billing period fields to update');
    }

    const existing = await prisma.billingPeriod.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundError('BillingPeriod', params.id);
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'OPEN') {
      throw new BadRequestError('Billing period due policy can only be edited while the period is DRAFT or OPEN');
    }

    const period = await prisma.billingPeriod.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        year: true,
        month: true,
        status: true,
        dueDay: true,
        gracePeriodDays: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: period } as ApiResponse<typeof period>);
  },
);
