import { v4 as uuidv4 } from 'uuid';
import { prisma, EventBus, logger, EventTypes } from '@/lib';

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
  waterMode: 'NORMAL' | 'MANUAL';
  waterPrev?: number | null;
  waterCurr?: number | null;
  waterUnitsManual?: number | null;
  waterUnits: number;
  waterUsageCharge: number;
  waterServiceFeeManual?: number | null;
  waterServiceFee: number;
  waterTotal: number;
  electricMode: 'NORMAL' | 'MANUAL';
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
    note: row.note ?? undefined,
    checkNotes: row.checkNotes ?? undefined,
  };
}

/**
 * Normalise the wider meter mode from the parser ('DISABLED' | 'FLAT' | 'STEP'
 * are not in the Prisma MeterMode enum) to the DB-safe 'NORMAL' | 'MANUAL'.
 */
function normaliseMeterMode(mode: string): 'NORMAL' | 'MANUAL' {
  return mode === 'MANUAL' ? 'MANUAL' : 'NORMAL';
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
          status: 'OPEN',
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
        return tx.roomBilling.create({
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
            status: 'DRAFT',
          },
        });
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

    await prisma.outboxEvent.create({
      data: {
        id: uuidv4(),
        aggregateType: 'RoomBilling',
        aggregateId: roomBilling.id,
        eventType: EventTypes.BILLING_RECORD_CREATED,
        payload: {
          billingRecordId: roomBilling.id,
          roomNo: roomBilling.roomNo,
          year: input.year,
          month: input.month,
          createdBy,
        },
        retryCount: 0,
      },
    });

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
      payload as any,
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
        data: { id: uuidv4(), year, month, status: 'OPEN', dueDay: DEFAULT_DUE_DAY },
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

    for (const row of allRows) {
      const { roomNo } = row;
      try {
        const room = roomMap.get(roomNo);
        if (!room) {
          skipped.push({ roomNo, reason: 'Room not found in database' });
          continue;
        }

        const existing = existingMap.get(roomNo);
        if (existing) {
          if (existing.status !== 'DRAFT') {
            skipped.push({ roomNo, reason: `Already ${existing.status}` });
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
          continue;
        }

        // Create new RoomBilling
        const rb = await prisma.$transaction(async (tx) => {
          const roomBilling = await tx.roomBilling.create({
            data: {
              id: uuidv4(),
              billingPeriodId: period!.id,
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
              status: 'DRAFT',
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
                year,
                month,
                importedBy,
              },
              retryCount: 0,
            },
          });
          return roomBilling;
        });

        created.push({ roomNo, billingRecordId: rb.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ roomNo, error: msg });
        logger.error({ type: 'billing_import_row_error', roomNo, error: msg });
      }
    }

    logger.info({ type: 'billing_import_done', year, month, created: created.length, skipped: skipped.length, errors: errors.length });
    return { created, skipped, errors };
  }

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
          if (existing.status !== 'DRAFT') {
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
              status: 'DRAFT',
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

      if (roomBilling.status === 'LOCKED' && !input.force) {
        throw new BadRequestError('Billing record is already locked');
      }

      if (roomBilling.status === 'INVOICED' && !input.force) {
        throw new BadRequestError('Billing record is already invoiced');
      }

      if (input.force) {
        await tx.roomBilling.update({
          where: { id: billingRecordId },
          data: { status: 'LOCKED' },
        });
      } else {
        const lockResult = await tx.roomBilling.updateMany({
          where: { id: billingRecordId, status: roomBilling.status },
          data: { status: 'LOCKED' },
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
            payload: lockedPayload as any,
            retryCount: 0,
          },
          {
            id: uuidv4(),
            aggregateType: 'RoomBilling',
            aggregateId: locked.id,
            eventType: EventTypes.INVOICE_GENERATION_REQUESTED,
            payload: invoicePayload as any,
            retryCount: 0,
          },
        ],
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

      if (record.status === 'DRAFT') {
        throw new BadRequestError('Billing record is already unlocked');
      }

      if (record.status === 'INVOICED') {
        // Check if the invoice has been cancelled — if so, allow unlock
        const invoice = await tx.invoice.findUnique({ where: { roomBillingId: billingRecordId } });
        if (!invoice || (invoice.status as string) !== 'CANCELLED') {
          throw new BadRequestError('Cannot unlock an invoiced record. Cancel the invoice first.');
        }
        // If CANCELLED, fall through to allow unlock
      }

      if (record.status !== 'LOCKED') {
        throw new BadRequestError(`Cannot unlock record with status: ${record.status}`);
      }

      return tx.roomBilling.update({
        where: { id: billingRecordId },
        data: { status: 'DRAFT' },
      });
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
    const { roomNo, billingPeriodId, year, month, status, page, pageSize, sortBy, sortOrder } = query;

    const where: Record<string, unknown> = {};

    if (roomNo) where.roomNo = roomNo;
    if (billingPeriodId) where.billingPeriodId = billingPeriodId;
    if (status) where.status = status;
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
      orderBy: { [prismaOrderField]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

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
        },
      });
    }

    // ── 3. Get or create BillingPeriod ──────────────────────────────────────
    let period = await prisma.billingPeriod.findUnique({
      where: { year_month: { year, month } },
    });
    if (!period) {
      period = await prisma.billingPeriod.create({
        data: { id: uuidv4(), year, month, status: 'OPEN', dueDay: DEFAULT_DUE_DAY },
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
        status: 'PROCESSING',
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

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorLog: Array<{ roomNo: string; error: string }> = [];

    // ── 5. Process each floor row ────────────────────────────────────────────
    for (const row of allRows) {
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
          electricEnabled:        ruleData.electricMode !== 'DISABLED',
          electricUnitPrice:      ruleData.electricRate > 0 ? ruleData.electricRate : ruleData.electricS1Rate,
          electricMinCharge:      ruleData.electricMinCharge,
          electricServiceFeeMode: mapFeeMode(ruleData.electricFeeMode),
          electricServiceFeeAmount: ruleData.electricFeeAmount > 0 ? ruleData.electricFeeAmount : ruleData.electricFeePerUnit,
        };

        // Normalise meter modes to the calculator's narrower enum ('NORMAL' | 'MANUAL')
        const normWaterMode: 'NORMAL' | 'MANUAL' =
          row.waterMode === 'MANUAL' ? 'MANUAL' : 'NORMAL';
        const normElectricMode: 'NORMAL' | 'MANUAL' =
          row.electricMode === 'MANUAL' ? 'MANUAL' : 'NORMAL';

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

        if (existing && existing.status !== 'DRAFT') {
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
          note: row.note ?? undefined,
          checkNotes: checkNotes ?? undefined,
        };

        if (existing) {
          // Update existing DRAFT
          await prisma.roomBilling.update({
            where: { id: existing.id },
            data: billingData,
          });
        } else {
          // Create new
          await prisma.roomBilling.create({
            data: {
              id: uuidv4(),
              billingPeriodId: period!.id,
              roomNo,
              status: 'DRAFT',
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

    // ── 7. Update ImportBatch to COMPLETED ───────────────────────────────────
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: errors === rowsTotal && rowsTotal > 0 ? 'FAILED' : 'COMPLETED',
        rowsImported: imported,
        rowsSkipped: skipped,
        rowsErrored: errors,
        errorLog: errorLog.length > 0 ? (errorLog as any as import('@prisma/client').Prisma.InputJsonValue) : undefined,
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
