import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { getInvoicePDFService } from '@/modules/invoices/invoice-pdf.service';
import { z } from 'zod';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export const GET = asyncHandler(async (request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
  // Validate route params
  const validation = paramsSchema.safeParse(params);
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid invoice ID', details: validation.error.errors },
      { status: 400 }
    );
  }

  const { id } = validation.data;
  
  // Parse query parameters
  const searchParams = request.nextUrl.searchParams;
  const download = searchParams.get('download') === 'true';
  const template = searchParams.get('template') || 'standard';
  const includeQR = searchParams.get('includeQR') !== 'false';

  try {
    const pdfService = getInvoicePDFService();
    const pdfBuffer = await pdfService.generateInvoicePDF(id, {
      template: template as 'standard' | 'detailed',
      includeQRCode: includeQR,
    });

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    
    if (download) {
      headers.set('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`);
    } else {
      headers.set('Content-Disposition', `inline; filename="invoice-${id}.pdf"`);
    }

    headers.set('Cache-Control', 'public, max-age=86400'); // 24 hours
    headers.set('ETag', `"${id}-${Date.now()}"`);

    const body = new Uint8Array(pdfBuffer);
    return new NextResponse(body, { status: 200, headers });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    console.error('Failed to generate invoice PDF:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
});
