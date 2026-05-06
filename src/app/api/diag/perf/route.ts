import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler } from '@/lib/utils/errors';
import { requireOperator } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

// Measure each part of ensureRedisConnected individually
const rawHandler = async function(req: NextRequest) {
  const t0 = Date.now();

  // Step 1: requireOperator
  const t1 = Date.now();
  await requireOperator(req);
  const authDur = Date.now() - t1;

  // Step 2: isRedisConfigured + getRedisClient
  const t2 = Date.now();
  const { isRedisConfigured, getRedisClient } = await import('@/infrastructure/redis');
  const configured = isRedisConfigured();
  const rawClient = getRedisClient();
  const clientDur = Date.now() - t2;

  // Step 3: loadDistributedState (inside checkCircuitBeforeConnect)
  const t3 = Date.now();
  let distDur = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let distResult: any = null;
  if (rawClient) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      distResult = await (rawClient as any).get('apt:cb:redis');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      distResult = 'err:' + (e as { message?: string }).message;
    }
    distDur = Date.now() - t3;
  }

  // Step 4: try c.connect() and measure how long
  const t4 = Date.now();
  let connectDur = 0;
  let connectErr = '';
  if (rawClient) {
    try {
      await rawClient.connect();
      connectDur = Date.now() - t4;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      connectErr = (e as { message?: string }).message || 'unknown';
      connectDur = Date.now() - t4;
    }
  }

  // Step 5: Prisma query
  const t5 = Date.now();
  await prisma.invoice.findMany({ take: 20, orderBy: { createdAt: 'desc' } });
  const listDur = Date.now() - t5;

  return NextResponse.json({
    success: true,
    timings: {
      auth: authDur,
      getClient: clientDur,
      redisGet: distDur,
      connect: connectDur,
      listQuery: listDur,
      total: Date.now() - t0,
      redisConfigured: configured,
      hasClient: !!rawClient,
      distResult,
      connectErr,
    },
    ts: new Date().toISOString(),
    pid: process.pid,
  });
};

export const GET = asyncHandler(rawHandler);
