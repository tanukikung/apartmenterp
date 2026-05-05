import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

/**
 * Server warmup endpoint — NO Redis, NO auth, NO rate limit.
 * Pre-compiles Prisma client connection pool so the first real user
 * request completes in <20ms instead of ~2800ms.
 *
 * Called internally by instrumentation.ts on server startup (non-blocking).
 * Also callable by load balancers / health checks.
 */
export const dynamic = 'force-dynamic';

export const GET = async () => {
  const t0 = Date.now();

  // Warm up Prisma pool — establishes a connection without running a heavy query
  await prisma.$queryRaw`SELECT 1`;
  const dbWarm = Date.now() - t0;

  return NextResponse.json({
    success: true,
    data: {
      warmed: true,
      dbWarmMs: dbWarm,
      redisWarmMs: 0,
      totalMs: Date.now() - t0,
      pid: process.pid,
    },
  });
};