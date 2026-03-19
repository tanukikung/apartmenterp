import { v4 as uuidv4 } from 'uuid';
import { prisma, EventBus, logger, EventTypes } from '@/lib';
import { Json } from '@/types/prisma-json';
import {
  CreateBillingRecordInput,
  AddBillingItemInput,
  UpdateBillingItemInput,
  LockBillingInput,
  ListBillingRecordsQuery,
  BillingRecordResponse,
  BillingRecordsListResponse,
  BillingItemResponse,
  BillingRecordCreatedPayload,
  BillingLockedPayload,
  InvoiceGenerationRequestedPayload,
  billingRecordCreatedPayloadSchema,
  billingLockedPayloadSchema,
  invoiceGenerationRequestedPayloadSchema,
} from './types';
import type { BillingStatus } from './types';
import type { WorkbookParseResult, FullWorkbookParseResult } from './import-parser';
import { parseFullWorkbook } from './import-parser';
import { computeRoomBilling, computeCheckNotes } from './billing-calculator';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '@/lib/utils/errors';

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
          dueDay: 25,
        },
      });
    }

    // Business rule: Only one RoomBilling per room/period
    const existing = await prisma.roomBilling.findUnique({
      where: { billingPeriodId_roomNo: { billingPeriodId: period.id, roomNo: input.roomNo } },
    });

    if (existing) {
      throw new ConflictError(
        `Billing record for ${input.year}-${input.month} already exists for room ${input.roomNo}`
      );
    }

    // Create room billing using room defaults
    const roomBilling = await prisma.roomBilling.create({
      data: {
        id: uuidv4(),
        billingPeriodId: period.id,
        roomNo: input.roomNo,
        recvAccountId: room.defaultAccountId,
        ruleCode: room.defaultRuleCode,
        rentAmount: room.defaultRentAmount,
        waterMode: 'NORMAL',
        electricMode: 'NORMAL',
        status: 'DRAFT',
      },
    });

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
        } as unknown as Json,
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
      payload as unknown as Record<string, unknown>,
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
        data: { id: uuidv4(), year, month, status: 'OPEN', dueDay: 25 },
      });
    }

    const created: Array<{ roomNo: string; billingRecordId: string }> = [];
    const skipped: Array<{ roomNo: string; reason: string }> = [];
    const errors: Array<{ roomNo: string; error: string }> = [];

    for (const row of allRows) {
      const { roomNo } = row;
      try {
        // Check room exists
        const room = await prisma.room.findUnique({ where: { roomNo } });
        if (!room) {
          skipped.push({ roomNo, reason: 'Room not found in database' });
          continue;
        }

        // Check for existing RoomBilling
        const existing = await prisma.roomBilling.findUnique({
          where: { billingPeriodId_roomNo: { billingPeriodId: period!.id, roomNo } },
        });
        if (existing) {
          if (existing.status !== 'DRAFT') {
            skipped.push({ roomNo, reason: `Already ${existing.status}` });
            continue;
          }
          // Overwrite DRAFT record
          await prisma.roomBilling.update({
            where: { id: existing.id },
            data: {
              recvAccountOverrideId: row.recvAccountOverrideId,
              recvAccountId: row.recvAccountOverrideId ?? room.defaultAccountId,
              ruleOverrideCode: row.ruleOverrideCode,
              ruleCode: row.ruleOverrideCode ?? room.defaultRuleCode,
              rentAmount: row.rentAmount,
              waterMode: row.waterMode,
              waterPrev: row.waterPrev,
              waterCurr: row.waterCurr,
              waterUnitsManual: row.waterUnitsManual,
              waterUnits: row.waterUnits,
              waterUsageCharge: row.waterUsageCharge,
              waterServiceFeeManual: row.waterServiceFeeManual,
              waterServiceFee: row.waterServiceFee,
              waterTotal: row.waterTotal,
              electricMode: row.electricMode,
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
            },
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
              waterMode: row.waterMode,
              waterPrev: row.waterPrev,
              waterCurr: row.waterCurr,
              waterUnitsManual: row.waterUnitsManual,
              waterUnits: row.waterUnits,
              waterUsageCharge: row.waterUsageCharge,
              waterServiceFeeManual: row.waterServiceFeeManual,
              waterServiceFee: row.waterServiceFee,
              waterTotal: row.waterTotal,
              electricMode: row.electricMode,
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
              } as unknown as Json,
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
   * Import billing rows with batch tracking (stub)
   */
  async importBillingRowsWithBatch(
    _workbook: WorkbookParseResult,
    _batchId: string,
    _billingPeriodId: string,
    _importedBy?: string
  ): Promise<{ created: Array<{ roomNo: string; billingRecordId: string }> }> {
    // TODO: implement full ImportBatch flow for BillingPeriod/RoomBilling
    logger.warn({ type: 'billing_import_rows_with_batch_stub', message: 'importBillingRowsWithBatch is a stub' });
    return { created: [] };
  }

  /**
   * Add billing item — not applicable in new schema (items are fields on RoomBilling).
   * Kept for API compatibility; throws BadRequestError.
   */
  async addBillingItem(
    _billingRecordId: string,
    _input: AddBillingItemInput,
    _addedBy?: string
  ): Promise<BillingItemResponse> {
    throw new BadRequestError('addBillingItem is not supported in the new billing schema. Update RoomBilling fields directly.');
  }

  /**
   * Update billing item — not applicable in new schema.
   */
  async updateBillingItem(
    _itemId: string,
    _input: UpdateBillingItemInput,
    _updatedBy?: string
  ): Promise<BillingItemResponse> {
    throw new BadRequestError('updateBillingItem is not supported in the new billing schema. Update RoomBilling fields directly.');
  }

  /**
   * Remove billing item — not applicable in new schema.
   */
  async removeBillingItem(
    _itemId: string,
    _removedBy?: string
  ): Promise<void> {
    throw new BadRequestError('removeBillingItem is not supported in the new billing schema. Update RoomBilling fields directly.');
  }

  /**
   * Lock a RoomBilling record and trigger invoice generation
   */
  async lockBillingRecord(
    billingRecordId: string,
    input: LockBillingInput,
    lockedBy?: string
  ): Promise<BillingRecordResponse> {
    const lockTimestamp = new Date();

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
            payload: lockedPayload as unknown as Json,
            retryCount: 0,
          },
          {
            id: uuidv4(),
            aggregateType: 'RoomBilling',
            aggregateId: locked.id,
            eventType: EventTypes.INVOICE_GENERATION_REQUESTED,
            payload: invoicePayload as unknown as Json,
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
      include: { billingPeriod: true },
      orderBy: { [prismaOrderField]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: records.map((r) => this.formatRoomBillingResponse(r, r.billingPeriod)),
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
      include: { billingPeriod: true },
    });

    if (!record) {
      throw new NotFoundError('RoomBilling', id);
    }

    return this.formatRoomBillingResponse(record, record.billingPeriod);
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
      totalDue: unknown;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    },
    period: {
      year: number;
      month: number;
      dueDay: number;
    }
  ): BillingRecordResponse {
    return {
      id: record.id,
      roomNo: record.roomNo,
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
      items: [],
    };
  }

  /**
   * Format billing item for response
   */
  private formatBillingItemResponse(
    _item: unknown
  ): BillingItemResponse {
    throw new BadRequestError('formatBillingItemResponse is not supported in the new billing schema');
  }

  // ============================================================================
  // Full workbook import — upserts master data then creates/updates RoomBilling
  // ============================================================================

  /**
   * Import a full billing workbook (all sheets):
   *  1. Upserts BankAccounts from ACCOUNTS sheet
   *  2. Upserts BillingRules from RULES sheet
   *  3. Upserts Rooms from ROOM_MASTER sheet
   *  4. Gets/creates BillingPeriod from CONFIG year/month
   *  5. Creates ImportBatch (PROCESSING)
   *  6. For each floor row: computes amounts via BillingCalculator, upserts RoomBilling
   *  7. Updates ImportBatch to COMPLETED
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
    const { config, accounts, rules, rooms } = parsed;

    const year = config.billingYear;
    const month = config.billingMonth;

    // ── 1. Upsert BankAccounts ──────────────────────────────────────────────
    for (const acc of accounts) {
      await prisma.bankAccount.upsert({
        where: { id: acc.accountId },
        create: {
          id: acc.accountId,
          name: acc.accountName,
          bankName: acc.bankName,
          bankAccountNo: acc.bankAccountNo,
          promptpay: acc.promptpay ?? undefined,
          active: acc.active,
        },
        update: {
          name: acc.accountName,
          bankName: acc.bankName,
          bankAccountNo: acc.bankAccountNo,
          promptpay: acc.promptpay ?? undefined,
          active: acc.active,
        },
      });
    }

    // ── 2. Upsert BillingRules ──────────────────────────────────────────────
    for (const rule of rules) {
      await prisma.billingRule.upsert({
        where: { code: rule.code },
        create: {
          code: rule.code,
          descriptionTh: rule.descriptionTh,
          waterEnabled: rule.waterEnabled,
          waterUnitPrice: rule.waterUnitPrice,
          waterMinCharge: rule.waterMinCharge,
          waterServiceFeeMode: rule.waterServiceFeeMode,
          waterServiceFeeAmount: rule.waterServiceFeeAmount,
          electricEnabled: rule.electricEnabled,
          electricUnitPrice: rule.electricUnitPrice,
          electricMinCharge: rule.electricMinCharge,
          electricServiceFeeMode: rule.electricServiceFeeMode,
          electricServiceFeeAmount: rule.electricServiceFeeAmount,
        },
        update: {
          descriptionTh: rule.descriptionTh,
          waterEnabled: rule.waterEnabled,
          waterUnitPrice: rule.waterUnitPrice,
          waterMinCharge: rule.waterMinCharge,
          waterServiceFeeMode: rule.waterServiceFeeMode,
          waterServiceFeeAmount: rule.waterServiceFeeAmount,
          electricEnabled: rule.electricEnabled,
          electricUnitPrice: rule.electricUnitPrice,
          electricMinCharge: rule.electricMinCharge,
          electricServiceFeeMode: rule.electricServiceFeeMode,
          electricServiceFeeAmount: rule.electricServiceFeeAmount,
        },
      });
    }

    // ── 3. Upsert Rooms ─────────────────────────────────────────────────────
    for (const rm of rooms) {
      await prisma.room.upsert({
        where: { roomNo: rm.roomNo },
        create: {
          roomNo: rm.roomNo,
          floorNo: rm.floorNo,
          defaultAccountId: rm.defaultAccountId,
          defaultRuleCode: rm.defaultRuleCode,
          defaultRentAmount: rm.defaultRentAmount,
          hasFurniture: rm.hasFurniture,
          defaultFurnitureAmount: rm.defaultFurnitureAmount,
          roomStatus: rm.roomStatus,
        },
        update: {
          floorNo: rm.floorNo,
          defaultAccountId: rm.defaultAccountId,
          defaultRuleCode: rm.defaultRuleCode,
          defaultRentAmount: rm.defaultRentAmount,
          hasFurniture: rm.hasFurniture,
          defaultFurnitureAmount: rm.defaultFurnitureAmount,
          roomStatus: rm.roomStatus,
        },
      });
    }

    // ── 4. Get or create BillingPeriod ──────────────────────────────────────
    let period = await prisma.billingPeriod.findUnique({
      where: { year_month: { year, month } },
    });
    if (!period) {
      period = await prisma.billingPeriod.create({
        data: { id: uuidv4(), year, month, status: 'OPEN', dueDay: 25 },
      });
    }

    // ── 5. Create ImportBatch (PROCESSING) ──────────────────────────────────
    const allRows = parsed.floors.flatMap((f) => f.rows);
    const rowsTotal = allRows.length;
    const batchId = uuidv4();

    await prisma.importBatch.create({
      data: {
        id: batchId,
        billingPeriodId: period.id,
        filename: 'apartment_excel_template.xlsx',
        schemaVersion: config.schemaVersion,
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

    // Build a Set of known room IDs from ROOM_MASTER for fast existence check
    const masterRoomSet = new Set(rooms.map((r) => r.roomNo));

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorLog: Array<{ roomNo: string; error: string }> = [];

    // ── 6. Process each floor row ────────────────────────────────────────────
    for (const row of allRows) {
      const { roomNo } = row;
      try {
        // Verify room exists in ROOM_MASTER or DB
        if (!masterRoomSet.has(roomNo)) {
          const dbRoom = await prisma.room.findUnique({ where: { roomNo } });
          if (!dbRoom) {
            logger.warn({ type: 'billing_import_room_missing', roomNo });
            skipped++;
            continue;
          }
        }

        // Determine effective rule
        const effectiveRuleCode =
          row.ruleOverrideCode ??
          rooms.find((r) => r.roomNo === roomNo)?.defaultRuleCode ??
          '';

        const ruleData = rulesMap.get(effectiveRuleCode);
        if (!ruleData) {
          errorLog.push({ roomNo, error: `Rule '${effectiveRuleCode}' not found` });
          errors++;
          continue;
        }

        // Compute billing using BillingCalculator (ignores Excel-computed columns)
        const computed = computeRoomBilling(
          {
            rentAmount: row.rentAmount,
            waterMode: row.waterMode,
            waterPrev: row.waterPrev,
            waterCurr: row.waterCurr,
            waterUnitsManual: row.waterUnitsManual,
            waterServiceFeeManual: row.waterServiceFeeManual,
            electricMode: row.electricMode,
            electricPrev: row.electricPrev,
            electricCurr: row.electricCurr,
            electricUnitsManual: row.electricUnitsManual,
            electricServiceFeeManual: row.electricServiceFeeManual,
            furnitureFee: row.furnitureFee,
            otherFee: row.otherFee,
          },
          ruleData
        );

        const checkNotes = computeCheckNotes(
          {
            waterMode: row.waterMode,
            waterPrev: row.waterPrev,
            waterCurr: row.waterCurr,
            waterUnitsManual: row.waterUnitsManual,
            electricMode: row.electricMode,
            electricPrev: row.electricPrev,
            electricCurr: row.electricCurr,
            electricUnitsManual: row.electricUnitsManual,
          },
          computed
        );

        // Get effective account ID
        const masterRoom = rooms.find((r) => r.roomNo === roomNo);
        const effectiveAccountId =
          row.recvAccountOverrideId ??
          masterRoom?.defaultAccountId ??
          '';

        // Upsert RoomBilling — create if not exists, update if DRAFT
        const existing = await prisma.roomBilling.findUnique({
          where: { billingPeriodId_roomNo: { billingPeriodId: period!.id, roomNo } },
        });

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
          waterMode: row.waterMode,
          waterPrev: row.waterPrev ?? undefined,
          waterCurr: row.waterCurr ?? undefined,
          waterUnitsManual: row.waterUnitsManual ?? undefined,
          waterUnits: computed.waterUnits,
          waterUsageCharge: computed.waterUsageCharge,
          waterServiceFeeManual: row.waterServiceFeeManual ?? undefined,
          waterServiceFee: computed.waterServiceFee,
          waterTotal: computed.waterTotal,
          electricMode: row.electricMode,
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
        errorLog: errorLog.length > 0 ? (errorLog as unknown as import('@prisma/client').Prisma.InputJsonValue) : undefined,
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

let billingServiceInstance: BillingService | null = null;

export function getBillingService(eventBus?: EventBus): BillingService {
  if (!billingServiceInstance) {
    billingServiceInstance = new BillingService(eventBus);
  }
  return billingServiceInstance;
}

export function createBillingService(eventBus?: EventBus): BillingService {
  return new BillingService(eventBus);
}
