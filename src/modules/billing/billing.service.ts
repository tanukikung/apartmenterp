import { v4 as uuidv4 } from 'uuid';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import { prisma, EventBus, logger, EventTypes } from '@/lib';
// sql and join are runtime utilities in Prisma 5.x not in all TS declarations.
// Access via the prisma namespace at runtime.
const sql = (prisma as unknown as Record<string, unknown>).sql as (s: TemplateStringsArray, ...v: unknown[]) => unknown;
const join = (prisma as unknown as Record<string, unknown>).join as (a: unknown[]) => unknown;
import { BILLING_STATUS, BILLING_PERIOD_STATUS, INVOICE_STATUS, IMPORT_BATCH_STATUS } from '@/lib/constants';

import {
  CreateBillingRecordInput,
  LockBillingInput,
  ListBillingRecordsQuery,
  BillingRecordResponse,
  BillingRecordsListResponse,
  BillingRecordCreatedPayload,
  BillingLockedPayload,
  InvoiceGenerationRequestedPayload,
  billingRecordCreatedPayloadSchema,
  billingLockedPayloadSchema,
  invoiceGenerationRequestedPayloadSchema,
} from './types';
import type { BillingStatus } from './types';
import type { WorkbookParseResult, FullWorkbookParseResult, RoomBillingRow } from './import-parser';
import { parseFullWorkbook } from './import-parser';
import { computeRoomBilling, computeCheckNotes } from './billing-calculator';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '@/lib/utils/errors';

// ============================================================================
// Helpers
// ============================================================================

export const DEFAULT_DUE_DAY = 25;

type BillingRowFields = {
  recvAccountOverrideId?: string | null;
  recvAccountId: string;
  ruleOverrideCode?: string | null;
  ruleCode: string;
  rentAmount: number;
  waterMode: 'NORMAL' | 'MANUAL' | 'FLAT' | 'STEP';
  waterPrev?: number | null;
  waterCurr?: number | null;
  waterUnitsManual?: number | null;
  waterUnits: number;
  waterUsageCharge: number;
  waterServiceFeeManual?: number | null;
  waterServiceFee: number;
  waterTotal: number;
  electricMode: 'NORMAL' | 'MANUAL' | 'FLAT' | 'STEP';
  electricPrev?: number | null;
  electricCurr?: number | null;
  electricUnitsManual?: number | null;
  electricUnits: number;
  electricUsageCharge: number;
  electricServiceFeeManual?: number | null;
  electricServiceFee: number;
  electricTotal: number;
  furnitureFee: number;
  otherFee: number;
  totalDue: number;
  // Populated when tenant moves in/out mid-month
  proratedRent?: number;
  // Mid-month move dates — parsed from Excel as ISO date strings
  moveInDate?: string | null;
  moveOutDate?: string | null;
  note?: string | null;
  checkNotes?: string | null;
};

/**
 * Build the common 25-field RoomBilling data object from raw row data.
 * Used by importBillingRows and importBillingRowsWithBatch — both use raw meter values.
 */
function buildBillingDataFromRow(
  row: Pick<RoomBillingRow, keyof RoomBillingRow>,
  effectiveAccountId: string,
  effectiveRuleCode: string,
): BillingRowFields {
  return {
    recvAccountOverrideId: row.recvAccountOverrideId ?? undefined,
    recvAccountId: effectiveAccountId,
    ruleOverrideCode: row.ruleOverrideCode ?? undefined,
    ruleCode: effectiveRuleCode,
    rentAmount: row.rentAmount,
    waterMode: normaliseMeterMode(row.waterMode),
    waterPrev: row.waterPrev ?? undefined,
    waterCurr: row.waterCurr ?? undefined,
    waterUnitsManual: row.waterUnitsManual ?? undefined,
    waterUnits: row.waterUnits,
    waterUsageCharge: row.waterUsageCharge,
    waterServiceFeeManual: row.waterServiceFeeManual ?? undefined,
    waterServiceFee: row.waterServiceFee,
    waterTotal: row.waterTotal,
    electricMode: normaliseMeterMode(row.electricMode),
    electricPrev: row.electricPrev ?? undefined,
    electricCurr: row.electricCurr ?? undefined,
    electricUnitsManual: row.electricUnitsManual ?? undefined,
    electricUnits: row.electricUnits,
    electricUsageCharge: row.electricUsageCharge,
    electricServiceFeeManual: row.electricServiceFeeManual ?? undefined,
    electricServiceFee: row.electricServiceFee,
    electricTotal: row.electricTotal,
    furnitureFee: row.furnitureFee,
    otherFee: row.otherFee,
    totalDue: row.totalDue,
    // proratedRent: only present in full-import path (not raw-row path)
    proratedRent: 'proratedRent' in row ? (row.proratedRent as number | undefined) : undefined,
    // Mid-month move dates (from Excel)
    moveInDate: 'moveInDate' in row ? (row.moveInDate as string | null | undefined) : undefined,
    moveOutDate: 'moveOutDate' in row ? (row.moveOutDate as string | null | undefined) : undefined,
    note: row.note ?? undefined,
    checkNotes: row.checkNotes ?? undefined,
  };
}

/**
 * Normalise the meter mode string to the DB-safe MeterMode enum.
 * Now includes FLAT and STEP since the enum supports them.
 */
function normaliseMeterMode(mode: string): 'NORMAL' | 'MANUAL' | 'FLAT' | 'STEP' {
  if (mode === 'MANUAL') return 'MANUAL';
  if (mode === 'FLAT') return 'FLAT';
  if (mode === 'STEP') return 'STEP';
  return 'NORMAL';
}

/**
 * Map new fee modes ('FLAT', 'PER_UNIT', 'MANUAL') to old ServiceFeeMode enum.
 */
type OldFeeMode = 'NONE' | 'FLAT_ROOM' | 'PER_UNIT' | 'MANUAL_FEE';
function mapFeeMode(m: string): OldFeeMode {
  if (m === 'FLAT') return 'FLAT_ROOM';
  if (m === 'PER_UNIT') return 'PER_UNIT';
  if (m === 'MANUAL') return 'MANUAL_FEE';
  return 'NONE';
}

// ============================================================================
// Billing Service — redesigned for BillingPeriod/RoomBilling schema
// ============================================================================

