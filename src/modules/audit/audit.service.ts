import { createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { auditLogger } from '@/lib/utils/logger';
import { getAuthSecret } from '@/lib/config/env';
import { getVerifiedActor } from '@/lib/auth/guards';

/**
 * Audit log chain integrity using HMAC-SHA256 signatures.
 *
 * Each entry's `previousSignature` field stores the HMAC of the PREVIOUS entry.
 * This creates an immutable chain — modifying any historical entry breaks all
 * subsequent signatures and is detectable by running verifyAuditLogChain().
 *
 * Schema additions:
 *   previousSignature String?  — HMAC of the preceding entry (NULL for the first entry)
 *   entityVersion     Int      — version counter of the audited entity for concurrent-edit detection
 */

// Well-known genesis signature — all zeros (64 hex chars). Used as previousSignature for the first entry.
const GENESIS_SIGNATURE = '0'.repeat(64);

// Fields included in HMAC computation (order matters — must be consistent)
const SIGNED_FIELD_NAMES = [
  'id',
  'action',
  'entityType',
  'entityId',
  'userId',
  'userName',
  'details',
  'ipAddress',
  'createdAt',
  'entityVersion',
] as const;

export type AuditAction =
  // Payment & Billing
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_IMPORTED'
  | 'INVOICE_GENERATED'
  | 'INVOICE_REGENERATED'
  | 'INVOICE_CANCELLED'
  | 'INVOICE_SEND_REQUESTED'
  // Chat & Messaging
  | 'CHAT_MESSAGE_SENT'
  | 'REMINDER_SEND_REQUESTED'
  | 'BULK_REMINDER_SEND_REQUESTED'
  | 'RECEIPT_SEND_REQUESTED'
  // Maintenance
  | 'MAINTENANCE_TICKET_CREATED'
  | 'MAINTENANCE_TICKET_CLOSED'
  | 'MAINTENANCE_STATUS_UPDATED'
  // Admin Users
  | 'ADMIN_USER_CREATED'
  | 'ADMIN_USER_UPDATED'
  | 'ADMIN_RESET_LINK_ISSUED'
  | 'ADMIN_RESET_LINK_REVOKED'
  // Auth
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  // System
  | 'SYSTEM_RESET'
  | 'DB_CLEANUP_STARTED'
  | 'DB_CLEANUP_COMPLETED'
  | 'OUTBOX_EVENT_FAILED'
  // Documents & Templates
  | 'DOCUMENT_TEMPLATE_CREATED'
  | 'DOCUMENT_TEMPLATE_VERSION_CREATED'
  | 'DOCUMENT_TEMPLATE_VERSION_UPLOADED'
  | 'DOCUMENT_TEMPLATE_VERSION_ACTIVATED'
  | 'DOCUMENT_TEMPLATE_VERSION_SAVED'
  | 'DOCUMENT_GENERATION_REQUESTED'
  | 'GENERATED_DOCUMENT_CREATED'
  | 'DOCUMENT_GENERATION_COMPLETED'
  | 'GENERATED_DOCUMENT_REGENERATE_REQUESTED'
  | 'GENERATED_DOCUMENT_PDF_EXPORTED'
  | 'GENERATED_DOCUMENT_FILE_EXPORTED'
  // Tenant Registrations
  | 'TENANT_REGISTRATION_APPROVED'
  | 'TENANT_REGISTRATION_REJECTED'
  // Payments & Banking
  | 'BANK_STATEMENT_UPLOADED'
  | 'BANK_ACCOUNT_CREATED'
  | 'BANK_ACCOUNT_UPDATED'
  | 'BANK_ACCOUNT_DEACTIVATED'
  | 'OVERPAYMENT_DETECTED'
  // Settings
  | 'LINE_INTEGRATION_UPDATED'
  | 'BUILDING_SETTINGS_UPDATED'
  | 'AUTOMATION_SETTINGS_UPDATED'
  // Deliveries
  | 'DELIVERY_RESEND_REQUESTED'
  // Meter Reset Detection
  | 'METER_RESET_DETECTED';

export interface LogAuditInput {
  /**
   * Actor ID — derived from `req` when provided; otherwise used directly.
   * Marked optional so callers can pass just `req` (HIGH-07 fix).
   */
  actorId?: string;
  /**
   * Actor role — derived from `req` when provided; otherwise used directly.
   */
  actorRole?: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  /** Optional version of the entity being audited — for detecting concurrent edits */
  entityVersion?: number;
  /**
   * Optional NextRequest — if provided, actorId/actorRole are IGNORED and derived
   * from getVerifiedActor(req) which cryptographically verifies the session.
   * Use this in API route handlers to prevent actor spoofing via X-Audit-Actor-Id.
   */
  req?: NextRequest;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SignatureEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  entityVersion: number;
}

// ---------------------------------------------------------------------------
// Core HMAC logic
// ---------------------------------------------------------------------------

/**
 * Compute the HMAC-SHA256 chain signature for a single audit entry.
 * signature = HMAC(previousSignature || canonicalEntryString, secret)
 *
 * This is NOT stored on the entry itself — it becomes the previousSignature
 * of the NEXT entry, forming the chain.
 */
function computeChainSignature(
  previousSignature: string,
  entry: SignatureEntry,
  secret: string,
): string {
  const canonical = canonicalString(entry);
  return createHmac('sha256', secret).update(`${previousSignature}|${canonical}`).digest('hex');
}

/** Build a canonical deterministic string from an entry's field values. */
function canonicalString(entry: SignatureEntry): string {
  return SIGNED_FIELD_NAMES.map((f) => fieldValue(entry, f)).join('|');
}

function fieldValue(entry: SignatureEntry, field: (typeof SIGNED_FIELD_NAMES)[number]): string {
  const val = entry[field as keyof SignatureEntry];
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VerifyChainResult {
  valid: boolean;
  /** 1-based index of the first broken entry, if not valid */
  brokenAt?: number;
  /** Total entries verified */
  total?: number;
  /** Human-readable error, if valid is false for non-tamper reasons */
  error?: string;
}

/**
 * Verify the entire audit log chain is intact.
 *
 * Checks that every entry's `previousSignature` matches the HMAC of the
 * preceding entry computed with the configured auth secret.
 *
 * Returns { valid: true } if the chain is intact.
 * Returns { valid: false, brokenAt, total, error } on first detected break.
 *
 * Uses cursor-based pagination internally — O(n) time, O(1) extra space.
 */
export async function verifyAuditLogChain(): Promise<VerifyChainResult> {
  let secret: string;
  try {
    secret = getAuthSecret();
  } catch {
    return { valid: false, error: 'Auth secret not configured — cannot verify chain' };
  }

  const BATCH = 500;
  let prevSignature = GENESIS_SIGNATURE;
  let globalIdx = 0;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string;
      userId: string;
      userName: string;
      details: string | null;
      ipAddress: string | null;
      createdAt: Date;
      entityVersion: number;
      previousSignature: string | null;
    }>>(
      `SELECT id, action, entity_type, entity_id, user_id, user_name,
              details, ip_address, created_at, entity_version, previous_signature
         FROM audit_logs
     ORDER BY created_at ASC
        LIMIT $1`,
      BATCH,
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      globalIdx++;
      const entry: SignatureEntry = {
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        userId: row.userId,
        userName: row.userName,
        details: row.details !== null ? (JSON.parse(row.details) as Record<string, unknown>) : null,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt,
        entityVersion: row.entityVersion,
      };

      const storedPrev = row.previousSignature ?? GENESIS_SIGNATURE;
      if (storedPrev !== prevSignature) {
        return {
          valid: false,
          brokenAt: globalIdx,
          total: globalIdx,
          error: `Chain broken at entry ${globalIdx}: expected previousSignature ${prevSignature} but got ${storedPrev}`,
        };
      }

      // Compute what this entry's signature should be (becomes next entry's previousSignature)
      prevSignature = computeChainSignature(storedPrev, entry, secret);
    }

    if (rows.length < BATCH) break;
  }

  return { valid: true, total: globalIdx };
}

