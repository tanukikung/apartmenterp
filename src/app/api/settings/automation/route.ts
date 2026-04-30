import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// ────────────────────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────────────────────
const DEFAULTS = {
  billingCron: '0 3 1 * *',
  reminderCron: '0 8 * * *',
  overdueCron: '0 4 * * *',
  backupCron: '0 3 * * *',
} as const;

const AUTOMATION_KEYS = [
  'automation.billingCron',
  'automation.reminderCron',
  'automation.overdueCron',
  'automation.backupCron',
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Cron expression validator: must be a valid 5-part cron string
// Accepts digits, *, /, -, and comma in each field
// ────────────────────────────────────────────────────────────────────────────
const CRON_REGEX = /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)$/;

const cronField = z
  .string()
  .min(1, 'Cron expression is required')
  .regex(CRON_REGEX, 'Invalid cron expression — must be 5 fields (e.g. "0 3 1 * *")');

const updateAutomationSchema = z
  .object({
    billingCron: cronField,
    reminderCron: cronField,
    overdueCron: cronField,
    backupCron: cronField,
  })
  .strict();

// ────────────────────────────────────────────────────────────────────────────
// Cron → human-readable description
// ────────────────────────────────────────────────────────────────────────────
function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, dom, month, dow] = parts;

  const pad = (n: string) => n.padStart(2, '0');
  const timeStr = (h: string, m: string) =>
    `${pad(h)}:${pad(m)}`;

  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = [
    '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const isNum = (s: string) => /^\d+$/.test(s);

  // Every minute
  if (expr === '* * * * *') return 'Every minute';

  // Specific time every day: "0 3 * * *"
  if (isNum(minute) && isNum(hour) && dom === '*' && month === '*' && dow === '*') {
    return `Daily at ${timeStr(hour, minute)}`;
  }

  // Specific time on day-of-week: "0 8 * * 1"
  if (isNum(minute) && isNum(hour) && dom === '*' && month === '*' && isNum(dow)) {
    const dayName = dowNames[Number(dow)] ?? dow;
    return `Every ${dayName} at ${timeStr(hour, minute)}`;
  }

  // Day of month: "0 3 1 * *"
  if (isNum(minute) && isNum(hour) && isNum(dom) && month === '*' && dow === '*') {
    const suffix =
      dom === '1' ? 'st' : dom === '2' ? 'nd' : dom === '3' ? 'rd' : 'th';
    return `Monthly on the ${dom}${suffix} at ${timeStr(hour, minute)}`;
  }

  // Specific month + day: "0 3 1 6 *"
  if (isNum(minute) && isNum(hour) && isNum(dom) && isNum(month) && dow === '*') {
    const mName = monthNames[Number(month)] ?? month;
    return `${mName} ${dom} at ${timeStr(hour, minute)} each year`;
  }

  // Every N minutes: "*/5 * * * *"
  const everyMatch = minute.match(/^\*\/(\d+)$/);
  if (everyMatch && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Every ${everyMatch[1]} minutes`;
  }

  // Every N hours: "0 */2 * * *"
  const everyHourMatch = hour.match(/^\*\/(\d+)$/);
  if (isNum(minute) && everyHourMatch && dom === '*' && month === '*' && dow === '*') {
    return `Every ${everyHourMatch[1]} hours at minute ${minute}`;
  }

  return expr;
}

// ────────────────────────────────────────────────────────────────────────────
// GET
// ────────────────────────────────────────────────────────────────────────────
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const configs = await prisma.config.findMany({
    where: { key: { in: [...AUTOMATION_KEYS] } },
  });

  const readStr = (key: string, fallback: string): string => {
    const found = configs.find((c) => c.key === key);
    if (!found) return fallback;
    return typeof found.value === 'string' ? found.value : String(found.value ?? fallback);
  };

  const billingCron = readStr('automation.billingCron', DEFAULTS.billingCron);
  const reminderCron = readStr('automation.reminderCron', DEFAULTS.reminderCron);
  const overdueCron = readStr('automation.overdueCron', DEFAULTS.overdueCron);
  const backupCron = readStr('automation.backupCron', DEFAULTS.backupCron);

  return NextResponse.json({
    success: true,
    data: {
      billingCron,
      reminderCron,
      overdueCron,
      backupCron,
      descriptions: {
        billingCron: describeCron(billingCron),
        reminderCron: describeCron(reminderCron),
        overdueCron: describeCron(overdueCron),
        backupCron: describeCron(backupCron),
      },
    },
  } as ApiResponse<{
    billingCron: string;
    reminderCron: string;
    overdueCron: string;
    backupCron: string;
    descriptions: Record<string, string>;
  }>);
});

// ────────────────────────────────────────────────────────────────────────────
// PUT
// ────────────────────────────────────────────────────────────────────────────
export const PUT = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`settings-automation-put:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
  const body = updateAutomationSchema.parse(await req.json());

  await prisma.$transaction([
    prisma.config.upsert({
      where: { key: 'automation.billingCron' },
      update: { value: body.billingCron, description: 'Billing generation cron schedule' },
      create: {
        key: 'automation.billingCron',
        value: body.billingCron,
        description: 'Billing generation cron schedule',
      },
    }),
    prisma.config.upsert({
      where: { key: 'automation.reminderCron' },
      update: { value: body.reminderCron, description: 'Payment reminder cron schedule' },
      create: {
        key: 'automation.reminderCron',
        value: body.reminderCron,
        description: 'Payment reminder cron schedule',
      },
    }),
    prisma.config.upsert({
      where: { key: 'automation.overdueCron' },
      update: { value: body.overdueCron, description: 'Overdue check cron schedule' },
      create: {
        key: 'automation.overdueCron',
        value: body.overdueCron,
        description: 'Overdue check cron schedule',
      },
    }),
    prisma.config.upsert({
      where: { key: 'automation.backupCron' },
      update: { value: body.backupCron, description: 'Database backup cron schedule' },
      create: {
        key: 'automation.backupCron',
        value: body.backupCron,
        description: 'Database backup cron schedule',
      },
    }),
  ]);

  await logAudit({
    req,
    action: 'AUTOMATION_SETTINGS_UPDATED',
    entityType: 'Config',
    entityId: 'automation',
    metadata: {
      billingCron: body.billingCron,
      reminderCron: body.reminderCron,
      overdueCron: body.overdueCron,
      backupCron: body.backupCron,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      ...body,
      descriptions: {
        billingCron: describeCron(body.billingCron),
        reminderCron: describeCron(body.reminderCron),
        overdueCron: describeCron(body.overdueCron),
        backupCron: describeCron(body.backupCron),
      },
    },
    message: 'Automation settings saved. Restart the server for changes to take effect.',
  } as ApiResponse<typeof body & { descriptions: Record<string, string> }>);
});
