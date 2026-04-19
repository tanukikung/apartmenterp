import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getAlerts, clearAlerts, getActiveAlertCount } from '@/lib/metrics/alerts';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);

  const alerts = getAlerts();
  const activeCount = getActiveAlertCount();

  return NextResponse.json({
    success: true,
    data: {
      alerts,
      activeCount,
    },
  });
});

export const DELETE = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);
  clearAlerts();
  return NextResponse.json({ success: true, data: { cleared: true } });
});
