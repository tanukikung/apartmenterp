import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { envHealth } from '@/lib/config/env';

// Readiness probe: returns 200 only if the app can serve real traffic
// (env vars loaded + DB reachable). A failure here makes the orchestrator
// remove the pod from the load balancer but NOT restart it.
export const GET = async () => {
  const env = envHealth();
  if (env.status !== 'ok') {
    return NextResponse.json(
      { status: 'not_ready', reason: 'env', missing: env.missing },
      { status: 503 },
    );
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ready' }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'not_ready',
        reason: 'database',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 },
    );
  }
};
