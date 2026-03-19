import { NextRequest, NextResponse } from 'next/server';
import { getBillingService } from '@/modules/billing/billing.service';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getSessionFromRequest } from '@/lib/auth/session';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const form = await req.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          name: 'BadRequest',
          message: 'Missing file — send a multipart/form-data request with a "file" field',
          code: 'BAD_REQUEST',
          statusCode: 400,
        },
      },
      { status: 400 }
    );
  }

  // Optional: validate extension
  if (!file.name.endsWith('.xlsx')) {
    return NextResponse.json(
      {
        success: false,
        error: {
          name: 'BadRequest',
          message: 'Only .xlsx files are accepted',
          code: 'BAD_REQUEST',
          statusCode: 400,
        },
      },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  // Determine importedBy from session or form override
  let importedBy: string | undefined;
  try {
    const session = getSessionFromRequest(req);
    importedBy = session?.username ?? undefined;
  } catch {
    // session is optional — fall back gracefully
  }
  if (!importedBy) {
    const formUser = form.get('importedBy');
    if (formUser) importedBy = String(formUser);
  }

  const billingService = getBillingService();
  const result = await billingService.importFullWorkbook(buffer, importedBy);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