export class BillingService {
  private eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || EventBus.getInstance();
  }

  /**
   * Create a new billing record (RoomBilling) for a room/period
   */
  async createBillingRecord(
    input: CreateBillingRecordInput,
    createdBy?: string
  ): Promise<BillingRecordResponse> {
    logger.info({ type: 'billing_create', roomNo: input.roomNo, year: input.year, month: input.month });

    // Check if room exists
    const room = await prisma.room.findUnique({
      where: { roomNo: input.roomNo },
    });

    if (!room) {
      throw new NotFoundError('Room', input.roomNo);
    }

    // Find or create billing period
    let period = await prisma.billingPeriod.findUnique({
      where: { year_month: { year: input.year, month: input.month } },
    });

    if (!period) {
      period = await prisma.billingPeriod.create({
        data: {
          id: uuidv4(),
          year: input.year,
          month: input.month,
          status: BILLING_PERIOD_STATUS.OPEN,
          dueDay: DEFAULT_DUE_DAY,
        },
      });
    }

    // Business rule: Only one RoomBilling per room/period.
    // Wrap check-and-create in a transaction to close the TOCTOU race window.
    // Two concurrent calls will both see the ConflictError inside the transaction,
    // preventing duplicate key errors (500) from the DB unique constraint.
    let roomBilling: Awaited<ReturnType<typeof prisma.roomBilling.create>>;
    try {
      roomBilling = await prisma.$transaction(async (tx) => {
        const existing = await tx.roomBilling.findUnique({
          where: { billingPeriodId_roomNo: { billingPeriodId: period.id, roomNo: input.roomNo } },
        });
        if (existing) {
          throw new ConflictError(
            `Billing record for ${input.year}-${input.month} already exists for room ${input.roomNo}`
          );
        }
        const created = await tx.roomBilling.create({
          data: {
            id: uuidv4(),
            billingPeriodId: period.id,
            roomNo: input.roomNo,
            recvAccountId: room.defaultAccountId,
            ruleCode: room.defaultRuleCode,
            rentAmount: room.defaultRentAmount,
            waterMode: 'NORMAL',
            electricMode: 'NORMAL',
            totalDue: Number(room.defaultRentAmount),
            status: BILLING_STATUS.DRAFT,
          },
        });
        // T-01 fix: Create outbox event in the same transaction as the billing record.
        // This ensures the event is committed atomically with the record — no orphaned
        // events if the process crashes between the create and the outbox insert.
        await tx.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: 'RoomBilling',
            aggregateId: created.id,
            eventType: EventTypes.BILLING_RECORD_CREATED,
            payload: {
              billingRecordId: created.id,
              roomNo: created.roomNo,
              year: input.year,
              month: input.month,
              createdBy,
            },
            retryCount: 0,
          },
        });
        return created;
      });
    } catch (err) {
      // Prisma throws P2002 (unique constraint) if the application check missed
      // a concurrent insert — convert to ConflictError so the API returns 409.
      if (err instanceof Error && err.message.includes('P2002')) {
        throw new ConflictError(
          `Billing record for ${input.year}-${input.month} already exists for room ${input.roomNo}`
        );
      }
      throw err;
    }

    // T-01 fix: outbox event is now created inside the transaction above.
    // The code below (lines 231-246 in the original) is removed to avoid duplication.

    const payload: BillingRecordCreatedPayload = billingRecordCreatedPayloadSchema.parse({
      billingRecordId: roomBilling.id,
      roomNo: roomBilling.roomNo,
      year: input.year,
      month: input.month,
      createdBy,
    });

    await this.eventBus.publish(
      EventTypes.BILLING_RECORD_CREATED,
      'RoomBilling',
      roomBilling.id,
      payload,
      { userId: createdBy }
    );

    return this.formatRoomBillingResponse(roomBilling, period);
  }

  /**
   * Import billing data from a parsed workbook.
   * year + month must be provided because they are not stored in the Excel sheets.
   * Each RoomBillingRow maps directly to one RoomBilling record.
   * Existing DRAFT records are overwritten; LOCKED/INVOICED records are skipped.
   */
  async importBillingRows(
    workbook: WorkbookParseResult,
    year: number,
    month: number,
    importedBy?: string
  ): Promise<{
    created: Array<{ roomNo: string; billingRecordId: string }>;
    skipped: Array<{ roomNo: string; reason: string }>;
    errors: Array<{ roomNo: string; error: string }>;
  }> {
    const allRows = workbook.floors.flatMap((f) => f.rows);

    // Get or create billing period
    let period = await prisma.billingPeriod.findUnique({
      where: { year_month: { year, month } },
    });
    if (!period) {
      period = await prisma.billingPeriod.create({
        data: { id: uuidv4(), year, month, status: BILLING_PERIOD_STATUS.OPEN, dueDay: DEFAULT_DUE_DAY },
      });
    }

    const created: Array<{ roomNo: string; billingRecordId: string }> = [];
    const skipped: Array<{ roomNo: string; reason: string }> = [];
    const errors: Array<{ roomNo: string; error: string }> = [];

    // Prefetch all rooms mentioned in the import to avoid N per-row queries
    const uniqueRoomNos = [...new Set(allRows.map((r) => r.roomNo))];
    const roomsFromDb = await prisma.room.findMany({
      where: { roomNo: { in: uniqueRoomNos } },
      select: { roomNo: true, defaultAccountId: true, defaultRuleCode: true },
    });
    const roomMap = new Map(roomsFromDb.map((r) => [r.roomNo, r]));

    // Prefetch existing billing records for the period to avoid N per-row queries
    const existingBillings = await prisma.roomBilling.findMany({
      where: {
        billingPeriodId: period!.id,
        roomNo: { in: uniqueRoomNos },
      },
      select: { id: true, roomNo: true, status: true },
    });
    const existingMap = new Map(existingBillings.map((b) => [b.roomNo, b]));

    // Partition rows into creates and updates to enable true batch operations.
    // HIGH-01 fix: replaced sequential per-row $transaction with a single batched
    // transaction + raw SQL upsert. Previously each row incurred a full DB round-trip.
    const { rowsToUpsert, rowsToSkip, rowErrors } = this.partitionRowsForUpsert(
      allRows, roomMap, existingMap,
    );

    // Batch-insert new records (only those we know don't exist yet)
    if (rowsToUpsert.length > 0) {
      await prisma.$transaction(async (tx) => {
        // Bulk upsert using raw SQL — single round-trip regardless of row count.
        // Uses PostgreSQL ON CONFLICT DO UPDATE for atomic upsert across all rows.
        await tx.$executeRaw`
          INSERT INTO "room_billings" (
            "id", "billingPeriodId", "roomNo", "status",
            "recvAccountOverrideId", "recvAccountId", "ruleOverrideCode", "ruleCode",
            "rentAmount", "proratedRent",
            "waterMode", "waterPrev", "waterCurr", "waterUnitsManual",
            "waterUnits", "waterUsageCharge", "waterServiceFeeManual", "waterServiceFee", "waterTotal",
            "electricMode", "electricPrev", "electricCurr", "electricUnitsManual",
            "electricUnits", "electricUsageCharge", "electricServiceFeeManual", "electricServiceFee", "electricTotal",
            "furnitureFee", "otherFee", "totalDue",
            "note", "checkNotes"
          ) VALUES ${join(rowsToUpsert.map(row => sql`
            (
              ${row.id}, ${period!.id}, ${row.roomNo}, ${BILLING_STATUS.DRAFT},
              ${row.recvAccountOverrideId ?? sql`NULL`},
              ${row.recvAccountId},
              ${row.ruleOverrideCode ?? sql`NULL`},
              ${row.ruleCode},
              ${row.rentAmount}::decimal,
              ${row.proratedRent != null ? `${row.proratedRent}` + '::decimal' : sql`NULL`},
              ${row.waterMode}, ${row.waterPrev ?? sql`NULL`}, ${row.waterCurr ?? sql`NULL`},
              ${row.waterUnitsManual != null ? row.waterUnitsManual + '::decimal' : sql`NULL`},
              ${row.waterUnits}::decimal, ${row.waterUsageCharge}::decimal,
              ${row.waterServiceFeeManual != null ? row.waterServiceFeeManual + '::decimal' : sql`NULL`},
              ${row.waterServiceFee}::decimal, ${row.waterTotal}::decimal,
              ${row.electricMode}, ${row.electricPrev ?? sql`NULL`}, ${row.electricCurr ?? sql`NULL`},
              ${row.electricUnitsManual != null ? row.electricUnitsManual + '::decimal' : sql`NULL`},
              ${row.electricUnits}::decimal, ${row.electricUsageCharge}::decimal,
              ${row.electricServiceFeeManual != null ? row.electricServiceFeeManual + '::decimal' : sql`NULL`},
              ${row.electricServiceFee}::decimal, ${row.electricTotal}::decimal,
              ${row.furnitureFee}::decimal, ${row.otherFee}::decimal, ${row.totalDue}::decimal,
              ${row.note ?? sql`NULL`}, ${row.checkNotes ?? sql`NULL`}
            )
          `))}
          ON CONFLICT ("billingPeriodId", "roomNo")
          DO UPDATE SET
            "recvAccountOverrideId" = EXCLUDED."recvAccountOverrideId",
            "recvAccountId" = EXCLUDED."recvAccountId",
            "ruleOverrideCode" = EXCLUDED."ruleOverrideCode",
            "ruleCode" = EXCLUDED."ruleCode",
            "rentAmount" = EXCLUDED."rentAmount",
            "proratedRent" = EXCLUDED."proratedRent",
            "waterMode" = EXCLUDED."waterMode",
            "waterPrev" = EXCLUDED."waterPrev",
            "waterCurr" = EXCLUDED."waterCurr",
            "waterUnitsManual" = EXCLUDED."waterUnitsManual",
            "waterUnits" = EXCLUDED."waterUnits",
            "waterUsageCharge" = EXCLUDED."waterUsageCharge",
            "waterServiceFeeManual" = EXCLUDED."waterServiceFeeManual",
            "waterServiceFee" = EXCLUDED."waterServiceFee",
            "waterTotal" = EXCLUDED."waterTotal",
            "electricMode" = EXCLUDED."electricMode",
            "electricPrev" = EXCLUDED."electricPrev",
            "electricCurr" = EXCLUDED."electricCurr",
            "electricUnitsManual" = EXCLUDED."electricUnitsManual",
            "electricUnits" = EXCLUDED."electricUnits",
            "electricUsageCharge" = EXCLUDED."electricUsageCharge",
            "electricServiceFeeManual" = EXCLUDED."electricServiceFeeManual",
            "electricServiceFee" = EXCLUDED."electricServiceFee",
            "electricTotal" = EXCLUDED."electricTotal",
            "furnitureFee" = EXCLUDED."furnitureFee",
            "otherFee" = EXCLUDED."otherFee",
            "totalDue" = EXCLUDED."totalDue",
            "note" = EXCLUDED."note",
            "checkNotes" = EXCLUDED."checkNotes",
            "updatedAt" = NOW()
        `;

        // Emit outbox events for each created record in the same transaction
        await tx.outboxEvent.createMany({
          data: rowsToUpsert.map(row => ({
            id: uuidv4(),
            aggregateType: 'RoomBilling',
            aggregateId: row.id,
            eventType: EventTypes.BILLING_RECORD_CREATED,
            payload: {
              billingRecordId: row.id,
              roomNo: row.roomNo,
              year,
              month,
              importedBy,
            },
            retryCount: 0,
          })),
        });
      });
    }

    created.push(...rowsToUpsert.map(r => ({ roomNo: r.roomNo, billingRecordId: r.id })));
    skipped.push(...rowsToSkip.map(r => ({ roomNo: r.roomNo, reason: r.reason })));
    errors.push(...rowErrors.map(r => ({ roomNo: r.roomNo, error: r.error })));

    logger.info({ type: 'billing_import_done', year, month, created: created.length, skipped: skipped.length, errors: errors.length });
    return { created, skipped, errors };
  }

  /**
   * Partition import rows into those that need upserting vs. those that should be skipped.
   * Called once after the bulk prefetch — no per-row DB queries here.
   */
  private partitionRowsForUpsert(
    rows: RoomBillingRow[],
    roomMap: Map<string, { defaultAccountId: string; defaultRuleCode: string }>,
    existingMap: Map<string, { id: string; status: BillingStatus }>,
  ): {
    rowsToUpsert: Array<{
      id: string; roomNo: string; recvAccountOverrideId: string | null;
      recvAccountId: string; ruleOverrideCode: string | null; ruleCode: string;
      rentAmount: number; proratedRent: number | null;
      waterMode: string; waterPrev: number | null; waterCurr: number | null; waterUnitsManual: number | null;
      waterUnits: number; waterUsageCharge: number; waterServiceFeeManual: number | null;
      waterServiceFee: number; waterTotal: number;
      electricMode: string; electricPrev: number | null; electricCurr: number | null; electricUnitsManual: number | null;
      electricUnits: number; electricUsageCharge: number; electricServiceFeeManual: number | null;
      electricServiceFee: number; electricTotal: number;
      furnitureFee: number; otherFee: number; totalDue: number;
      note: string | null; checkNotes: string | null;
    }>;
    rowsToSkip: Array<{ roomNo: string; reason: string }>;
    rowErrors: Array<{ roomNo: string; error: string }>;
  } {
    const rowsToUpsert: Array<{
      id: string; roomNo: string; recvAccountOverrideId: string | null;
      recvAccountId: string; ruleOverrideCode: string | null; ruleCode: string;
      rentAmount: number; proratedRent: number | null;
      waterMode: string; waterPrev: number | null; waterCurr: number | null; waterUnitsManual: number | null;
      waterUnits: number; waterUsageCharge: number; waterServiceFeeManual: number | null;
      waterServiceFee: number; waterTotal: number;
      electricMode: string; electricPrev: number | null; electricCurr: number | null; electricUnitsManual: number | null;
      electricUnits: number; electricUsageCharge: number; electricServiceFeeManual: number | null;
      electricServiceFee: number; electricTotal: number;
      furnitureFee: number; otherFee: number; totalDue: number;
      note: string | null; checkNotes: string | null;
    }> = [];
    const rowsToSkip: Array<{ roomNo: string; reason: string }> = [];
    const rowErrors: Array<{ roomNo: string; error: string }> = [];

    for (const row of rows) {
      const { roomNo } = row;
      try {
        const room = roomMap.get(roomNo);
        if (!room) { rowsToSkip.push({ roomNo, reason: 'Room not found in database' }); continue; }

        const existing = existingMap.get(roomNo);
        if (existing) {
          if (existing.status !== BILLING_STATUS.DRAFT) {
            rowsToSkip.push({ roomNo, reason: `Already ${existing.status}` });
            continue;
          }
          // DRAFT existing record — update via upsert below (id stays same, ON CONFLICT updates)
        }

        const data = buildBillingDataFromRow(
          row,
          row.recvAccountOverrideId ?? room.defaultAccountId,
          row.ruleOverrideCode ?? room.defaultRuleCode,
        );

        rowsToUpsert.push({
          id: existing?.id ?? uuidv4(),
          roomNo,
          recvAccountOverrideId: data.recvAccountOverrideId as string | null,
          recvAccountId: data.recvAccountId,
          ruleOverrideCode: data.ruleOverrideCode as string | null,
          ruleCode: data.ruleCode,
          rentAmount: data.rentAmount,
          proratedRent: data.proratedRent as number | null ?? null,
          waterMode: data.waterMode,
          waterPrev: data.waterPrev ?? null,
          waterCurr: data.waterCurr ?? null,
          waterUnitsManual: data.waterUnitsManual ?? null,
          waterUnits: data.waterUnits,
          waterUsageCharge: data.waterUsageCharge,
          waterServiceFeeManual: data.waterServiceFeeManual ?? null,
          waterServiceFee: data.waterServiceFee,
          waterTotal: data.waterTotal,
          electricMode: data.electricMode,
          electricPrev: data.electricPrev ?? null,
          electricCurr: data.electricCurr ?? null,
          electricUnitsManual: data.electricUnitsManual ?? null,
          electricUnits: data.electricUnits,
          electricUsageCharge: data.electricUsageCharge,
          electricServiceFeeManual: data.electricServiceFeeManual ?? null,
          electricServiceFee: data.electricServiceFee,
          electricTotal: data.electricTotal,
          furnitureFee: data.furnitureFee,
          otherFee: data.otherFee,
          totalDue: data.totalDue,
          note: data.note ?? null,
          checkNotes: data.checkNotes ?? null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rowErrors.push({ roomNo, error: msg });
        logger.error({ type: 'billing_import_row_error', roomNo, error: msg });
      }
    }

    return { rowsToUpsert, rowsToSkip, rowErrors };
  };

  /**
   * Import billing rows with batch tracking.
   * Updates ImportBatch status as rows are processed.
   */
  async importBillingRowsWithBatch(
    workbook: WorkbookParseResult,
    batchId: string,
    billingPeriodId: string,
    importedBy?: string
  ): Promise<{
    created: Array<{ roomNo: string; billingRecordId: string }>;
    skipped: Array<{ roomNo: string; reason: string }>;
    errors: Array<{ roomNo: string; error: string }>;
  }> {
    const allRows = workbook.floors.flatMap((f) => f.rows);
    logger.info({ type: 'billing_import_batch_start', batchId, totalRows: allRows.length });
    const created: Array<{ roomNo: string; billingRecordId: string }> = [];
    const skipped: Array<{ roomNo: string; reason: string }> = [];
    const errors: Array<{ roomNo: string; error: string }> = [];

    let rowsImported = 0;
    let rowsSkipped = 0;
    let rowsErrored = 0;

    for (const row of allRows) {
      const { roomNo } = row;
      try {
        // Check room exists
        const room = await prisma.room.findUnique({ where: { roomNo } });
        if (!room) {
          skipped.push({ roomNo, reason: 'Room not found in database' });
          rowsSkipped++;
          await prisma.importBatch.update({
            where: { id: batchId },
            data: { rowsSkipped, rowsErrored },
          });
          continue;
        }

        // Check for existing RoomBilling
        const existing = await prisma.roomBilling.findUnique({
          where: { billingPeriodId_roomNo: { billingPeriodId, roomNo } },
        });
        if (existing) {
          if (existing.status !== BILLING_STATUS.DRAFT) {
            skipped.push({ roomNo, reason: `Already ${existing.status}` });
            rowsSkipped++;
            await prisma.importBatch.update({
              where: { id: batchId },
              data: { rowsSkipped, rowsErrored },
            });
            continue;
          }
          // Overwrite DRAFT record
          await prisma.roomBilling.update({
            where: { id: existing.id },
            data: buildBillingDataFromRow(
              row,
              row.recvAccountOverrideId ?? room.defaultAccountId,
              row.ruleOverrideCode ?? room.defaultRuleCode,
            ),
          });
          created.push({ roomNo, billingRecordId: existing.id });
          rowsImported++;
          await prisma.importBatch.update({
            where: { id: batchId },
            data: { rowsImported, rowsSkipped, rowsErrored },
          });
          continue;
        }

        // Create new RoomBilling with outbox event
        const rb = await prisma.$transaction(async (tx) => {
          const roomBilling = await tx.roomBilling.create({
            data: {
              id: uuidv4(),
              billingPeriodId,
              roomNo,
              recvAccountOverrideId: row.recvAccountOverrideId,
              recvAccountId: row.recvAccountOverrideId ?? room.defaultAccountId,
              ruleOverrideCode: row.ruleOverrideCode,
              ruleCode: row.ruleOverrideCode ?? room.defaultRuleCode,
              rentAmount: row.rentAmount,
              waterMode: normaliseMeterMode(row.waterMode),
              waterPrev: row.waterPrev,
              waterCurr: row.waterCurr,
              waterUnitsManual: row.waterUnitsManual,
              waterUnits: row.waterUnits,
              waterUsageCharge: row.waterUsageCharge,
              waterServiceFeeManual: row.waterServiceFeeManual,
              waterServiceFee: row.waterServiceFee,
              waterTotal: row.waterTotal,
              electricMode: normaliseMeterMode(row.electricMode),
              electricPrev: row.electricPrev,
              electricCurr: row.electricCurr,
              electricUnitsManual: row.electricUnitsManual,
              electricUnits: row.electricUnits,
              electricUsageCharge: row.electricUsageCharge,
              electricServiceFeeManual: row.electricServiceFeeManual,
              electricServiceFee: row.electricServiceFee,
              electricTotal: row.electricTotal,
              furnitureFee: row.furnitureFee,
              otherFee: row.otherFee,
              totalDue: row.totalDue,
              note: row.note,
              checkNotes: row.checkNotes,
              status: BILLING_STATUS.DRAFT,
            },
          });
          await tx.outboxEvent.create({
            data: {
              id: uuidv4(),
              aggregateType: 'RoomBilling',
              aggregateId: roomBilling.id,
              eventType: EventTypes.BILLING_RECORD_CREATED,
              payload: {
                billingRecordId: roomBilling.id,
                roomNo,
                billingPeriodId,
                importedBy,
              },
              retryCount: 0,
            },
          });
          return roomBilling;
        });

        created.push({ roomNo, billingRecordId: rb.id });
        rowsImported++;
        await prisma.importBatch.update({
          where: { id: batchId },
          data: { rowsImported, rowsSkipped, rowsErrored },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ roomNo, error: msg });
        rowsErrored++;
        // Propagate batch update failures — batch stuck in PROCESSING is worse than failing the row
        await prisma.importBatch.update({
          where: { id: batchId },
          data: { rowsSkipped, rowsErrored },
        });
        logger.error({ type: 'billing_import_row_error', roomNo, error: msg });
      }
    }

    logger.info({ type: 'billing_import_rows_with_batch_done', batchId, created: created.length, skipped: skipped.length, errors: errors.length });
    return { created, skipped, errors };
  }

  /**
   * Lock a RoomBilling record and trigger invoice generation
   */
  async lockBillingRecord(
    billingRecordId: string,
    input: LockBillingInput,
    lockedBy?: string
  ): Promise<BillingRecordResponse> {
    const updated = await prisma.$transaction(async (tx) => {
      const roomBilling = await tx.roomBilling.findUnique({
        where: { id: billingRecordId },
        include: { billingPeriod: true },
      });

      if (!roomBilling) {
        throw new NotFoundError('RoomBilling', billingRecordId);
      }

      if (roomBilling.status === BILLING_STATUS.LOCKED && !input.force) {
        throw new BadRequestError('Billing record is already locked');
      }

      if (roomBilling.status === BILLING_STATUS.INVOICED && !input.force) {
        throw new BadRequestError('Billing record is already invoiced');
      }

      if (input.force) {
        // HIGH-05 fix: force=true still uses updateMany with count check.
        // This prevents bypassing the state guard — only DRAFT→LOCKED is allowed
        // via force. INVOICED→LOCKED requires cancelling the invoice first.
        if (roomBilling.status !== 'DRAFT' && roomBilling.status !== 'LOCKED') {
          throw new BadRequestError(
            `Cannot force-lock from ${roomBilling.status} status. ` +
            'Cancel the existing invoice first before re-locking.'
          );
        }
        const lockResult = await tx.roomBilling.updateMany({
          where: { id: billingRecordId, status: roomBilling.status },
          data: { status: BILLING_STATUS.LOCKED },
        });
        if (lockResult.count !== 1) {
          throw new ConflictError('Billing record lock state changed. Refresh and retry.');
        }
      } else {
        const lockResult = await tx.roomBilling.updateMany({
          where: { id: billingRecordId, status: roomBilling.status },
          data: { status: BILLING_STATUS.LOCKED },
        });
        if (lockResult.count !== 1) {
          throw new ConflictError('Billing record lock state changed. Refresh and retry.');
        }
      }

      const locked = await tx.roomBilling.findUnique({
        where: { id: billingRecordId },
        include: { billingPeriod: true },
      });

      if (!locked) {
        throw new NotFoundError('RoomBilling', billingRecordId);
      }

      const lockedPayload: BillingLockedPayload = billingLockedPayloadSchema.parse({
        billingRecordId: locked.id,
        roomNo: locked.roomNo,
        year: locked.billingPeriod.year,
        month: locked.billingPeriod.month,
        totalAmount: Number(locked.totalDue),
        lockedBy,
      });

      const invoicePayload: InvoiceGenerationRequestedPayload = invoiceGenerationRequestedPayloadSchema.parse({
        billingRecordId: locked.id,
        roomNo: locked.roomNo,
        year: locked.billingPeriod.year,
        month: locked.billingPeriod.month,
        totalAmount: Number(locked.totalDue),
        requestedBy: lockedBy,
      });

      await tx.outboxEvent.createMany({
        data: [
          {
            id: uuidv4(),
            aggregateType: 'RoomBilling',
            aggregateId: locked.id,
            eventType: EventTypes.BILLING_LOCKED,
            payload: lockedPayload as Prisma.InputJsonValue,
            retryCount: 0,
          },
          {
            id: uuidv4(),
            aggregateType: 'RoomBilling',
            aggregateId: locked.id,
            eventType: EventTypes.INVOICE_GENERATION_REQUESTED,
            payload: invoicePayload as Prisma.InputJsonValue,
            retryCount: 0,
          },
        ],
      });

      // P3-05: Write BillingAuditLog for LOCKED action
      await tx.billingAuditLog.create({
        data: {
          id: uuidv4(),
          billingRecordId: locked.id,
          action: 'LOCKED',
          actorId: lockedBy ?? 'system',
          actorRole: lockedBy ? 'ADMIN' : 'SYSTEM',
          metadata: {
            year: locked.billingPeriod.year,
            month: locked.billingPeriod.month,
            totalAmount: Number(locked.totalDue),
          } as Prisma.InputJsonValue,
        },
      });

      return locked;
    });

    const period = await prisma.billingPeriod.findUnique({
      where: { id: updated.billingPeriodId },
    });

    return this.formatRoomBillingResponse(updated, period!);
  }

  /**
   * Unlock a LOCKED RoomBilling record back to DRAFT for corrections.
   * INVOICED records cannot be unlocked — they must be cancelled first.
   * The status check and update are wrapped in a transaction to close the
   * TOCTOU race window with concurrent cancelInvoice calls.
   */
  async unlockBillingRecord(
    billingRecordId: string,
    unlockedBy?: string
  ): Promise<BillingRecordResponse> {
    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.roomBilling.findUnique({
        where: { id: billingRecordId },
        include: { billingPeriod: true },
      });

      if (!record) {
        throw new NotFoundError('RoomBilling', billingRecordId);
      }

      if (record.status === BILLING_STATUS.DRAFT) {
        throw new BadRequestError('Billing record is already unlocked');
      }

      if (record.status === BILLING_STATUS.INVOICED) {
        // Check if the invoice has been cancelled — if so, allow unlock
        const invoice = await tx.invoice.findUnique({ where: { roomBillingId: billingRecordId } });
        if (!invoice || (invoice.status as string) !== INVOICE_STATUS.CANCELLED) {
          throw new BadRequestError('Cannot unlock an invoiced record. Cancel the invoice first.');
        }
        // If CANCELLED, fall through to allow unlock
      }

      if (record.status !== BILLING_STATUS.LOCKED) {
        throw new BadRequestError(`Cannot unlock record with status: ${record.status}`);
      }

      const updatedBilling = await tx.roomBilling.update({
        where: { id: billingRecordId },
        data: { status: BILLING_STATUS.DRAFT },
      });

      // P3-05: Write BillingAuditLog for UNLOCKED action
      await tx.billingAuditLog.create({
        data: {
          id: uuidv4(),
          billingRecordId,
          action: 'UNLOCKED',
          actorId: unlockedBy ?? 'system',
          actorRole: unlockedBy ? 'ADMIN' : 'SYSTEM',
          metadata: {
            year: record.billingPeriod.year,
            month: record.billingPeriod.month,
          } as Prisma.InputJsonValue,
        },
      });

      return updatedBilling;
    });

    const record = await prisma.roomBilling.findUnique({
      where: { id: billingRecordId },
      include: { billingPeriod: true },
    });

    logger.info({
      type: 'billing_record_unlocked',
      billingRecordId,
      roomNo: record!.roomNo,
      year: record!.billingPeriod.year,
      month: record!.billingPeriod.month,
      unlockedBy,
    });

    return this.formatRoomBillingResponse(updated, record!.billingPeriod);
  }

  /**
   * List billing records (RoomBillings) with filtering
   */
  async listBillingRecords(
    query: ListBillingRecordsQuery
  ): Promise<BillingRecordsListResponse> {
    const { roomNo, billingPeriodId, year, month, status, floor, page, pageSize, sortBy, sortOrder } = query;

    const where: Record<string, unknown> = {};

    if (roomNo) where.roomNo = roomNo;
    if (billingPeriodId) where.billingPeriodId = billingPeriodId;
    if (status) where.status = status;
    if (floor) where.room = { floorNo: floor };
    if (year || month) {
      where.billingPeriod = {};
      if (year) (where.billingPeriod as Record<string, unknown>).year = year;
      if (month) (where.billingPeriod as Record<string, unknown>).month = month;
    }

    // Map sort fields
    const SORT_FIELD_MAP: Record<string, string> = {
      totalAmount: 'totalDue',
    };
    const prismaOrderField = SORT_FIELD_MAP[sortBy] ?? sortBy;

    const total = await prisma.roomBilling.count({ where });

    // For roomNo sort, we must sort in JS (string sort breaks "798/10" before "798/2")
    const isRoomNoSort = sortBy === 'roomNo';

    const records = await prisma.roomBilling.findMany({
      where,
      include: {
        billingPeriod: true,
        room: {
          include: {
            tenants: {
              where: { moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
      },
      orderBy: isRoomNoSort ? { roomNo: 'asc' } : { [prismaOrderField]: sortOrder },
      skip: isRoomNoSort ? 0 : (page - 1) * pageSize,
      take: isRoomNoSort ? 1000 : pageSize,
    });

    // Natural roomNo sort: floor first, then natural roomNo within each floor
    if (isRoomNoSort) {
      const parseParts = (s: string) => {
        const slashIdx = s.indexOf('/');
        if (slashIdx === -1) return { prefix: parseInt(s, 10), suffix: 0 };
        return { prefix: parseInt(s.substring(0, slashIdx), 10), suffix: parseInt(s.substring(slashIdx + 1), 10) };
      };
      const sorted = sortOrder === 'desc'
        ? [...records].sort((a, b) => {
            if (a.room.floorNo !== b.room.floorNo) return b.room.floorNo - a.room.floorNo;
            const aP = parseParts(a.roomNo), bP = parseParts(b.roomNo);
            if (aP.prefix !== bP.prefix) return bP.prefix - aP.prefix;
            return bP.suffix - aP.suffix;
          })
        : [...records].sort((a, b) => {
            if (a.room.floorNo !== b.room.floorNo) return a.room.floorNo - b.room.floorNo;
            const aP = parseParts(a.roomNo), bP = parseParts(b.roomNo);
            if (aP.prefix !== bP.prefix) return aP.prefix - bP.prefix;
            return aP.suffix - bP.suffix;
          });
      const paged = sorted.slice((page - 1) * pageSize, page * pageSize);
      return {
        data: paged.map((r) => this.formatRoomBillingResponse(r, r.billingPeriod, r.room)),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }

    return {
      data: records.map((r) => this.formatRoomBillingResponse(r, r.billingPeriod, r.room)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get billing record by ID
   */
  async getBillingRecord(id: string): Promise<BillingRecordResponse> {
    const record = await prisma.roomBilling.findUnique({
      where: { id },
      include: {
        billingPeriod: true,
        room: {
          include: {
            tenants: {
              where: { moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundError('RoomBilling', id);
    }

    return this.formatRoomBillingResponse(record, record.billingPeriod, record.room);
  }

  /**
   * Format RoomBilling for response (compatible with old BillingRecordResponse shape)
   */
  private formatRoomBillingResponse(
    record: {
      id: string;
      roomNo: string;
      billingPeriodId: string;
      rentAmount: unknown;
      waterUnits?: unknown;
      waterTotal?: unknown;
      electricUnits?: unknown;
      electricTotal?: unknown;
      furnitureFee?: unknown;
      otherFee?: unknown;
      totalDue: unknown;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    },
    period: {
      year: number;
      month: number;
      dueDay: number;
    },
    room?: {
      roomNo: string;
      tenants?: Array<{
        tenant: { firstName: string; lastName: string | null } | null;
      }>;
    } | null
  ): BillingRecordResponse {
    // Build tenant name from room relation
    const currentTenant = room?.tenants?.[0]?.tenant;
    const tenantName = currentTenant
      ? [currentTenant.firstName, currentTenant.lastName].filter(Boolean).join(' ')
      : null;

    // Synthesize billing line items from flat columns
    const items: import('./types').BillingItemResponse[] = [];
    const rentAmount = Number(record.rentAmount ?? 0);
    const waterUnits = Number(record.waterUnits ?? 0);
    const waterTotal = Number(record.waterTotal ?? 0);
    const electricUnits = Number(record.electricUnits ?? 0);
    const electricTotal = Number(record.electricTotal ?? 0);
    const furnitureFee = Number(record.furnitureFee ?? 0);
    const otherFee = Number(record.otherFee ?? 0);

    if (rentAmount > 0) {
      items.push({ id: 'rent', description: 'ค่าเช่า', quantity: 1, unitPrice: rentAmount, amount: rentAmount });
    }
    if (waterTotal > 0) {
      items.push({ id: 'water', description: 'ค่าน้ำ', quantity: waterUnits, unitPrice: waterUnits > 0 ? Math.round((waterTotal / waterUnits) * 100) / 100 : waterTotal, amount: waterTotal });
    }
    if (electricTotal > 0) {
      items.push({ id: 'electric', description: 'ค่าไฟ', quantity: electricUnits, unitPrice: electricUnits > 0 ? Math.round((electricTotal / electricUnits) * 100) / 100 : electricTotal, amount: electricTotal });
    }
    if (furnitureFee > 0) {
      items.push({ id: 'furniture', description: 'ค่าเฟอร์นิเจอร์', quantity: 1, unitPrice: furnitureFee, amount: furnitureFee });
    }
    if (otherFee > 0) {
      items.push({ id: 'other', description: 'ค่าอื่นๆ', quantity: 1, unitPrice: otherFee, amount: otherFee });
    }

    return {
      id: record.id,
      roomNo: record.roomNo,
      roomNumber: record.roomNo,
      billingPeriodId: record.billingPeriodId,
      year: period.year,
      month: period.month,
      status: record.status as BillingStatus,
      totalAmount: Number(record.totalDue),
      subtotal: Number(record.totalDue),
      lockedAt: null,
      lockedBy: null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      tenantName,
      room: { roomNumber: record.roomNo },
      items,
    };
  }

  // ============================================================================
  // Full workbook import — upserts master data then creates/updates RoomBilling
  // ============================================================================

  /**
   * Import a full billing workbook (all sheets):
   *  1. Upserts BankAccounts from ACCOUNTS sheet
   *  2. Upserts BillingRules from RULES sheet (maps new RuleRow fields to DB schema)
   *  3. Gets/creates BillingPeriod from CONFIG year/month
   *  4. Creates ImportBatch (PROCESSING)
   *  5. For each floor row: computes amounts via BillingCalculator, upserts RoomBilling
   *  6. Updates ImportBatch to COMPLETED
   *
   * Note: No ROOM_MASTER sheet in the new template — rooms must exist in the DB.
   */
  async importFullWorkbook(
    buffer: Uint8Array,
    importedBy?: string
  ): Promise<{
    batchId: string;
    billingPeriodId: string;
    year: number;
    month: number;
    imported: number;
    skipped: number;
    errors: number;
  }> {
    const parsed: FullWorkbookParseResult = parseFullWorkbook(buffer);
    const { config, accounts, rules } = parsed;

    const year = config.billingYear;
    const month = config.billingMonth;

    // ── 1. Upsert BankAccounts ──────────────────────────────────────────────
    for (const acc of accounts) {
      await prisma.bankAccount.upsert({
        where: { id: acc.id },
        create: {
          id: acc.id,
          name: acc.accountName,
          bankName: acc.bank,
          bankAccountNo: acc.accountNumber,
          active: acc.isDefault,
        },
        update: {
          name: acc.accountName,
          bankName: acc.bank,
          bankAccountNo: acc.accountNumber,
          active: acc.isDefault,
        },
      });
    }

    // ── 2. Upsert BillingRules ──────────────────────────────────────────────
    // Map new RuleRow fields to the existing BillingRule Prisma model fields.
    // The DB model uses the old column shape; we derive compatible values from
    // the new expanded RuleRow without touching the Prisma schema.
    for (const rule of rules) {
      const waterEnabled   = rule.waterMode !== 'DISABLED';
      const electricEnabled = rule.electricMode !== 'DISABLED';

      // Derive a single unit price from the new rate fields
      const waterUnitPrice   = rule.waterRate > 0 ? rule.waterRate : rule.waterS1Rate;
      const electricUnitPrice = rule.electricRate > 0 ? rule.electricRate : rule.electricS1Rate;

      // Map new fee modes to the old ServiceFeeMode enum values
      await prisma.billingRule.upsert({
        where: { code: rule.code },
        create: {
          code: rule.code,
          descriptionTh: rule.description,
          waterEnabled,
          waterUnitPrice,
          waterMinCharge: rule.waterMinCharge,
          waterServiceFeeMode: mapFeeMode(rule.waterFeeMode),
          waterServiceFeeAmount: rule.waterFeeAmount > 0 ? rule.waterFeeAmount : rule.waterFeePerUnit,
          electricEnabled,
          electricUnitPrice,
          electricMinCharge: rule.electricMinCharge,
          electricServiceFeeMode: mapFeeMode(rule.electricFeeMode),
          electricServiceFeeAmount: rule.electricFeeAmount > 0 ? rule.electricFeeAmount : rule.electricFeePerUnit,
          // Water STEP tiers
          waterS1Upto: rule.waterS1Upto ?? new Decimal(0),
          waterS1Rate: rule.waterS1Rate ?? new Decimal(0),
          waterS2Upto: rule.waterS2Upto ?? new Decimal(0),
          waterS2Rate: rule.waterS2Rate ?? new Decimal(0),
          waterS3Rate: rule.waterS3Rate ?? new Decimal(0),
          // Electric STEP tiers
          electricS1Upto: rule.electricS1Upto ?? new Decimal(0),
          electricS1Rate: rule.electricS1Rate ?? new Decimal(0),
          electricS2Upto: rule.electricS2Upto ?? new Decimal(0),
          electricS2Rate: rule.electricS2Rate ?? new Decimal(0),
          electricS3Rate: rule.electricS3Rate ?? new Decimal(0),
        },
        update: {
          descriptionTh: rule.description,
          waterEnabled,
          waterUnitPrice,
          waterMinCharge: rule.waterMinCharge,
          waterServiceFeeMode: mapFeeMode(rule.waterFeeMode),
          waterServiceFeeAmount: rule.waterFeeAmount > 0 ? rule.waterFeeAmount : rule.waterFeePerUnit,
          electricEnabled,
          electricUnitPrice,
          electricMinCharge: rule.electricMinCharge,
          electricServiceFeeMode: mapFeeMode(rule.electricFeeMode),
          electricServiceFeeAmount: rule.electricFeeAmount > 0 ? rule.electricFeeAmount : rule.electricFeePerUnit,
          // Water STEP tiers
          waterS1Upto: rule.waterS1Upto ?? new Decimal(0),
          waterS1Rate: rule.waterS1Rate ?? new Decimal(0),
          waterS2Upto: rule.waterS2Upto ?? new Decimal(0),
          waterS2Rate: rule.waterS2Rate ?? new Decimal(0),
          waterS3Rate: rule.waterS3Rate ?? new Decimal(0),
          // Electric STEP tiers
          electricS1Upto: rule.electricS1Upto ?? new Decimal(0),
          electricS1Rate: rule.electricS1Rate ?? new Decimal(0),
          electricS2Upto: rule.electricS2Upto ?? new Decimal(0),
          electricS2Rate: rule.electricS2Rate ?? new Decimal(0),
          electricS3Rate: rule.electricS3Rate ?? new Decimal(0),
        },
      });
    }

    // ── 3. Get or create BillingPeriod ──────────────────────────────────────
    let period = await prisma.billingPeriod.findUnique({
      where: { year_month: { year, month } },
    });
    if (!period) {
      period = await prisma.billingPeriod.create({
        data: { id: uuidv4(), year, month, status: BILLING_PERIOD_STATUS.OPEN, dueDay: DEFAULT_DUE_DAY },
      });
    }

    // ── 4. Create ImportBatch (PROCESSING) ──────────────────────────────────
    const allRows = parsed.floors.flatMap((f) => f.rows);
    const rowsTotal = allRows.length;
    const batchId = uuidv4();

    await prisma.importBatch.create({
      data: {
        id: batchId,
        billingPeriodId: period.id,
        filename: 'billing_template.xlsx',
        schemaVersion: 'billing-v2',
        rowsTotal,
        rowsImported: 0,
        rowsSkipped: 0,
        rowsErrored: 0,
        status: IMPORT_BATCH_STATUS.PROCESSING,
        importedBy: importedBy ?? 'system',
      },
    });

    // Build a Map for O(1) rule lookup
    const rulesMap = new Map(rules.map((r) => [r.code, r]));

    // Prefetch all rooms and existing billings to avoid N+1 queries
    const allRoomNos = Array.from(new Set(allRows.map((r) => r.roomNo)));
    const [dbRooms, existingBillings] = await Promise.all([
      prisma.room.findMany({ where: { roomNo: { in: allRoomNos } } }),
      prisma.roomBilling.findMany({
        where: { billingPeriodId: period!.id, roomNo: { in: allRoomNos } },
      }),
    ]);
    const roomsMap = new Map(dbRooms.map((r) => [r.roomNo, r]));
    const billingsMap = new Map(existingBillings.map((b) => [b.roomNo, b]));

    // FIX H06: Process rows in batches, each batch wrapped in $transaction.
    // If a batch fails, previous batches are already committed (acceptable partial
    // import) but the current batch rolls back entirely.
    const BATCH_SIZE = 50;
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorLog: Array<{ roomNo: string; error: string }> = [];

    // ── 5. Process each floor row in batches ─────────────────────────────────
    for (let batchStart = 0; batchStart < allRows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, allRows.length);
      const batchRows = allRows.slice(batchStart, batchEnd);

      try {
        await prisma.$transaction(async (tx) => {
          for (const row of batchRows) {
            const { roomNo } = row;
            try {
              // Verify room exists in DB using prefetched map
              const dbRoom = roomsMap.get(roomNo);
              if (!dbRoom) {
                logger.warn({ type: 'billing_import_room_missing', roomNo });
                skipped++;
                continue;
              }

              // Determine effective rule — use override from row, else room default
              const effectiveRuleCode =
                row.ruleOverrideCode ??
                dbRoom.defaultRuleCode ??
                config.defaultRuleCode ??
                '';

              const ruleData = rulesMap.get(effectiveRuleCode);
              if (!ruleData) {
                errorLog.push({ roomNo, error: `Rule '${effectiveRuleCode}' not found` });
                errors++;
                continue;
              }

              // Adapt new RuleRow to BillingRuleData shape expected by the calculator
              const billingRuleData = {
                waterEnabled:           ruleData.waterMode !== 'DISABLED',
                waterUnitPrice:         ruleData.waterRate > 0 ? ruleData.waterRate : ruleData.waterS1Rate,
                waterMinCharge:         ruleData.waterMinCharge,
                waterServiceFeeMode:    mapFeeMode(ruleData.waterFeeMode),
                waterServiceFeeAmount:  ruleData.waterFeeAmount > 0 ? ruleData.waterFeeAmount : ruleData.waterFeePerUnit,
                // Water STEP tiers
                waterS1Upto:            ruleData.waterS1Upto,
                waterS1Rate:            ruleData.waterS1Rate,
                waterS2Upto:            ruleData.waterS2Upto,
                waterS2Rate:            ruleData.waterS2Rate,
                waterS3Rate:            ruleData.waterS3Rate,
                electricEnabled:        ruleData.electricMode !== 'DISABLED',
                electricUnitPrice:      ruleData.electricRate > 0 ? ruleData.electricRate : ruleData.electricS1Rate,
                electricMinCharge:      ruleData.electricMinCharge,
                electricServiceFeeMode: mapFeeMode(ruleData.electricFeeMode),
                electricServiceFeeAmount: ruleData.electricFeeAmount > 0 ? ruleData.electricFeeAmount : ruleData.electricFeePerUnit,
                // Electric STEP tiers
                electricS1Upto:         ruleData.electricS1Upto,
                electricS1Rate:        ruleData.electricS1Rate,
                electricS2Upto:        ruleData.electricS2Upto,
                electricS2Rate:        ruleData.electricS2Rate,
                electricS3Rate:        ruleData.electricS3Rate,
              };

              // Normalise meter modes to the calculator's MeterMode ('NORMAL' | 'MANUAL' | 'FLAT' | 'STEP')
              const normWaterMode = normaliseMeterMode(row.waterMode);
              const normElectricMode = normaliseMeterMode(row.electricMode);

              // Compute billing using BillingCalculator (ignores Excel-computed columns)
              const computed = computeRoomBilling(
                {
                  rentAmount: row.rentAmount,
                  waterMode: normWaterMode,
                  waterPrev: row.waterPrev,
                  waterCurr: row.waterCurr,
                  waterUnitsManual: row.waterUnitsManual,
                  waterFlatAmount: undefined,
                  waterServiceFeeManual: row.waterServiceFeeManual,
                  electricMode: normElectricMode,
                  electricPrev: row.electricPrev,
                  electricCurr: row.electricCurr,
                  electricUnitsManual: row.electricUnitsManual,
                  electricFlatAmount: undefined,
                  electricServiceFeeManual: row.electricServiceFeeManual,
                  furnitureFee: row.furnitureFee,
                  otherFee: row.otherFee,
                  // Mid-month move dates — parse from Excel string format to Date
                  moveInDate: row.moveInDate ? new Date(row.moveInDate) : null,
                  moveOutDate: row.moveOutDate ? new Date(row.moveOutDate) : null,
                  // Billing period context for proration calculations
                  billingPeriod: { year: period!.year, month: period!.month },
                },
                billingRuleData
              );

              const checkNotes = computeCheckNotes(
                {
                  waterMode: normWaterMode,
                  waterPrev: row.waterPrev,
                  waterCurr: row.waterCurr,
                  waterUnitsManual: row.waterUnitsManual,
                  electricMode: normElectricMode,
                  electricPrev: row.electricPrev,
                  electricCurr: row.electricCurr,
                  electricUnitsManual: row.electricUnitsManual,
                },
                computed
              );

              // Get effective account ID — use row override, else room default, else config default
              const effectiveAccountId =
                row.recvAccountOverrideId ??
                dbRoom.defaultAccountId ??
                config.defaultAccountId ??
                '';

              // Upsert RoomBilling — create if not exists, update if DRAFT (using prefetched map)
              const existing = billingsMap.get(roomNo);

              if (existing && existing.status !== BILLING_STATUS.DRAFT) {
                skipped++;
                continue;
              }

              const billingData = {
                recvAccountOverrideId: row.recvAccountOverrideId ?? undefined,
                recvAccountId: effectiveAccountId,
                ruleOverrideCode: row.ruleOverrideCode ?? undefined,
                ruleCode: effectiveRuleCode,
                rentAmount: row.rentAmount,
                waterMode: normWaterMode,
                waterPrev: row.waterPrev ?? undefined,
                waterCurr: row.waterCurr ?? undefined,
                waterUnitsManual: row.waterUnitsManual ?? undefined,
                waterUnits: computed.waterUnits,
                waterUsageCharge: computed.waterUsageCharge,
                waterServiceFeeManual: row.waterServiceFeeManual ?? undefined,
                waterServiceFee: computed.waterServiceFee,
                waterTotal: computed.waterTotal,
                electricMode: normElectricMode,
                electricPrev: row.electricPrev ?? undefined,
                electricCurr: row.electricCurr ?? undefined,
                electricUnitsManual: row.electricUnitsManual ?? undefined,
                electricUnits: computed.electricUnits,
                electricUsageCharge: computed.electricUsageCharge,
                electricServiceFeeManual: row.electricServiceFeeManual ?? undefined,
                electricServiceFee: computed.electricServiceFee,
                electricTotal: computed.electricTotal,
                furnitureFee: row.furnitureFee,
                otherFee: row.otherFee,
                totalDue: computed.totalDue,
                // Populate proratedRent only when move-in/move-out mid-month
                proratedRent: computed.proratedRent ?? undefined,
                note: row.note ?? undefined,
                checkNotes: checkNotes ?? undefined,
              };

              if (existing) {
                // Update existing DRAFT
                await tx.roomBilling.update({
                  where: { id: existing.id },
                  data: billingData,
                });
              } else {
                // Create new
                await tx.roomBilling.create({
                  data: {
                    id: uuidv4(),
                    billingPeriodId: period!.id,
                    roomNo,
                    status: BILLING_STATUS.DRAFT,
                    ...billingData,
                  },
                });
              }

              imported++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              errorLog.push({ roomNo, error: msg });
              errors++;
              logger.error({ type: 'billing_full_import_row_error', roomNo, error: msg });
            }
          }
        });
      } catch (err) {
        // Entire batch transaction failed — rollback this batch but keep previous
        // batches committed. Log and let the operator retry the file if needed.
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ type: 'billing_full_import_batch_error', batchStart, batchEnd, error: msg });
        // Mark all rows in this batch as errors (they were rolled back)
        for (const row of batchRows) {
          if (!errorLog.some(e => e.roomNo === row.roomNo)) {
            errorLog.push({ roomNo: row.roomNo, error: `Batch failed: ${msg}` });
          }
        }
        errors += batchRows.length;
        // Do not re-throw — allow partial import to be marked as COMPLETED
      }
    }

    // ── 7. Update ImportBatch to COMPLETED ───────────────────────────────────
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: errors === rowsTotal && rowsTotal > 0 ? IMPORT_BATCH_STATUS.FAILED : IMPORT_BATCH_STATUS.COMPLETED,
        rowsImported: imported,
        rowsSkipped: skipped,
        rowsErrored: errors,
        errorLog: errorLog.length > 0 ? (errorLog as Prisma.InputJsonValue) : undefined,
      },
    });

    logger.info({
      type: 'billing_full_import_done',
      batchId,
      year,
      month,
      imported,
      skipped,
      errors,
    });

    return { batchId, billingPeriodId: period!.id, year, month, imported, skipped, errors };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createBillingService(eventBus?: EventBus): BillingService {
  return new BillingService(eventBus);
}

/**
 * Cached singleton accessor used by route handlers, workers, and integration
 * tests that need a BillingService without plumbing through the DI container.
 */
let _billingServiceSingleton: BillingService | null = null;
export function getBillingService(): BillingService {
  if (!_billingServiceSingleton) {
    _billingServiceSingleton = new BillingService();
  }
  return _billingServiceSingleton;
}
