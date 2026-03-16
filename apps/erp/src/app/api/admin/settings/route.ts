import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';
import { getRequestIp, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

// .strict() causes Zod to reject any keys not in this schema with a ZodError,
// preventing arbitrary config keys from being silently accepted or injected.
const updateSettingsSchema = z.object({
  billingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(31),
  overdueDay: z.number().int().min(1).max(31),
}).strict();

const settingKeys = ['billing.billingDay', 'billing.dueDay', 'billing.overdueDay'] as const;

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const configs = await prisma.config.findMany({
    where: {
      key: { in: [...settingKeys] },
    },
  });

  const readNumber = (key: string, fallback: number): number => {
    const found = configs.find((config) => config.key === key);
    return typeof found?.value === 'number' ? found.value : Number(found?.value ?? fallback);
  };

  const env = getEnv();

  return NextResponse.json({
    success: true,
    data: {
      billingDay: readNumber('billing.billingDay', 1),
      dueDay: readNumber('billing.dueDay', 5),
      overdueDay: readNumber('billing.overdueDay', 15),
      appBaseUrl: env.APP_BASE_URL || '',
      lineChannelIdConfigured: Boolean(env.LINE_CHANNEL_ID),
      lineAccessTokenConfigured: Boolean(env.LINE_ACCESS_TOKEN),
    },
  } as ApiResponse<{
    billingDay: number;
    dueDay: number;
    overdueDay: number;
    appBaseUrl: string;
    lineChannelIdConfigured: boolean;
    lineAccessTokenConfigured: boolean;
  }>);
});

export const PUT = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const body = updateSettingsSchema.parse(await req.json());

  await prisma.$transaction([
    prisma.config.upsert({
      where: { key: 'billing.billingDay' },
      update: { value: body.billingDay, description: 'Billing day of month' },
      create: { key: 'billing.billingDay', value: body.billingDay, description: 'Billing day of month' },
    }),
    prisma.config.upsert({
      where: { key: 'billing.dueDay' },
      update: { value: body.dueDay, description: 'Invoice due day of month' },
      create: { key: 'billing.dueDay', value: body.dueDay, description: 'Invoice due day of month' },
    }),
    prisma.config.upsert({
      where: { key: 'billing.overdueDay' },
      update: { value: body.overdueDay, description: 'Overdue threshold day of month' },
      create: { key: 'billing.overdueDay', value: body.overdueDay, description: 'Overdue threshold day of month' },
    }),
  ]);

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'BILLING_SETTINGS_UPDATED',
    entityType: 'Config',
    entityId: 'billing',
    metadata: body,
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({
    success: true,
    data: body,
    message: 'Billing settings saved',
  } as ApiResponse<typeof body>);
});
