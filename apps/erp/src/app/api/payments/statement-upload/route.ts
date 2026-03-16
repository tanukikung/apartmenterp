import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getPaymentMatchingService } from '@/modules/payments/payment-matching.service';
import { bankStatementParser } from '@/modules/payments/bank-statement-parser';
import { logAudit } from '@/modules/audit/audit.service';
import { logger } from '@/lib/utils/logger';
import { getStorage } from '@/infrastructure/storage';

// ── POST /api/payments/statement-upload ───────────────────────────────────────
// Canonical route for bank statement import.
// Accepts multipart/form-data with a `file` field (CSV or XLSX ≤ 10 MB).
// Parses, persists each transaction, runs auto-matching, and audits the actor.

export const POST = asyncHandler(async (request: NextRequest): Promise<NextResponse> => {
  const session = requireRole(request, ['ADMIN', 'STAFF']);

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json(
      { success: false, error: { message: 'No file provided' } },
      { status: 400 }
    );
  }

  const maxSize = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxSize) {
    return NextResponse.json(
      { success: false, error: { message: 'File too large. Maximum size is 10 MB.' } },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();
  const storageKey = `bank-statements/${Date.now()}-${file.name}`;

  let entries;
  if (fileName.endsWith('.csv')) {
    entries = bankStatementParser.parseCSV(buffer.toString('utf-8'));
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    entries = bankStatementParser.parseExcel(buffer);
  } else {
    return NextResponse.json(
      { success: false, error: { message: 'Unsupported file format. Accepted: CSV, XLSX.' } },
      { status: 400 }
    );
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { success: false, error: { message: 'No valid transaction entries found in file.' } },
      { status: 422 }
    );
  }

  // Best-effort: persist raw file to storage (S3 / local).
  // Failure here does not abort the import.
  try {
    const storage = getStorage();
    await storage.uploadFile({
      key: storageKey,
      content: buffer,
      contentType: file.type || 'application/octet-stream',
    });
  } catch (e) {
    logger.warn({
      type: 'bank_statement_store_failed',
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Persist transaction rows and attempt auto-matching.
  const service = getPaymentMatchingService();
  const result = await service.importBankStatement(entries, file.name);

  // Audit log with real actor from session (not hardcoded 'system').
  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'BANK_STATEMENT_UPLOADED',
    entityType: 'PAYMENT_TRANSACTION',
    entityId: file.name,
    metadata: {
      totalEntries: entries.length,
      imported: result.imported,
      matched: result.matched,
      storageKey,
    },
  });

  logger.info({
    type: 'bank_statement_uploaded',
    actorId: session.sub,
    fileName: file.name,
    totalEntries: entries.length,
    imported: result.imported,
    matched: result.matched,
  });

  return NextResponse.json({
    success: true,
    data: {
      totalEntries: entries.length,
      imported: result.imported,
      matched: result.matched,
      unmatched: result.imported - result.matched,
      storageKey,
    },
  });
});
