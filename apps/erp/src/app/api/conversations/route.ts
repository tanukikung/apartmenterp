import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { withTiming } from '@/lib/performance/timingMiddleware';

export const dynamic = 'force-dynamic';

const getConversations = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
  const lineUserId = url.searchParams.get('lineUserId');
  const tenantId = url.searchParams.get('tenantId');

  const where: Record<string, unknown> = {};
  if (lineUserId) where.lineUserId = lineUserId;
  if (tenantId) where.tenantId = tenantId;

  const [items, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        lineUser: true,
        tenant: true,
        room: true,
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
  ]);

  // Optimize: Fetch all invoice data in a single query to avoid N+1
  const roomNos = items.map(conv => conv.roomNo).filter(Boolean) as string[];
  let invoiceMap = new Map();

  if (roomNos.length > 0) {
    const invoices = await prisma.invoice.findMany({
      where: { roomNo: { in: roomNos } },
      select: {
        roomNo: true,
        status: true,
        dueDate: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by roomNo and take the latest invoice for each room
    const latestInvoices = invoices.reduce((acc: Map<string, typeof invoices[0]>, invoice) => {
      const key = invoice.roomNo;
      if (!acc.has(key) || invoice.createdAt > acc.get(key)!.createdAt) {
        acc.set(key, invoice);
      }
      return acc;
    }, new Map());

    invoiceMap = latestInvoices;
  }

  // Enhance items with invoice status information
  const enhancedItems = items.map(conv => {
    let overdue = false;
    let waitingPayment = false;

    if (conv.roomNo && invoiceMap.has(conv.roomNo)) {
      const latestInvoice = invoiceMap.get(conv.roomNo);
      overdue = latestInvoice.status === 'OVERDUE' || 
        (latestInvoice.status === 'GENERATED' && 
         latestInvoice.dueDate && 
         new Date(latestInvoice.dueDate) < new Date());
      waitingPayment = latestInvoice.status === 'GENERATED' || latestInvoice.status === 'SENT';
    }
    
    return {
      ...conv,
      overdue,
      waitingPayment,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      data: enhancedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  } as ApiResponse<unknown>);
});

export const GET = withTiming(getConversations);
