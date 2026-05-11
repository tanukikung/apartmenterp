import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/infrastructure/storage';
import { verifyDocumentAccessToken, markTokenUsed } from '@/modules/documents/document-access.service';
import { logAudit } from '@/modules/audit';

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const rawToken = params.token;

  // Step 1: Validate token
  const tokenRecord = await verifyDocumentAccessToken(rawToken);
  if (!tokenRecord) {
    return NextResponse.json(
      { success: false, error: 'Document not found or link has expired.', code: 'TOKEN_INVALID' },
      { status: 404 },
    );
  }

  let fileBuffer: Buffer | null = null;
  const contentType = 'application/pdf';
  let safeFileName = 'document.pdf';
  let entityType = 'UNKNOWN';
  let entityId = 'unknown';

  if (tokenRecord.documentId) {
    // ── GeneratedDocument: fetch PDF from R2 via storageKey ────────────────
    const { prisma } = await import('@/lib/db/client');
    const doc = await prisma.generatedDocument.findUnique({
      where: { id: tokenRecord.documentId },
      include: {
        files: {
          where: { role: 'PDF' },
          include: { uploadedFile: true },
        },
      },
    });

    if (!doc || doc.status === 'ARCHIVED' || doc.status === 'FAILED') {
      return NextResponse.json(
        { success: false, error: 'Document not found or no longer available.', code: 'DOCUMENT_MISSING' },
        { status: 404 },
      );
    }

    const pdfFile = doc.files[0];
    if (!pdfFile) {
      return NextResponse.json(
        { success: false, error: 'Document file not found.', code: 'FILE_MISSING' },
        { status: 404 },
      );
    }

    safeFileName = `${doc.title.replace(/[^a-zA-Z0-9ก-๙\-_ ]/g, '').replace(/\s+/g, '-')}.pdf`;
    entityType = 'GENERATED_DOCUMENT';
    entityId = doc.id;

    try {
      const storage = getStorage();
      fileBuffer = await storage.downloadFile(pdfFile.uploadedFile.storageKey);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve document.', code: 'STORAGE_ERROR' },
        { status: 500 },
      );
    }

  } else if (tokenRecord.invoiceId) {
    // ── Invoice: proxy to our own /api/invoices/[id]/pdf endpoint ──────────
    entityType = 'INVOICE';
    entityId = tokenRecord.invoiceId;

    const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
    const invoicePdfUrl = `${baseUrl}/api/invoices/${tokenRecord.invoiceId}/pdf`;

    let pdfResponse: Response;
    try {
      pdfResponse = await fetch(invoicePdfUrl, {
        headers: {
          'Host': req.headers.get('host') || '',
          'Accept': 'application/pdf',
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve document.', code: 'DOWNLOAD_ERROR' },
        { status: 500 },
      );
    }

    if (!pdfResponse.ok) {
      if (pdfResponse.status === 410) {
        return NextResponse.json(
          { success: false, error: 'This invoice has been cancelled.', code: 'INVOICE_CANCELLED' },
          { status: 410 },
        );
      }
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve document.', code: 'INVOICE_FETCH_FAILED' },
        { status: 500 },
      );
    }

    fileBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    safeFileName = `invoice-${tokenRecord.invoiceId.slice(-8)}.pdf`;

  } else {
    return NextResponse.json(
      { success: false, error: 'Document not found.', code: 'TOKEN_NO_TARGET' },
      { status: 404 },
    );
  }

  // Step 2: Mark token as used
  await markTokenUsed(tokenRecord.id);

  // Step 3: Audit event (fire-and-forget)
  logAudit({
    action: 'DOCUMENT_ACCESS_TOKEN_USED',
    entityType,
    entityId,
    metadata: {
      tokenId: tokenRecord.id,
      purpose: tokenRecord.purpose,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    },
  }).catch(() => {});

  // Step 4: Stream response — Buffer is runtime-compatible with BodyInit (Uint8Array subclass)
  return new NextResponse(new Uint8Array(fileBuffer!), {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `inline; filename="${safeFileName}"`,
      'cache-control': 'private, no-store',
    },
  });
}