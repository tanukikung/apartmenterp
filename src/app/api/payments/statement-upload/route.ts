import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { asyncHandler, ValidationError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { bankStatementParser } from '@/modules/payments/bank-statement-parser';
import { logAudit } from '@/modules/audit/audit.service';
import { logger } from '@/lib/utils/logger';
import { getStorage } from '@/infrastructure/storage';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { enqueueJob } from '@/lib/queue/job-queue';
import { JOB_TYPE } from '@/lib/queue/types';

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

  // SHA-256 of the raw file content — used as the job idempotency key so
  // uploading the same file twice (even at different times) deduplicates to
  // the same background job instead of importing the statement twice.
  // The storageKey still includes a timestamp so duplicate files in storage
  // are distinguishable, but only ONE processing job is ever created.
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const jobIdempotencyKey = `bank-import-${fileHash}`;
  const storageKey = `bank-statements/${fileHash}-${file.name}`;

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

  // ── Enqueue async processing — return immediately with a job ID ─────────────
  // Previously: the route blocked while processing the entire file (potentially
  // 500+ DB operations, 30+ seconds). For 1000 tenants with large statements
  // this caused HTTP timeouts and blocked the server thread.
  // Now: parsing is synchronous (fast, in-memory), processing is async.
  const jobId = await enqueueJob(JOB_TYPE.BANK_STATEMENT_IMPORT, {
    entries: entries.map(e => ({
      date: e.date.toISOString(),
      time: e.time,
      amount: e.amount,
      description: e.description,
      reference: e.reference,
      roomNo: e.roomNo,
    })),
    sourceFile: file.name,
    storageKey,
    fileHash,
    actorId: session.sub,
    actorRole: session.role,
  }, { idempotencyKey: jobIdempotencyKey });

  await logAudit({
    req: request,
    action: 'BANK_STATEMENT_UPLOADED',
    entityType: 'PAYMENT_TRANSACTION',
    entityId: file.name,
    metadata: { totalEntries: entries.length, jobId, storageKey },
  });

  logger.info({
    type: 'bank_statement_enqueued',
    actorId: session.sub,
    fileName: file.name,
    totalEntries: entries.length,
    jobId,
  });

  return NextResponse.json({
    success: true,
    data: {
      jobId,
      totalEntries: entries.length,
      storageKey,
      message: `Import enqueued. Poll /api/payments/statement-upload/${jobId} for status.`,
    },
  }, { status: 202 });
});
