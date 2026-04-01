import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';
import { getRequestIp, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

const LINE_KEYS = [
  'line.channelId',
  'line.channelSecret',
  'line.accessToken',
  'line.webhookUrl',
] as const;

const updateLineSchema = z
  .object({
    channelId: z.string().min(1, 'Channel ID is required'),
    channelSecret: z.string().min(1, 'Channel Secret is required'),
    accessToken: z.string().min(1, 'Access Token is required'),
    webhookUrl: z.string().url('Webhook URL must be a valid URL'),
  })
  .strict();

function maskSecret(value: string | undefined | null): string {
  if (!value) return '';
  return '••••••••';
}

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const configs = await prisma.config.findMany({
    where: { key: { in: [...LINE_KEYS] } },
  });

  const readStr = (key: string): string | null => {
    const found = configs.find((c) => c.key === key);
    if (!found) return null;
    return typeof found.value === 'string' ? found.value : String(found.value ?? '');
  };

  const env = getEnv();

  // Accept either LINE_ACCESS_TOKEN or LINE_CHANNEL_ACCESS_TOKEN (empty string falls through via ||)
  const envAccessToken = process.env.LINE_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

  // Environment variables take priority when all three are set
  const envOverrideActive = Boolean(
    env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET && envAccessToken,
  );

  const dbChannelId = readStr('line.channelId');
  const dbChannelSecret = readStr('line.channelSecret');
  const dbAccessToken = readStr('line.accessToken');
  const dbWebhookUrl = readStr('line.webhookUrl');

  // Resolve effective values (env wins)
  const effectiveChannelId = env.LINE_CHANNEL_ID || dbChannelId || '';
  const effectiveChannelSecretExists = Boolean(env.LINE_CHANNEL_SECRET || dbChannelSecret);
  const effectiveAccessTokenExists = Boolean(envAccessToken || dbAccessToken);

  const connected = Boolean(effectiveChannelId && effectiveChannelSecretExists && effectiveAccessTokenExists);

  const appBaseUrl = env.APP_BASE_URL || 'https://your-domain.com';
  const webhookUrl = dbWebhookUrl || `${appBaseUrl}/api/line/webhook`;

  return NextResponse.json({
    success: true,
    data: {
      channelId: effectiveChannelId,
      channelSecret: maskSecret(env.LINE_CHANNEL_SECRET || dbChannelSecret),
      accessToken: maskSecret(envAccessToken || dbAccessToken),
      webhookUrl,
      envOverrideActive,
      connected,
      // DB-stored values exist (separate from env)
      hasDbChannelId: Boolean(dbChannelId),
      hasDbChannelSecret: Boolean(dbChannelSecret),
      hasDbAccessToken: Boolean(dbAccessToken),
    },
  } as ApiResponse<{
    channelId: string;
    channelSecret: string;
    accessToken: string;
    webhookUrl: string;
    envOverrideActive: boolean;
    connected: boolean;
    hasDbChannelId: boolean;
    hasDbChannelSecret: boolean;
    hasDbAccessToken: boolean;
  }>);
});

export const PUT = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const body = updateLineSchema.parse(await req.json());

  await prisma.$transaction([
    prisma.config.upsert({
      where: { key: 'line.channelId' },
      update: { value: body.channelId, description: 'LINE Channel ID' },
      create: { key: 'line.channelId', value: body.channelId, description: 'LINE Channel ID' },
    }),
    prisma.config.upsert({
      where: { key: 'line.channelSecret' },
      update: { value: body.channelSecret, description: 'LINE Channel Secret' },
      create: {
        key: 'line.channelSecret',
        value: body.channelSecret,
        description: 'LINE Channel Secret',
      },
    }),
    prisma.config.upsert({
      where: { key: 'line.accessToken' },
      update: { value: body.accessToken, description: 'LINE Channel Access Token' },
      create: {
        key: 'line.accessToken',
        value: body.accessToken,
        description: 'LINE Channel Access Token',
      },
    }),
    prisma.config.upsert({
      where: { key: 'line.webhookUrl' },
      update: { value: body.webhookUrl, description: 'LINE Webhook URL' },
      create: { key: 'line.webhookUrl', value: body.webhookUrl, description: 'LINE Webhook URL' },
    }),
  ]);

  // Audit log — never include actual secret/token values
  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'LINE_INTEGRATION_UPDATED',
    entityType: 'Config',
    entityId: 'line',
    metadata: {
      channelIdUpdated: true,
      channelSecretUpdated: true,
      accessTokenUpdated: true,
      webhookUrl: body.webhookUrl,
    },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({
    success: true,
    data: { saved: true, webhookUrl: body.webhookUrl },
    message: 'LINE integration settings saved',
  } as ApiResponse<{ saved: boolean; webhookUrl: string }>);
});
