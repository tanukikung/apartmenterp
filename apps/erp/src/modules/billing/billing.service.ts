import { v4 as uuidv4 } from 'uuid';
import { prisma, EventBus, logger, EventTypes } from '@/lib';
import { Json } from '@/types/prisma-json';
import {
  CreateBillingRecordInput,
  BillingImportRow,
  AddBillingItemInput,
  UpdateBillingItemInput,
  LockBillingInput,
  ListBillingRecordsQuery,
  BillingRecordResponse,
  BillingRecordsListResponse,
  BillingItemResponse,
  BillingRecordCreatedPayload,
  BillingItemAddedPayload,
  BillingItemUpdatedPayload,
  BillingItemRemovedPayload,
  BillingLockedPayload,
  InvoiceGenerationRequestedPayload,
  billingRecordCreatedPayloadSchema,
  billingItemAddedPayloadSchema,
  billingItemRemovedPayloadSchema,
  billingItemUpdatedPayloadSchema,
  billingLockedPayloadSchema,
  invoiceGenerationRequestedPayloadSchema,
} from './types';
import type { BillingStatus } from './types';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '@/lib/utils/errors';

function isBillingRecordForPayload(
  obj: unknown
): obj is {
  id: string;
  roomId: string;
  room?: { roomNumber?: string } | null;
  year: number;
  month: number;
} {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as { id: unknown }).id === 'string' &&
    'roomId' in obj &&
    typeof (obj as { roomId: unknown }).roomId === 'string' &&
    'year' in obj &&
    typeof (obj as { year: unknown }).year === 'number' &&
    'month' in obj &&
    typeof (obj as { month: unknown }).month === 'number'
  );
}

type BillingItemTypeMinimal = {
  id: string;
  description: string | null;
  isRecurring: boolean;
};
function isBillingItemType(obj: unknown): obj is BillingItemTypeMinimal {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as { id: unknown }).id === 'string' &&
    'description' in obj &&
    (typeof (obj as { description: unknown }).description === 'string' ||
      (obj as { description: unknown }).description === null) &&
    'isRecurring' in obj &&
    typeof (obj as { isRecurring: unknown }).isRecurring === 'boolean'
  );
}

// ============================================================================
// Billing Service
// ============================================================================

