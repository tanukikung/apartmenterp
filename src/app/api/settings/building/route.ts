import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole, getRequestIp } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

const BUILDING_KEYS = [
  'building.name',
  'building.address',
  'building.phone',
  'building.email',
  'building.taxId',
  'building.logoUrl',
] as const;

type BuildingKey = (typeof BUILDING_KEYS)[number];

const updateBuildingSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal('')),
  taxId: z.string().max(30).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
});

function readString(configs: { key: string; value: unknown }[], key: string): string {
  const found = configs.find((c) => c.key === key);
  if (!found) return '';
  return typeof found.value === 'string' ? found.value : String(found.value ?? '');
}

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const configs = await prisma.config.findMany({
    where: { key: { in: [...BUILDING_KEYS] } },
  });

  const data = {
    name: readString(configs, 'building.name'),
    address: readString(configs, 'building.address'),
    phone: readString(configs, 'building.phone'),
    email: readString(configs, 'building.email'),
    taxId: readString(configs, 'building.taxId'),
    logoUrl: readString(configs, 'building.logoUrl'),
    updatedAt: configs.length > 0
      ? configs.reduce<string | null>((latest, c) => {
          const ts = (c as { updatedAt?: Date }).updatedAt;
          if (!ts) return latest;
          const iso = ts instanceof Date ? ts.toISOString() : String(ts);
          if (!latest) return iso;
          return iso > latest ? iso : latest;
        }, null)
      : null,
  };

  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
});

export const PUT = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const body = updateBuildingSchema.parse(await req.json());

  const keyValuePairs: Array<{ key: BuildingKey; value: string; description: string }> = [
    { key: 'building.name', value: body.name ?? '', description: 'Building name' },
    { key: 'building.address', value: body.address ?? '', description: 'Building address' },
    { key: 'building.phone', value: body.phone ?? '', description: 'Building phone number' },
    { key: 'building.email', value: body.email ?? '', description: 'Building contact email' },
    { key: 'building.taxId', value: body.taxId ?? '', description: 'Building tax ID' },
    { key: 'building.logoUrl', value: body.logoUrl ?? '', description: 'Building logo URL' },
  ];

  await prisma.$transaction(
    keyValuePairs.map(({ key, value, description }) =>
      prisma.config.upsert({
        where: { key },
        update: { value, description },
        create: { key, value, description },
      })
    )
  );

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'BUILDING_SETTINGS_UPDATED',
    entityType: 'Config',
    entityId: 'building',
    metadata: {
      name: body.name,
      address: body.address,
      phone: body.phone,
      email: body.email,
      taxId: body.taxId,
    },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({
    success: true,
    data: body,
    message: 'Building profile saved',
  } as ApiResponse<typeof body>);
});
