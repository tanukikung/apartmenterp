import { NextRequest, NextResponse } from 'next/server';
import { getLoginRateLimiter, getApiRateLimiter } from '@/lib/utils/rate-limit';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-test-secret');
  const allowedSecret = process.env.RATE_LIMIT_RESET_SECRET;
  // Require the env var to be set; reject in production if missing
  if (!allowedSecret || secret !== allowedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Reset all rate limiters
  getLoginRateLimiter().reset();
  getApiRateLimiter().reset();
  return NextResponse.json({ success: true, message: 'All rate limiters reset' });
}
