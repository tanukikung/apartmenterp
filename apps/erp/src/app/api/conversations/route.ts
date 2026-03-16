import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { withTiming } from '@/lib/performance/timingMiddleware';

export const dynamic = 'force-dynamic';

const getConversations = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

  const total = await prisma.conversation.count();
  const items = await prisma.conversation.findMany({
    include: {
      lineUser: true,
      tenant: true,
      room: true,
    },
    orderBy: { lastMessageAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  // Optimize: Fetch all invoice data in a single query to avoid N+1
  const roomIds = items.map(conv => conv.roomId).filter(Boolean);
  let invoiceMap = new Map();
  
  if (roomIds.length > 0) {
    const invoices = await prisma.invoice.findMany({
      where: { roomId: { in: roomIds } },
      select: { 
        roomId: true, 
        status: true, 
        dueDate: true,
        createdAt: true 
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // Group by roomId and take the latest invoice for each room
    const latestInvoices = invoices.reduce((acc, invoice) => {
      if (!acc.has(invoice.roomId) || invoice.createdAt > acc.get(invoice.roomId).createdAt) {
        acc.set(invoice.roomId, invoice);
      }
      return acc;
    }, new Map());
    
    invoiceMap = latestInvoices;
  }
  
  // Enhance items with invoice status information
  const enhancedItems = items.map(conv => {
    let overdue = false;
    let waitingPayment = false;
    
    if (conv.roomId && invoiceMap.has(conv.roomId)) {
      const latestInvoice = invoiceMap.get(conv.roomId);
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
