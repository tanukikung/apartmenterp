import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedActor } from '@/lib/auth/guards';
import { AppError, asyncHandler, type ApiResponse, formatError } from '@/lib/utils/errors';
import { getBackupPrerequisiteFailure, runBackup } from '@/lib/ops/backup';
import { logger } from '@/lib/utils/logger';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  getVerifiedActor(req, { allowSystem: true });
  const prerequisiteFailure = getBackupPrerequisiteFailure();
  if (prerequisiteFailure) {
    throw new AppError(
      prerequisiteFailure.message,
      'BACKUP_PREREQUISITES_MISSING',
      503,
      { missing: prerequisiteFailure.missing },
    );
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
