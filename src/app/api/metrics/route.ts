import { NextResponse } from 'next/server';
import os from 'os';
import { prisma } from '@/lib/db';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { PaymentTransactionStatus } from '@prisma/client';
import { metricsCache } from '@/lib/performance/cache';
import { NextRequest } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  
  // Check cache first (5 minute TTL)
  const cached = metricsCache.get('metrics');
  if (cached) {
    return NextResponse.json({ success: true, data: cached } as ApiResponse<typeof cached>);
  }
  
  let db: 'connected' | 'error' = 'connected';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    db = 'error';
    logger.error({ type: 'metrics_db_error', message: e instanceof Error ? e.message : 'unknown' });
  }
  const mem = process.memoryUsage();
  const cpuLoad = os.loadavg?.() || [];
  let queueLength = 0;
  let failedCount = 0;
  let invoiceTotal = 0;
  let invoicePaid = 0;
  let invoiceOverdue = 0;
  let paymentConfirmed = 0;
  let paymentManualReview = 0;
  let paymentTxTotal = 0;
  let paymentAutoMatched = 0;
  try {
    queueLength = await prisma.outboxEvent.count({ where: { processedAt: null } });
    failedCount = await prisma.outboxEvent.count({
      where: { processedAt: null, retryCount: { gte: 3 } },
    });
  } catch (e) {
    logger.warn({ type: 'metrics_outbox_error', message: e instanceof Error ? e.message : 'unknown' });
  }
  try {
    invoiceTotal = await prisma.invoice.count();
    invoicePaid = await prisma.invoice.count({ where: { status: 'PAID' } });
    invoiceOverdue = await prisma.invoice.count({ where: { status: 'OVERDUE' } });
  } catch (e) {
    logger.warn({ type: 'metrics_invoice_error', message: e instanceof Error ? e.message : 'unknown' });
  }
  try {
    paymentConfirmed = await prisma.payment.count({ where: { status: 'CONFIRMED' } });
  } catch (e) {
    logger.warn({ type: 'metrics_payments_error', message: e instanceof Error ? e.message : 'unknown' });
  }
  try {
    paymentManualReview = await prisma.paymentTransaction.count({ where: { status: PaymentTransactionStatus.NEED_REVIEW } });
    paymentTxTotal = await prisma.paymentTransaction.count();
    paymentAutoMatched = await prisma.paymentTransaction.count({ where: { status: PaymentTransactionStatus.AUTO_MATCHED } });
  } catch (e) {
    logger.warn({ type: 'metrics_payment_tx_error', message: e instanceof Error ? e.message : 'unknown' });
  }
  const matchRate = paymentTxTotal > 0 ? (paymentAutoMatched + paymentConfirmed) / paymentTxTotal : 0;
  const outbox = {
    queueLength: Number(queueLength || 0),
    failedCount: Number(failedCount || 0),
  };
  const value = {
    dbStatus: db,
    outbox,
    invoices: {
      total: Number(invoiceTotal ?? 0),
      paid: Number(invoicePaid ?? 0),
      overdue: Number(invoiceOverdue ?? 0),
    },
    payments: {
      matchRate: Number(matchRate ?? 0),
      manualReviewCount: Number(paymentManualReview ?? 0),
      confirmedCount: Number(paymentConfirmed ?? 0),
    },
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external ?? 0,
    },
    cpu: {
      load1: cpuLoad[0] ?? 0,
      load5: cpuLoad[1] ?? 0,
      load15: cpuLoad[2] ?? 0,
      cores: os.cpus().length,
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
  
  // Cache for 5 minutes (300000ms)
  metricsCache.set('metrics', value, 300000);
  
  return NextResponse.json({ success: true, data: value } as ApiResponse<typeof value>);
});
