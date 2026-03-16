import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse, formatError } from '@/lib/utils/errors';
import { runBackup } from '@/lib/ops/backup';
import { logger } from '@/lib/utils/logger';

function isAuthorized(req: NextRequest): boolean {
  const cookieRole = req.cookies.get('role')?.value;
  if (cookieRole === 'ADMIN' || cookieRole === 'STAFF') {
    return true;
  }
  const secret = req.headers.get('x-cron-secret');
  if (secret && process.env.CRON_SECRET && secret === process.env.CRON_SECRET) {
    return true;
  }
  return false;
}

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  const start = Date.now();
  try {
    await runBackup();
    const data = {
      triggered: true,
      durationMs: Date.now() - start,
      at: new Date().toISOString(),
    };
    logger.info({ type: 'backup_manual_triggered', durationMs: data.durationMs });
    return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ type: 'backup_manual_failed', message });
    const response = formatError(e);
    return NextResponse.json(response, { status: response.error.statusCode });
  }
});
