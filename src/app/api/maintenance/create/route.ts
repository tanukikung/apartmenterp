import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getServiceContainer } from '@/lib/service-container';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

const createSchema = z.object({
  roomId: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  attachments: z
    .array(
      z.object({
        fileUrl: z.string().url(),
        fileType: z.string().min(1),
      })
    )
    .optional(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`maintenance-create:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  // This is a PUBLIC endpoint — accessible without login.
  // The actor is always 'anonymous'; the tenantId in the body is the ticket owner
  // (it is NOT treated as a trusted audit actor).
  const session = getSessionFromRequest(req);
  const actor = session
    ? { actorId: session.sub, actorRole: session.role }
    : { actorId: 'anonymous', actorRole: 'ANONYMOUS' };

  const input = createSchema.parse(await req.json());

  const { maintenanceService: service } = getServiceContainer();
  const ticket = await service.createTicket(
    {
      roomId: input.roomId,
      tenantId: input.tenantId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      attachments: input.attachments
        ? input.attachments.map((a) => ({ fileUrl: a.fileUrl, fileType: a.fileType }))
        : undefined,
    },
    actor
  );

  return NextResponse.json({
    success: true,
    data: ticket,
  } as ApiResponse<typeof ticket>, { status: 201 });
});
