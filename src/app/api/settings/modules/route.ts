import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { DEFAULT_MODULE_FLAGS, ModuleFlags, ModuleKey } from '@/lib/permissions';

const MODULES_KEY = 'system.modules';

const MODULE_KEYS = new Set<ModuleKey>([
  'contracts', 'moveouts', 'line', 'chat', 'messageSequences',
  'documents', 'templates', 'deliveryOrders', 'analytics', 'auditLogs',
  'automation',
]);

const updateModulesSchema = z.object({
  contracts: z.boolean().optional(),
  moveouts: z.boolean().optional(),
  line: z.boolean().optional(),
  chat: z.boolean().optional(),
  messageSequences: z.boolean().optional(),
  documents: z.boolean().optional(),
  templates: z.boolean().optional(),
  deliveryOrders: z.boolean().optional(),
  analytics: z.boolean().optional(),
  auditLogs: z.boolean().optional(),
  automation: z.boolean().optional(),
});

function mergeWithDefaults(stored: Partial<ModuleFlags>): ModuleFlags {
  return { ...DEFAULT_MODULE_FLAGS, ...stored };
}

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const config = await prisma.config.findUnique({ where: { key: MODULES_KEY } });

  const modules: ModuleFlags = config?.value && typeof config.value === 'object'
    ? mergeWithDefaults(config.value as Partial<ModuleFlags>)
    : { ...DEFAULT_MODULE_FLAGS };

  return NextResponse.json({ success: true, data: { modules } } as ApiResponse<{ modules: ModuleFlags }>);
});

export const PUT = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const body = updateModulesSchema.parse(await req.json());

  // Filter to only known keys
  const validUpdates: Partial<ModuleFlags> = {};
  for (const key of MODULE_KEYS) {
    if (key in body) {
      (validUpdates as Record<string, boolean>)[key] = (body as Record<string, unknown>)[key] as boolean;
    }
  }

  const current = await prisma.config.findUnique({ where: { key: MODULES_KEY } });
  const currentModules: ModuleFlags = current?.value && typeof current.value === 'object'
    ? mergeWithDefaults(current.value as Partial<ModuleFlags>)
    : { ...DEFAULT_MODULE_FLAGS };

  const updatedModules: ModuleFlags = { ...currentModules, ...validUpdates };

  await prisma.config.upsert({
    where: { key: MODULES_KEY },
    update: {
      value: updatedModules,
      description: 'System module feature flags',
    },
    create: {
      key: MODULES_KEY,
      value: updatedModules,
      description: 'System module feature flags',
    },
  });

  await logAudit({
    req,
    action: 'MODULE_SETTINGS_UPDATED',
    entityType: 'Config',
    entityId: MODULES_KEY,
    metadata: { updatedModules },
  });

  return NextResponse.json({
    success: true,
    data: { modules: updatedModules },
    message: 'Module settings saved',
  } as ApiResponse<{ modules: ModuleFlags }>);
});
