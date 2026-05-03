/**
 * Background Job Queue — type definitions
 *
 * Consistent with the existing Outbox / Transactional-Outbox architecture.
 * Jobs are stored in the `background_jobs` table and polled by a worker
 * running inside the Next.js instrumentation hook (same process as Outbox).
 *
 * The queue deliberately does NOT require Redis or BullMQ — it uses
 * PostgreSQL's `SELECT … FOR UPDATE SKIP LOCKED` to prevent duplicate
 * execution across multiple app instances (blue-green, scale-out).
 */

export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'DEAD';

export interface JobPayload {
  type: string;
  data: Record<string, unknown>;
}

// ── Job type registry ─────────────────────────────────────────────────────────

export const JOB_TYPE = {
  BANK_STATEMENT_IMPORT: 'BANK_STATEMENT_IMPORT',
  BILLING_GENERATE:      'BILLING_GENERATE',
  PDF_GENERATE:          'PDF_GENERATE',
} as const;

export type JobType = (typeof JOB_TYPE)[keyof typeof JOB_TYPE];

// ── Per-job payload shapes ────────────────────────────────────────────────────

export interface BankStatementImportPayload {
  entries: Array<{
    date: string;       // ISO-8601
    time?: string;
    amount: number;
    description?: string;
    reference?: string;
    roomNo?: string;
  }>;
  sourceFile: string;
  storageKey?: string;
  actorId: string;
  actorRole: string;
}

export interface BillingGeneratePayload {
  year: number;
  month: number;
  triggeredBy: string;
}

export interface PdfGeneratePayload {
  invoiceId: string;
  triggeredBy: string;
}
