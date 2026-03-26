import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const [initializedConfig, roomCount, tenantCount] = await Promise.all([
    prisma.config.findUnique({ where: { key: 'system.initialized' } }),
    prisma.room.count(),
    prisma.tenant.count(),
  ]);

  const initialized = initializedConfig?.value === true;
  const hasData = roomCount > 0 || tenantCount > 0;

  return NextResponse.json({
    success: true,
    data: {
      initialized,
      hasData,
      dataSummary: hasData ? { rooms: roomCount, tenants: tenantCount } : undefined,
    },
  } as ApiResponse<{
    initialized: boolean;
    hasData: boolean;
    dataSummary?: { rooms: number; tenants: number };
  }>);
});
