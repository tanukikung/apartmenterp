import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';

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
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel') || 'LINE';
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { channel };
  if (status) {
    where.status = status;
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
