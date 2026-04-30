import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, ValidationError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';
import { bankStatementParser } from '@/modules/payments/bank-statement-parser';
import { logAudit } from '@/modules/audit/audit.service';
import { logger } from '@/lib/utils/logger';
import { getStorage } from '@/infrastructure/storage';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const DOCUMENT_WINDOW_MS = 60 * 1000;
const DOCUMENT_MAX_ATTEMPTS = 5;

// ── POST /api/payments/statement-upload ───────────────────────────────────────
// Canonical route for bank statement import.
// Accepts multipart/form-data with a `file` field (CSV or XLSX ≤ 10 MB).
// Parses, persists each transaction, runs auto-matching, and audits the actor.

export const POST = asyncHandler(async (request: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`payments-statement-upload:${ip}`, DOCUMENT_MAX_ATTEMPTS, DOCUMENT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many upload requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(request, ['ADMIN', 'STAFF', 'OWNER']);

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

  // Optional column-mapping override. Lets the operator point at non-standard
  // column headers (e.g. Thai-language exports) when auto-detection fails.
  // Pass form fields:  dateColumn, amountColumn, descriptionColumn,
  // referenceColumn, timeColumn, dateFormat, skipRows.
  const parseOptions: Parameters<typeof bankStatementParser.parseCSV>[1] = {};
  const fieldMap: Record<string, keyof typeof parseOptions> = {
    dateColumn: 'dateColumn',
    timeColumn: 'timeColumn',
    amountColumn: 'amountColumn',
    descriptionColumn: 'descriptionColumn',
    referenceColumn: 'referenceColumn',
    dateFormat: 'dateFormat',
  };
  for (const [formKey, optKey] of Object.entries(fieldMap)) {
    const v = formData.get(formKey);
    if (typeof v === 'string' && v.trim().length > 0) {
      (parseOptions as Record<string, unknown>)[optKey] = v.trim();
    }
  }
  const skipRowsRaw = formData.get('skipRows');
  if (typeof skipRowsRaw === 'string' && skipRowsRaw.trim().length > 0) {
    const n = Number(skipRowsRaw);
    if (Number.isFinite(n) && n >= 0) parseOptions.skipRows = n;
  }

  let entries;
  try {
    if (fileName.endsWith('.csv')) {
      entries = bankStatementParser.parseCSV(buffer.toString('utf-8'), parseOptions);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      entries = bankStatementParser.parseExcel(buffer, parseOptions);
    } else {
      return NextResponse.json(
        { success: false, error: { message: 'Unsupported file format. Accepted: CSV, XLSX.' } },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.warn({
      type: 'bank_statement_parse_validation_failed',
      fileName: file.name,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ValidationError(
      'Invalid statement file. Upload a CSV or Excel bank statement with readable date and amount columns.',
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
  const service = getServiceContainer().paymentMatchingService;
  const result = await service.importBankStatement(entries, file.name, {
    actorId: session.sub,
    actorRole: session.role,
  });

  // Audit log with real actor from session (not hardcoded 'system').
  await logAudit({
    req: request,
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