/**
 * Write a new audit log entry with HMAC chain linkage.
 * Fire-and-forget — audit failures do not propagate to the caller.
 *
 * SECURITY: If `req` is provided, actorId and actorRole are IGNORED and derived
 * from getVerifiedActor(req). This prevents actor spoofing via X-Audit-Actor-Id.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  logAuditAsync(input).catch((err) => {
    auditLogger.error(input.action, input.entityType, input.entityId, err);
  });
}

async function logAuditAsync(input: LogAuditInput): Promise<void> {
  const { actorId: rawActorId, actorRole: rawActorRole, action, entityType, entityId, metadata, ipAddress: rawIpAddress, entityVersion = 0, req } = input;

  // SECURITY: If request is provided, derive actor from verified session — ignore caller-supplied values.
  // This prevents actor spoofing where a malicious admin passes X-Audit-Actor-Id to implicate another user.
  let actorId: string;
  let actorRole: string;
  let ipAddress: string | null;

  if (req) {
    const verified = getVerifiedActor(req);
    actorId = verified.actorId;
    actorRole = verified.actorRole;
    ipAddress = verified.ipAddress ?? rawIpAddress ?? null;
  } else {
    // No request context — trust caller-supplied values (e.g., internal system jobs).
    // Log a warning so we can detect potential spoofing in production.
    actorId = rawActorId ?? 'system';
    actorRole = rawActorRole || 'SYSTEM';
    ipAddress = rawIpAddress ?? null;
    if (rawActorId && rawActorId !== 'system') {
      auditLogger.info(action, entityType, entityId, { actorId: rawActorId, actorRole: rawActorRole });
    }
  }

  const id = uuidv4();
  const createdAt = new Date();

  // Resolve secret — fall back to dev placeholder if not configured (chain won't be verifiable)
  let secret: string;
  try {
    secret = getAuthSecret();
  } catch {
    secret = 'dev-secret-chain-unavailable';
  }

  // Fetch the last entry's signature to chain from
  const [lastRow] = await prisma.$queryRawUnsafe<Array<{ previousSignature: string | null }>>(
    `SELECT previous_signature FROM audit_logs ORDER BY created_at DESC LIMIT 1`,
  );
  const previousSignature = lastRow?.previousSignature ?? GENESIS_SIGNATURE;

  const details: Record<string, unknown> = {
    actorRole,
    ...metadata,
  };

  const entry: SignatureEntry = {
    id,
    action,
    entityType,
    entityId,
    userId: actorId,
    userName: actorRole,
    details,
    ipAddress,
    createdAt,
    entityVersion,
  };

  // This entry's signature becomes the next entry's previousSignature
  const entrySignature = computeChainSignature(previousSignature, entry, secret);

  await prisma.auditLog.create({
    data: {
      id,
      action,
      entityType,
      entityId,
      userId: actorId,
      userName: actorRole,
      details: details as Prisma.InputJsonValue,
      ipAddress,
      createdAt,
      entityVersion,
      previousSignature: entrySignature,
    },
  });

  auditLogger.info(action, entityType, entityId, metadata);
}

/**
 * Log a meter reset detection event as a HIGH severity audit log entry.
 * This alerts admins when a meter reading is lower than the previous reading,
 * indicating the meter was replaced/reset.
 */