export class BillingService {
  private eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || EventBus.getInstance();
  }

  /**
   * Create a new billing record for a room/month
   */
  async createBillingRecord(
    input: CreateBillingRecordInput,
    createdBy?: string
  ): Promise<BillingRecordResponse> {
    logger.info({ type: 'billing_create', roomId: input.roomId, year: input.year, month: input.month });

    // Check if room exists
    const room = await prisma.room.findUnique({
      where: { id: input.roomId },
      include: { floor: true },
    });

    if (!room) {
      throw new NotFoundError('Room', input.roomId);
    }

    // Business rule: Only one billing record per room/month
    const existing = await prisma.billingRecord.findUnique({
      where: {
        roomId_year_month: {
          roomId: input.roomId,
          year: input.year,
          month: input.month,
        },
      },
    });

    if (existing) {
      throw new ConflictError(
        `Billing record for ${input.year}-${input.month} already exists for this room`
      );
    }

    // Get active contract for the room to get rent amount
    const contract = await prisma.contract.findFirst({
      where: {
        roomId: input.roomId,
        status: 'ACTIVE',
      },
    });

    // Get billing day, due day, overdue day from config
    const config = await this.getBillingConfig();

    // Create billing record
    const billingRecord = await prisma.billingRecord.create({
      data: {
        id: uuidv4(),
        roomId: input.roomId,
        year: input.year,
        month: input.month,
        billingDay: config.billingDay,
        dueDay: config.dueDay,
        overdueDay: config.overdueDay,
        status: 'DRAFT',
        subtotal: 0,
      },
      include: {
        room: true,
        items: {
          include: { itemType: true },
        },
      },
    });

    // Auto-add rent item if contract exists
    if (contract) {
      const rentType = await prisma.billingItemType.findUnique({
        where: { code: 'RENT' },
      });

      if (rentType) {
        await prisma.billingItem.create({
          data: {
            id: uuidv4(),
            billingRecordId: billingRecord.id,
            itemTypeId: rentType.id,
            quantity: 1,
            unitPrice: Number(contract.monthlyRent),
            amount: Number(contract.monthlyRent),
            isEditable: false,
          },
        });
      }
    }

    await this.recalculateTotal(billingRecord.id);
    const updatedRecord = await prisma.billingRecord.findUnique({
      where: { id: billingRecord.id },
      include: {
        room: true,
        items: {
          include: { itemType: true },
        },
        invoices: {
          take: 1,
          orderBy: { version: 'desc' },
        },
      },
    });

    if (!isBillingRecordForPayload(updatedRecord)) {
      throw new NotFoundError('BillingRecord', billingRecord.id);
    }

    // Publish event
    const payload: BillingRecordCreatedPayload = billingRecordCreatedPayloadSchema.parse({
      billingRecordId: updatedRecord.id,
      roomId: updatedRecord.roomId,
      roomNumber: updatedRecord.room?.roomNumber || '',
      year: updatedRecord.year,
      month: updatedRecord.month,
      createdBy,
    });

    await this.eventBus.publish(
      EventTypes.BILLING_RECORD_CREATED,
      'BillingRecord',
      updatedRecord!.id,
      payload as unknown as Record<string, unknown>,
      { userId: createdBy }
    );

    return this.formatBillingRecordResponse(updatedRecord);
  }

  /**
   * Import billing rows in batch with transaction per room-month
   */
  async importBillingRows(
    rows: BillingImportRow[],
    importedBy?: string
  ): Promise<{ created: Array<{ roomNumber: string; year: number; month: number; billingRecordId: string }> }> {
    const grouped = new Map<string, BillingImportRow[]>();
    for (const r of rows) {
      const key = `${r.roomNumber}:${r.year}:${r.month}`;
      const arr = grouped.get(key) || [];
      arr.push(r);
      grouped.set(key, arr);
    }

    const typeCodes = Array.from(new Set(rows.map((r) => r.typeCode)));
    const itemTypes = await prisma.billingItemType.findMany({
      where: { code: { in: typeCodes } },
    });
    const typeMap = new Map(itemTypes.map((t) => [t.code, t]));

    const config = await this.getBillingConfig();

    const results: Array<{ roomNumber: string; year: number; month: number; billingRecordId: string }> = [];

    const entries = Array.from(grouped.entries());
    for (const [key, groupRows] of entries) {
      const [roomNumber, y, m] = key.split(':');
      const year = Number(y);
      const month = Number(m);

      const room = await prisma.room.findFirst({ where: { roomNumber } });
      if (!room) {
        throw new NotFoundError('Room', roomNumber);
      }

      const existing = await prisma.billingRecord.findUnique({
        where: { roomId_year_month: { roomId: room.id, year, month } },
      });
      if (existing) {
        throw new ConflictError(`Billing record already exists for ${roomNumber} ${year}-${month}`);
      }

      const createdId = await prisma.$transaction(async (tx) => {
        const rec = await tx.billingRecord.create({
          data: {
            id: uuidv4(),
            roomId: room.id,
            year,
            month,
            billingDay: config.billingDay,
            dueDay: config.dueDay,
            overdueDay: config.overdueDay,
            status: 'DRAFT',
            subtotal: 0,
          },
          include: { room: true },
        });

        let subtotal = 0;
        for (const r of groupRows) {
          const t = typeMap.get(r.typeCode);
          if (!t) {
            throw new NotFoundError('BillingItemType', r.typeCode);
          }
          if (!isBillingItemType(t)) {
            throw new BadRequestError('Invalid billing item type');
          }
          const amount = r.quantity * r.unitPrice;
          await tx.billingItem.create({
            data: {
              id: uuidv4(),
              billingRecordId: rec.id,
              itemTypeId: t.id,
              description: r.description || t.description,
              quantity: r.quantity,
              unitPrice: r.unitPrice,
              amount,
              isEditable: !t.isRecurring || r.typeCode === 'OTHER',
            },
          });
          subtotal += amount;
        }

        await tx.billingRecord.update({
          where: { id: rec.id },
          data: { subtotal },
        });

        const validatedPayload = billingRecordCreatedPayloadSchema.parse({
          billingRecordId: rec.id,
          roomId: rec.roomId,
          roomNumber: rec.room?.roomNumber || '',
          year: rec.year,
          month: rec.month,
          createdBy: importedBy,
        });
        await tx.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: 'BillingRecord',
            aggregateId: rec.id,
            eventType: EventTypes.BILLING_RECORD_CREATED,
            payload: validatedPayload as unknown as Json,
            retryCount: 0,
          },
        });

        return rec.id;
      });

      results.push({ roomNumber, year, month, billingRecordId: createdId });
    }

    return { created: results };
  }

  /**
   * Import billing rows with cycle and batch tracking
   */
  async importBillingRowsWithBatch(
    rows: BillingImportRow[],
    batchId: string,
    billingCycleId: string,
    importedBy?: string
  ): Promise<{ created: Array<{ roomNumber: string; year: number; month: number; billingRecordId: string }> }> {
    const grouped = new Map<string, BillingImportRow[]>();
    for (const r of rows) {
      const key = `${r.roomNumber}:${r.year}:${r.month}`;
      const arr = grouped.get(key) || [];
      arr.push(r);
      grouped.set(key, arr);
    }

    const typeCodes = Array.from(new Set(rows.map((r) => r.typeCode)));
    const itemTypes = await prisma.billingItemType.findMany({
      where: { code: { in: typeCodes } },
    });
    const typeMap = new Map(itemTypes.map((t) => [t.code, t]));
    const config = await this.getBillingConfig();
    const results: Array<{ roomNumber: string; year: number; month: number; billingRecordId: string }> = [];

    const entries = Array.from(grouped.entries());
    for (const [key, groupRows] of entries) {
      const [roomNumber, y, m] = key.split(':');
      const year = Number(y);
      const month = Number(m);

      const room = await prisma.room.findFirst({
        where: { roomNumber },
        include: { floor: true },
      });
      if (!room) continue; // skip unmatched rooms (already staged as ERROR)

      const contract = await prisma.contract.findFirst({
        where: { roomId: room.id, status: 'ACTIVE' },
      });

      const existing = await prisma.billingRecord.findUnique({
        where: { roomId_year_month: { roomId: room.id, year, month } },
      });
      if (existing) continue; // skip already-imported

      const createdId = await prisma.$transaction(async (tx) => {
        const rec = await tx.billingRecord.create({
          data: {
            id: uuidv4(),
            roomId: room.id,
            year,
            month,
            billingDay: config.billingDay,
            dueDay: config.dueDay,
            overdueDay: config.overdueDay,
            status: 'DRAFT',
            subtotal: 0,
            billingCycleId,
            contractId: contract?.id ?? null,
            importBatchId: batchId,
            roomStatusSnapshot: room.status,
            tenantSnapshotJson: contract ? { contractId: contract.id, monthlyRent: Number(contract.monthlyRent) } : null,
          },
          include: { room: true },
        });

        let subtotal = 0;
        let sortOrder = 1;
        for (const r of groupRows) {
          const t = typeMap.get(r.typeCode);
          if (!t) continue;
          if (!isBillingItemType(t)) continue;
          const amount = r.quantity * r.unitPrice;
          await tx.billingItem.create({
            data: {
              id: uuidv4(),
              billingRecordId: rec.id,
              itemTypeId: t.id,
              description: r.description || t.description,
              quantity: r.quantity,
              unitPrice: r.unitPrice,
              amount,
              isEditable: !t.isRecurring || r.typeCode === 'OTHER',
              code: r.typeCode,
              sortOrder: sortOrder++,
              sourceType: 'IMPORT',
              sourceRef: batchId,
            },
          });
          subtotal += amount;
        }

        await tx.billingRecord.update({
          where: { id: rec.id },
          data: { subtotal, total: subtotal },
        });

        const validatedPayload = billingRecordCreatedPayloadSchema.parse({
          billingRecordId: rec.id,
          roomId: rec.roomId,
          roomNumber: rec.room?.roomNumber || '',
          year: rec.year,
          month: rec.month,
          createdBy: importedBy,
        });
        await tx.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: 'BillingRecord',
            aggregateId: rec.id,
            eventType: EventTypes.BILLING_RECORD_CREATED,
            payload: validatedPayload as unknown as Json,
            retryCount: 0,
          },
        });

        // Link import row to billing record
        await tx.billingImportRow.updateMany({
          where: { batchId, matchedRoomId: room.id, validationStatus: 'VALID' },
          data: { importedBillingRecordId: rec.id },
        });

        return rec.id;
      });

      results.push({ roomNumber, year, month, billingRecordId: createdId });
    }

    return { created: results };
  }

  /**
   * Recalculate billing total
   */
  private async recalculateTotal(billingRecordId: string): Promise<void> {
    const result = await prisma.billingItem.aggregate({
      where: { billingRecordId },
      _sum: { amount: true },
    });

    await prisma.billingRecord.update({
      where: { id: billingRecordId },
      data: { subtotal: result._sum.amount || 0 },
    });
  }

  /**
   * Add billing item to a record
   */
  async addBillingItem(
    billingRecordId: string,
    input: AddBillingItemInput,
    addedBy?: string
  ): Promise<BillingItemResponse> {
    // Check if billing record exists
    const billingRecord = await prisma.billingRecord.findUnique({
      where: { id: billingRecordId },
      include: { items: { include: { itemType: true } } },
    });

    if (!billingRecord) {
      throw new NotFoundError('BillingRecord', billingRecordId);
    }

    // Business rule: Cannot modify LOCKED billing
    if (billingRecord.status === 'LOCKED') {
      throw new BadRequestError('Cannot modify locked billing record');
    }

    // Get billing item type
    const itemType = await prisma.billingItemType.findUnique({
      where: { code: input.typeCode },
    });

    if (!itemType) {
      throw new NotFoundError('BillingItemType', input.typeCode);
    }

    // Check if recurring item already exists (only one allowed per type)
    const existingItem = billingRecord.items.find(
      (item) => item.itemType.code === input.typeCode && itemType.isRecurring
    );

    if (existingItem && itemType.isRecurring) {
      throw new ConflictError(`Recurring item ${input.typeCode} already exists in this billing record`);
    }

    // Calculate amount
    const quantity = Number(input.quantity ?? 1);
    const unitPrice = Number(input.unitPrice ?? itemType.defaultAmount ?? 0);
    const total = quantity * unitPrice;

    // Create billing item
    const item = await prisma.billingItem.create({
      data: {
        id: uuidv4(),
        billingRecordId,
        itemTypeId: itemType.id,
        description: input.description || itemType.description,
        quantity,
        unitPrice,
        amount: total,
        isEditable: !itemType.isRecurring || input.typeCode === 'OTHER',
      },
      include: { itemType: true },
    });

    // Recalculate total
    await this.recalculateTotal(billingRecordId);

    // Publish event
    const payload: BillingItemAddedPayload = billingItemAddedPayloadSchema.parse({
      billingRecordId,
      itemId: item.id,
      typeCode: itemType.code,
      typeName: itemType.name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.amount),
      addedBy,
    });

    await this.eventBus.publish(
      EventTypes.BILLING_ITEM_ADDED,
      'BillingRecord',
      billingRecordId,
      payload as unknown as Record<string, unknown>,
      { userId: addedBy }
    );

    return this.formatBillingItemResponse(item);
  }

  /**
   * Update billing item
   */
  async updateBillingItem(
    itemId: string,
    input: UpdateBillingItemInput,
    updatedBy?: string
  ): Promise<BillingItemResponse> {
    const item = await prisma.billingItem.findUnique({
      where: { id: itemId },
      include: {
        billingRecord: true,
        itemType: true,
      },
    });

    if (!item) {
      throw new NotFoundError('BillingItem', itemId);
    }

    if (item.billingRecord.status === 'LOCKED') {
      throw new BadRequestError('Cannot modify locked billing record');
    }

    if (!item.isEditable) {
      throw new BadRequestError(`Item ${item.itemType.code} is not editable`);
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    const nextDescription =
      input.description !== undefined ? input.description : item.description;
    const nextQuantity =
      input.quantity !== undefined ? input.quantity : Number(item.quantity);
    const nextUnitPrice =
      input.unitPrice !== undefined ? input.unitPrice : Number(item.unitPrice);
    const nextAmount = nextQuantity * nextUnitPrice;

    if (input.description !== undefined && input.description !== item.description) {
      changes.description = { old: item.description, new: input.description };
    }
    if (input.quantity !== undefined && input.quantity !== Number(item.quantity)) {
      changes.quantity = { old: Number(item.quantity), new: input.quantity };
    }
    if (input.unitPrice !== undefined && input.unitPrice !== Number(item.unitPrice)) {
      changes.unitPrice = { old: Number(item.unitPrice), new: input.unitPrice };
    }
    if ((input.quantity !== undefined || input.unitPrice !== undefined) && nextAmount !== Number(item.amount)) {
      changes.amount = { old: Number(item.amount), new: nextAmount };
    }

    const updated = await prisma.billingItem.update({
      where: { id: itemId },
      data: {
        description: nextDescription,
        quantity: nextQuantity,
        unitPrice: nextUnitPrice,
        amount: nextAmount,
      },
      include: { itemType: true },
    });

    await this.recalculateTotal(item.billingRecordId);

    if (Object.keys(changes).length > 0) {
      const payload: BillingItemUpdatedPayload = billingItemUpdatedPayloadSchema.parse({
        billingRecordId: item.billingRecordId,
        itemId: item.id,
        typeCode: item.itemType.code,
        changes,
        updatedBy,
      });

      await this.eventBus.publish(
        EventTypes.BILLING_ITEM_UPDATED,
        'BillingRecord',
        item.billingRecordId,
        payload as unknown as Record<string, unknown>,
        { userId: updatedBy }
      );
    }

    return this.formatBillingItemResponse(updated);
  }

  /**
   * Remove billing item
   */
  async removeBillingItem(
    itemId: string,
    removedBy?: string
  ): Promise<void> {
    const item = await prisma.billingItem.findUnique({
      where: { id: itemId },
      include: {
        billingRecord: true,
        itemType: true,
      },
    });

    if (!item) {
      throw new NotFoundError('BillingItem', itemId);
    }

    // Business rule: Cannot modify LOCKED billing
    if (item.billingRecord.status === 'LOCKED') {
      throw new BadRequestError('Cannot modify locked billing record');
    }

    // Business rule: Cannot remove non-editable items (except OTHER type)
    if (!item.isEditable && item.itemType.code !== 'OTHER') {
      throw new BadRequestError(`Item ${item.itemType.code} cannot be removed`);
    }

    await prisma.billingItem.delete({ where: { id: itemId } });

    // Recalculate total
    await this.recalculateTotal(item.billingRecordId);

    // Publish event
    const payload: BillingItemRemovedPayload = billingItemRemovedPayloadSchema.parse({
      billingRecordId: item.billingRecordId,
      itemId: item.id,
      typeCode: item.itemType.code,
      removedBy,
    });

    await this.eventBus.publish(
      EventTypes.BILLING_ITEM_REMOVED,
      'BillingRecord',
      item.billingRecordId,
      payload as unknown as Record<string, unknown>,
      { userId: removedBy }
    );
  }

  /**
   * Lock billing record and trigger invoice generation
   */
  async lockBillingRecord(
    billingRecordId: string,
    input: LockBillingInput,
    lockedBy?: string
  ): Promise<BillingRecordResponse> {
    const billingRecord = await prisma.billingRecord.findUnique({
      where: { id: billingRecordId },
      include: {
        room: true,
        items: { include: { itemType: true } },
      },
    });

    if (!billingRecord) {
      throw new NotFoundError('BillingRecord', billingRecordId);
    }

    if (billingRecord.status === 'LOCKED' && !input.force) {
      throw new BadRequestError('Billing record is already locked');
    }

    if (billingRecord.status === 'INVOICED' && !input.force) {
      throw new BadRequestError('Billing record is already invoiced');
    }

    // Check if has items
    if (billingRecord.items.length === 0) {
      throw new BadRequestError('Cannot lock empty billing record');
    }

    // Update status
    const updated = await prisma.billingRecord.update({
      where: { id: billingRecordId },
      data: {
        status: 'LOCKED',
        lockedAt: new Date(),
        lockedBy,
      },
      include: {
        room: true,
        items: { include: { itemType: true } },
      },
    });

    // Publish BillingLocked event
    const lockedPayload: BillingLockedPayload = billingLockedPayloadSchema.parse({
      billingRecordId: updated.id,
      roomId: updated.roomId,
      roomNumber: updated.room?.roomNumber || '',
      year: updated.year,
      month: updated.month,
      totalAmount: Number(updated.subtotal),
      lockedBy,
    });

    await this.eventBus.publish(
      EventTypes.BILLING_LOCKED,
      'BillingRecord',
      updated.id,
      lockedPayload as unknown as Record<string, unknown>,
      { userId: lockedBy }
    );

    // Publish InvoiceGenerationRequested event
    const invoicePayload: InvoiceGenerationRequestedPayload = invoiceGenerationRequestedPayloadSchema.parse({
      billingRecordId: updated.id,
      roomId: updated.roomId,
      roomNumber: updated.room?.roomNumber || '',
      year: updated.year,
      month: updated.month,
      totalAmount: Number(updated.subtotal),
      requestedBy: lockedBy,
    });

    await this.eventBus.publish(
      EventTypes.INVOICE_GENERATION_REQUESTED,
      'BillingRecord',
      updated.id,
      invoicePayload as unknown as Record<string, unknown>,
      { userId: lockedBy }
    );

    return this.formatBillingRecordResponse(updated);
  }

  /**
   * List billing records with filtering
   */
  async listBillingRecords(
    query: ListBillingRecordsQuery
  ): Promise<BillingRecordsListResponse> {
    const { roomId, billingCycleId, year, month, status, page, pageSize, sortBy, sortOrder } = query;

    const where: Record<string, unknown> = {};

    if (roomId) where.roomId = roomId;
    if (billingCycleId) where.billingCycleId = billingCycleId;
    if (year) where.year = year;
    if (month) where.month = month;
    if (status) where.status = status;

    const total = await prisma.billingRecord.count({ where });

    const records = await prisma.billingRecord.findMany({
      where,
      include: {
        room: true,
        items: {
          include: { itemType: true },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: await Promise.all(records.map(async (r) => {
        const contract = await prisma.contract.findFirst({
          where: { roomId: r.roomId, status: 'ACTIVE' },
        });
        return this.formatBillingRecordResponse(r, contract);
      })),
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
    const record = await prisma.billingRecord.findUnique({
      where: { id },
      include: {
        room: true,
        items: {
          include: { itemType: true },
        },
      },
    });

    if (!record) {
      throw new NotFoundError('BillingRecord', id);
    }

    const contract = await prisma.contract.findFirst({
      where: { roomId: record.roomId, status: 'ACTIVE' },
    });

    return this.formatBillingRecordResponse(record, contract);
  }

  /**
   * Get billing config from config table
   */
  private async getBillingConfig(): Promise<{
    billingDay: number;
    dueDay: number;
    overdueDay: number;
  }> {
    const configs = await prisma.config.findMany({
      where: {
        key: { in: ['billing.billingDay', 'billing.dueDay', 'billing.overdueDay'] },
      },
    });

    const getValue = (key: string, defaultValue: number): number => {
      const config = configs.find((c) => c.key === key);
      return config ? Number(config.value) : defaultValue;
    };

    return {
      billingDay: getValue('billing.billingDay', 1),
      dueDay: getValue('billing.dueDay', 5),
      overdueDay: getValue('billing.overdueDay', 15),
    };
  }

  /**
   * Format billing record for response
   */
  private async formatBillingRecordResponse(
    record: {
      id: string;
      roomId: string;
      year: number;
      month: number;
      status: string;
      subtotal: unknown;
      lockedAt: Date | null;
      lockedBy: string | null;
      createdAt: Date;
      updatedAt: Date;
      room?: { id: string; roomNumber: string; floorId: string };
      items: Array<{
        id: string;
        billingRecordId: string;
        description: string | null;
        quantity: unknown;
        unitPrice: unknown;
        amount: unknown;
        createdAt: Date;
        updatedAt: Date;
        itemType: { code: string; name: string; description: string | null; isRecurring: boolean };
      }>;
    },
    contract?: { id: string; monthlyRent: unknown } | null
  ): Promise<BillingRecordResponse> {
    return {
      id: record.id,
      roomId: record.roomId,
      year: record.year,
      month: record.month,
      status: record.status as BillingStatus,
      subtotal: Number(record.subtotal),
      totalAmount: Number(record.subtotal),
      lockedAt: record.lockedAt,
      lockedBy: record.lockedBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      room: record.room
        ? {
            id: record.room.id,
            roomNumber: record.room.roomNumber,
            floorId: record.room.floorId,
          }
        : undefined,
      items: record.items.map((item) => this.formatBillingItemResponse(item)),
      contract: contract
        ? { id: contract.id, rentAmount: Number(contract.monthlyRent) }
        : undefined,
    };
  }

  /**
   * Format billing item for response
   */
  private formatBillingItemResponse(
    item: {
      id: string;
      billingRecordId: string;
      description: string | null;
      quantity: unknown;
      unitPrice: unknown;
      amount: unknown;
      createdAt: Date;
      updatedAt: Date;
      itemType: { code: string; name: string };
    }
  ): BillingItemResponse {
    return {
      id: item.id,
      billingRecordId: item.billingRecordId,
      typeCode: item.itemType.code,
      typeName: item.itemType.name,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.amount),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
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
