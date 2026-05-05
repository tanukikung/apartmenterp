import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';
import { withIdempotency } from '@/lib/utils/idempotency';
import { requireMutationsAllowed } from '@/lib/guards/system';

const undoCancelSchema = z.object({
  reason: z.string().min(5, 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'),
});

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    return withIdempotency(req, 'invoice_undo_cancel', async () => {
      const blocked = await requireMutationsAllowed();
      if (blocked) return blocked;

      const session = await await requireRole(req, ['ADMIN', 'OWNER']);
      const _ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
      const requestId = req.headers.get('x-request-id') ?? undefined;

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
          { status: 400 }
        );
      }

      const validation = undoCancelSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: { message: validation.error.errors[0]?.message ?? 'Invalid input', statusCode: 400, name: 'ValidationError', code: 'VALIDATION_ERROR' } },
          { status: 400 }
        );
      }

      const { reason } = validation.data;
      const { invoiceService } = getServiceContainer();

      const result = await invoiceService.undoCancelInvoice(
        params.id,
        session.sub,
        reason,
        requestId,
      );

      return NextResponse.json(
        { success: true, data: result, message: 'การยกเลิกถูกย้อนกลับแล้ว' } as ApiResponse<unknown>,
        { status: 200 }
      );
    });
  }
);