export async function logMeterResetAlert(input: {
  roomNumber: string;
  meterType: 'water' | 'electric' | 'both';
  previousReading: number;
  currentReading: number;
  billingPeriod: { year: number; month: number };
  batchId?: string;
  detectedBy?: string;
}): Promise<void> {
  const { roomNumber, meterType, previousReading, currentReading, billingPeriod, batchId, detectedBy } = input;

  await logAudit({
    actorId: detectedBy ?? 'system',
    actorRole: 'SYSTEM',
    action: 'METER_RESET_DETECTED',
    entityType: 'RoomBilling',
    entityId: batchId ?? roomNumber,
    metadata: {
      severity: 'HIGH',
      roomNumber,
      meterType,
      previousReading,
      currentReading,
      year: billingPeriod.year,
      month: billingPeriod.month,
      billingPeriodLabel: `${billingPeriod.year}-${String(billingPeriod.month).padStart(2, '0')}`,
      message: `มิเตอร์${meterType === 'both' ? 'น้ำ/ไฟ' : meterType === 'water' ? 'น้ำ' : 'ไฟ'} ถูกเปลี่ยน ห้อง ${roomNumber}: ค่าก่อน=${previousReading}, ค่าปัจจุบัน=${currentReading} (งวด ${billingPeriod.year}-${String(billingPeriod.month).padStart(2, '0')})`,
    },
  });
}