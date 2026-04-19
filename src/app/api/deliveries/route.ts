import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { requireAuthSession } from '@/lib/auth/guards';
import { parsePagination } from '@/lib/utils/pagination';

const deliveriesSearchSchema = z.string().trim().min(1).max(100).optional();

type DeliveryWithInvoice = {
  id: string;
  invoiceId: string;
  channel: string;
  status: string;
  recipientRef: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    roomNo: string;
    year: number;
    month: number;
    totalAmount: string;
    status: string;
    room: {
      roomNo: string;
      floorNo: number;
    } | null;
  } | null;
};

// GET /api/deliveries?channel=LINE&status=PENDING&page=1&pageSize=20
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel') || 'LINE';
  const status = searchParams.get('status');
  const q = deliveriesSearchSchema.parse(searchParams.get('q') ?? undefined);
  const { page, pageSize, skip } = parsePagination(req, { defaultSize: 50 });

  const where: Record<string, unknown> = { channel };
  if (status) {
    where.status = status;
  }

  // Free-text search: recipientRef (LINE user id) OR invoice.roomNo.
  // Status is an enum and already filterable via the `status` param.
  if (q) {
    const trimmed = q.trim();
    where.OR = [
      { recipientRef: { contains: trimmed, mode: 'insensitive' } },
      { invoice: { roomNo: { contains: trimmed, mode: 'insensitive' } } },
    ];
  }

  const [deliveries, total] = await Promise.all([
    prisma.invoiceDelivery.findMany({
      where,
      include: {
        invoice: {
          include: {
            room: {
              select: { roomNo: true, floorNo: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.invoiceDelivery.count({ where }),
  ]);

  const data: DeliveryWithInvoice[] = deliveries.map((d) => ({
    id: d.id,
    invoiceId: d.invoiceId,
    channel: d.channel,
    status: d.status,
    recipientRef: d.recipientRef,
    sentAt: d.sentAt?.toISOString() ?? null,
    viewedAt: d.viewedAt?.toISOString() ?? null,
    errorMessage: d.errorMessage,
    createdAt: d.createdAt.toISOString(),
    invoice: d.invoice
      ? {
          id: d.invoice.id,
          invoiceNumber: `INV-${d.invoice.year}${String(d.invoice.month).padStart(2, '0')}-${d.invoice.roomNo}`,
          roomNo: d.invoice.roomNo,
          year: d.invoice.year,
          month: d.invoice.month,
          totalAmount: d.invoice.totalAmount.toString(),
          status: d.invoice.status,
          room: d.invoice.room
            ? { roomNo: d.invoice.room.roomNo, floorNo: d.invoice.room.floorNo }
            : null,
        }
      : null,
  }));

  return NextResponse.json({
    success: true,
    data: {
      items: data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  } as ApiResponse<{ items: DeliveryWithInvoice[]; total: number; page: number; pageSize: number; totalPages: number }>);
});
