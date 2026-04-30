import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { buildInvoiceAccessUrl } from '@/lib/invoices/access';

// GET /api/invoices/print-queue
// Lists InvoiceDelivery rows with channel=PRINT that are awaiting a print
// confirmation (status=PENDING). Used by the admin "Print queue" screen so
// staff can download the PDFs, run them through a printer, and then mark
// them printed via PATCH /api/invoices/deliveries/[id]/mark-printed.

const querySchema = z.object({
  status: z.enum(['PENDING', 'SENT', 'ALL']).default('PENDING'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

type PrintQueueItem = {
  deliveryId: string;
  invoiceId: string;
  roomNo: string;
  year: number;
  month: number;
  totalAmount: number;
  dueDate: string | null;
  status: string;
  createdAt: string;
  sentAt: string | null;
  pdfUrl: string;
};

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const url = new URL(req.url);
  const { status, limit } = querySchema.parse({
    status: url.searchParams.get('status') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  const where: { channel: 'PRINT'; status?: 'PENDING' | 'SENT' } = {
    channel: 'PRINT',
  };
  if (status !== 'ALL') {
    where.status = status;
  }

  const deliveries = await prisma.invoiceDelivery.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      invoice: {
        select: {
          id: true,
          roomNo: true,
          year: true,
          month: true,
          totalAmount: true,
          dueDate: true,
        },
      },
    },
  });

  const items: PrintQueueItem[] = deliveries
    .filter((d) => d.invoice)
    .map((d) => ({
      deliveryId: d.id,
      invoiceId: d.invoiceId,
      roomNo: d.invoice!.roomNo,
      year: d.invoice!.year,
      month: d.invoice!.month,
      totalAmount: Number(d.invoice!.totalAmount),
      dueDate: d.invoice!.dueDate ? d.invoice!.dueDate.toISOString() : null,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      sentAt: d.sentAt ? d.sentAt.toISOString() : null,
      pdfUrl: buildInvoiceAccessUrl(d.invoiceId, {
        absoluteBaseUrl: process.env.APP_BASE_URL || '',
        signed: true,
      }),
    }));

  return NextResponse.json({
    success: true,
    data: { items, total: items.length },
  } as ApiResponse<{ items: PrintQueueItem[]; total: number }>);
});
