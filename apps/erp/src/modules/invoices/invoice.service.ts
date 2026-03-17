import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { EventBus, EventTypes } from '@/lib/events';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { Json } from '@/types/prisma-json';
import {
  GenerateInvoiceInput,
  SendInvoiceInput,
  PayInvoiceInput,
  ListInvoicesQuery,
  InvoiceResponse,
  InvoicesListResponse,
  InvoiceItemSnapshot,
  InvoiceSentPayload,
  InvoiceViewedPayload,
  InvoicePaidPayload,
  InvoiceOverduePayload,
} from './types';
import type { InvoiceStatus } from './types';
import {
  NotFoundError,
  BadRequestError,
} from '@/lib/utils/errors';

// ============================================================================
// Invoice Service
//
// Domain boundary (see src/lib/domain-boundaries.ts for full reference):
//
//   Invoice  = financial delivery/lifecycle entity tied 1:1 to a BillingRecord.
//              Lifecycle: DRAFT → GENERATED → SENT → VIEWED → PAID | OVERDUE
//
//   This service manages ONLY the Invoice lifecycle and its delivery records.
//   It does NOT manage GeneratedDocument (template rendering engine) or
//   BillingRecord/BillingCycle (upstream billing truth).
//
//   Single send command: markInvoiceSent() — all UI surfaces must call this
//   via POST /api/invoices/[id]/send; do not duplicate send logic elsewhere.
// ============================================================================

export class InvoiceService {
  private eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || EventBus.getInstance();
  }

  async generateInvoiceFromBilling(billingId: string): Promise<InvoiceResponse> {
    const billingRecord = await prisma.billingRecord.findUnique({
      where: { id: billingId },
      include: {
        room: { include: { floor: true } },
        items: { include: { itemType: true } },
      },
    });
    if (!billingRecord) {
      throw new NotFoundError('BillingRecord', billingId);
    }
    if (billingRecord.status !== 'LOCKED') {
      throw new BadRequestError('Can only generate invoice from LOCKED billing record');
    }
    const existing = await prisma.invoice.findFirst({
      where: { billingRecordId: billingId },
      orderBy: { version: 'desc' },
    });
    if (existing) {
      throw new BadRequestError('Invoice already exists. Confirm to regenerate');
    }
    return this.generateInvoice({ billingRecordId: billingId });
  }

  /**
   * Generate invoice from locked billing record
   */
  async generateInvoice(
    input: GenerateInvoiceInput,
    generatedBy?: string
  ): Promise<InvoiceResponse> {
    logger.info({ type: 'invoice_generate', billingRecordId: input.billingRecordId });

    // Get billing record
    const billingRecord = await prisma.billingRecord.findUnique({
      where: { id: input.billingRecordId },
      include: {
        room: {
          include: { floor: true },
        },
        items: {
          include: { itemType: true },
        },
      },
    });

    if (!billingRecord) {
      throw new NotFoundError('BillingRecord', input.billingRecordId);
    }

    // Business rule: Must be LOCKED
    if (billingRecord.status !== 'LOCKED') {
      throw new BadRequestError('Can only generate invoice from LOCKED billing record');
    }

    // Check if invoice already exists for this billing
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        billingRecordId: input.billingRecordId,
      },
      orderBy: { version: 'desc' },
    });

    const newVersion = existingInvoice ? existingInvoice.version + 1 : 1;

    // Calculate due date
    const dueDate = new Date(billingRecord.year, billingRecord.month - 1, billingRecord.dueDay);
    if (dueDate < new Date()) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    // Create snapshot of items
    const itemsSnapshot: InvoiceItemSnapshot[] = billingRecord.items.map((item) => ({
      typeCode: item.itemType.code,
      typeName: item.itemType.name,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.amount),
    }));

    // Create invoice, first version, update billing status, and outbox atomically
    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          id: uuidv4(),
          roomId: billingRecord.roomId,
          billingRecordId: billingRecord.id,
          year: billingRecord.year,
          month: billingRecord.month,
          version: newVersion,
          status: 'GENERATED',
          subtotal: billingRecord.subtotal,
          total: billingRecord.subtotal,
          dueDate,
          issuedAt: new Date(),
        },
        include: {
          room: true,
        },
      });
      await tx.invoiceVersion.create({
        data: {
          id: uuidv4(),
          invoiceId: inv.id,
          version: newVersion,
          billingRecordId: billingRecord.id,
          subtotal: billingRecord.subtotal,
          total: billingRecord.subtotal,
          changeNote: newVersion === 1 ? 'Initial invoice' : `Re-generated (v${newVersion})`,
        },
      });
      await tx.billingRecord.update({
        where: { id: billingRecord.id },
        data: { status: 'INVOICED' },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Invoice',
          aggregateId: inv.id,
          eventType: EventTypes.INVOICE_GENERATED,
          payload: {
            invoiceId: inv.id,
            roomId: inv.roomId,
            roomNumber: billingRecord.room.roomNumber,
            billingRecordId: billingRecord.id,
            year: inv.year,
            month: inv.month,
            version: inv.version,
            totalAmount: Number(inv.total),
            dueDate: dueDate.toISOString().split('T')[0],
            generatedBy,
          } as unknown as Json,
          retryCount: 0,
        },
      });
      return inv;
    });

    const response = this.formatInvoiceResponse(invoice, itemsSnapshot);

    const action: 'INVOICE_GENERATED' | 'INVOICE_REGENERATED' = existingInvoice ? 'INVOICE_REGENERATED' : 'INVOICE_GENERATED';
    await logAudit({
      actorId: generatedBy || 'system',
      actorRole: 'ADMIN',
      action,
      entityType: 'INVOICE',
      entityId: invoice.id,
      metadata: {
        billingRecordId: billingRecord.id,
        version: invoice.version,
      },
    });

    return response;
  }

  /**
   * Get invoice by ID
   */
  async getInvoiceById(id: string): Promise<InvoiceResponse> {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        room: {
          include: {
            roomTenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
        versions: {
          orderBy: { version: 'desc' },
        },
        deliveries: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }

    // Get billing items for snapshot
    const billingItems = await prisma.billingItem.findMany({
      where: { billingRecordId: invoice.billingRecordId },
      include: { itemType: true },
    });

    const items: InvoiceItemSnapshot[] = billingItems.map((item) => ({
      typeCode: item.itemType.code,
      typeName: item.itemType.name,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.amount),
    }));

    return this.formatInvoiceResponse(invoice, items);
  }

  async getInvoicePreview(id: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        room: {
          include: {
            floor: { include: { building: true } },
            roomTenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
            },
          },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }
    const billingItems = await prisma.billingItem.findMany({
      where: { billingRecordId: invoice.billingRecordId },
      include: { itemType: true },
    });
    const items: InvoiceItemSnapshot[] = billingItems.map((item) => ({
      typeCode: item.itemType.code,
      typeName: item.itemType.name,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.amount),
    }));
    type RoomWithRelations = {
      roomNumber: string;
      floor?: { building?: { name?: string } } | null;
      roomTenants?: Array<{ tenant?: { firstName?: string; lastName?: string } | null }>;
    };
    const room = invoice.room as unknown as RoomWithRelations | undefined;
    const buildingName = room?.floor?.building?.name || '';
    const roomNumber = room?.roomNumber || '';
    const primaryTenant = room?.roomTenants?.[0]?.tenant;
    const tenantName = primaryTenant ? `${primaryTenant.firstName ?? ''} ${primaryTenant.lastName ?? ''}`.trim() || null : null;
    const dueDateStr = invoice.dueDate.toISOString().split('T')[0];
    return {
      invoiceId: invoice.id,
      version: invoice.version,
      year: invoice.year,
      month: invoice.month,
      buildingName,
      roomNumber,
      tenantName,
      items,
      subtotal: Number(invoice.subtotal),
      totalAmount: Number(invoice.total),
      dueDate: dueDateStr,
    };
  }

  /**
   * Get invoice by room/year/month
   */
  async getInvoice(
    roomId: string,
    year: number,
    month: number
  ): Promise<InvoiceResponse | null> {
    const invoice = await prisma.invoice.findFirst({
      where: { roomId, year, month },
      include: {
        room: {
          include: {
            roomTenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
        versions: { orderBy: { version: 'desc' } },
        deliveries: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!invoice) return null;

    const billingItems = await prisma.billingItem.findMany({
      where: { billingRecordId: invoice.billingRecordId },
      include: { itemType: true },
    });

    const items: InvoiceItemSnapshot[] = billingItems.map((item) => ({
      typeCode: item.itemType.code,
      typeName: item.itemType.name,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.amount),
    }));

    return this.formatInvoiceResponse(invoice, items);
  }

  /**
   * List invoices
   */
  async listInvoices(query: ListInvoicesQuery): Promise<InvoicesListResponse> {
    const { roomId, billingCycleId, year, month, status, page, pageSize, sortBy, sortOrder } = query;

    const where: Record<string, unknown> = {};

    if (roomId) where.roomId = roomId;
    if (billingCycleId) where.billingRecord = { is: { billingCycleId } };
    if (year) where.year = year;
    if (month) where.month = month;
    if (status) where.status = status;

    const total = await prisma.invoice.count({ where });

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        room: {
          include: {
            roomTenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        deliveries: { orderBy: { createdAt: 'desc' } },
        // Fetch billingCycleId so callers can deep-link to the billing cycle
        billingRecord: { select: { billingCycleId: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: await Promise.all(
        invoices.map(async (inv) => {
          const billingItems = await prisma.billingItem.findMany({
            where: { billingRecordId: inv.billingRecordId },
            include: { itemType: true },
          });
          const items: InvoiceItemSnapshot[] = billingItems.map((item) => ({
            typeCode: item.itemType.code,
            typeName: item.itemType.name,
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            total: Number(item.amount),
          }));
          const formatted = this.formatInvoiceResponse(inv, items);
          // Attach billingCycleId from the joined billingRecord (additive field)
          formatted.billingCycleId = inv.billingRecord?.billingCycleId ?? null;
          return formatted;
        })
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Mark invoice as sent
   */
  async markInvoiceSent(
    id: string,
    input: SendInvoiceInput,
    sentBy?: string
  ): Promise<InvoiceResponse> {
    logger.info({ type: 'invoice_send', invoiceId: id });

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        room: {
          include: {
            roomTenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }

    if (invoice.status === 'SENT' || invoice.status === 'PAID') {
      throw new BadRequestError(`Invoice is already ${invoice.status.toLowerCase()}`);
    }

    const primaryTenant = invoice.room?.roomTenants?.[0]?.tenant;
    const lineUserId = primaryTenant?.lineUserId;

    const updated = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          sentBy,
        },
      include: {
          room: {
            include: {
              roomTenants: {
                where: { role: 'PRIMARY', moveOutDate: null },
                include: { tenant: true },
                take: 1,
              },
            },
          },
          versions: { orderBy: { version: 'desc' }, take: 1 },
          deliveries: { orderBy: { createdAt: 'desc' } },
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Invoice',
          aggregateId: inv.id,
          eventType: EventTypes.INVOICE_SENT,
          payload: {
            invoiceId: inv.id,
            tenantId: primaryTenant?.id || '',
            lineUserId: lineUserId || '',
            sentBy: sentBy || 'system',
            sentByName: sentBy || 'system',
            sentAt: new Date().toISOString(),
          } as unknown as Json,
          retryCount: 0,
        },
      });
      return inv;
    });

    // Publish event
    const payload: InvoiceSentPayload = {
      invoiceId: invoice.id,
      tenantId: primaryTenant?.id || '',
      lineUserId: lineUserId || null,
      sentBy: sentBy || 'system',
      lineMessageId: undefined,
      sentAt: new Date().toISOString(),
    };

    await this.eventBus.publish(
      EventTypes.INVOICE_SENT,
      'Invoice',
      invoice.id,
      payload as unknown as Record<string, unknown>,
      { userId: sentBy }
    );

    const billingItems = await prisma.billingItem.findMany({
      where: { billingRecordId: invoice.billingRecordId },
      include: { itemType: true },
    });
    const items: InvoiceItemSnapshot[] = billingItems.map((item) => ({
      typeCode: item.itemType.code,
      typeName: item.itemType.name,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.amount),
    }));

    return this.formatInvoiceResponse(updated, items);
  }

  /**
   * Mark invoice as viewed
   */
  async markInvoiceViewed(id: string, tenantId?: string): Promise<InvoiceResponse> {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }

    if (invoice.viewedAt) {
      return this.getInvoiceById(id);
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'VIEWED',
        viewedAt: new Date(),
      },
      include: {
        room: {
          include: {
            roomTenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        deliveries: { orderBy: { createdAt: 'desc' } },
      },
    });

    const payload: InvoiceViewedPayload = {
      invoiceId: invoice.id,
      tenantId: tenantId || '',
      viewedAt: new Date().toISOString(),
    };

    await this.eventBus.publish(
      EventTypes.INVOICE_VIEWED,
      'Invoice',
      invoice.id,
      payload as unknown as Record<string, unknown>
    );

    const billingItems = await prisma.billingItem.findMany({
      where: { billingRecordId: invoice.billingRecordId },
      include: { itemType: true },
    });
    const items: InvoiceItemSnapshot[] = billingItems.map((item) => ({
      typeCode: item.itemType.code,
      typeName: item.itemType.name,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.amount),
    }));

    return this.formatInvoiceResponse(updated, items);
  }

  /**
   * Mark invoice as paid
   */
  async markInvoicePaid(
    id: string,
    input: PayInvoiceInput,
    confirmedBy?: string
  ): Promise<InvoiceResponse> {
    logger.info({ type: 'invoice_pay', invoiceId: id });

    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestError('Invoice is already paid');
    }

    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt,
      },
      include: {
        room: {
          include: {
            roomTenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        deliveries: { orderBy: { createdAt: 'desc' } },
      },
    });

    // Publish event
    const payload: InvoicePaidPayload = {
      invoiceId: invoice.id,
      paymentId: input.paymentId || null,
      paidAt: paidAt.toISOString(),
      amount: Number(invoice.total),
    };

    await this.eventBus.publish(
      EventTypes.INVOICE_PAID,
      'Invoice',
      invoice.id,
      payload as unknown as Record<string, unknown>,
      { userId: confirmedBy }
    );

    const billingItems = await prisma.billingItem.findMany({
      where: { billingRecordId: invoice.billingRecordId },
      include: { itemType: true },
    });
    const items: InvoiceItemSnapshot[] = billingItems.map((item) => ({
      typeCode: item.itemType.code,
      typeName: item.itemType.name,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.amount),
    }));

    return this.formatInvoiceResponse(updated, items);
  }

  /**
   * Check for overdue invoices
   */
  async checkOverdueInvoices(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['SENT', 'VIEWED'] },
        dueDate: { lt: today },
      },
      include: { room: true },
    });

    for (const invoice of overdueInvoices) {
      const daysOverdue = Math.floor(
        (today.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      await prisma.invoice.update({
        where: { id: invoice.id },
      data: { status: 'OVERDUE' },
      });

      const payload: InvoiceOverduePayload = {
        invoiceId: invoice.id,
        roomId: invoice.roomId,
        roomNumber: invoice.room?.roomNumber || '',
        daysOverdue,
        totalAmount: Number(invoice.total),
      };

      await this.eventBus.publish(
        EventTypes.INVOICE_MARKED_OVERDUE,
        'Invoice',
        invoice.id,
        payload as unknown as Record<string, unknown>
      );
    }

    logger.info({ type: 'overdue_check', count: overdueInvoices.length });
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private formatInvoiceResponse(
    invoice: {
      id: string;
      roomId: string;
      billingRecordId: string;
      year: number;
      month: number;
      version: number;
      status: string;
      subtotal: unknown;
      total: unknown;
      dueDate: Date;
      issuedAt?: Date | null;
      sentAt?: Date | null;
      sentBy?: string | null;
      viewedAt?: Date | null;
      paidAt?: Date | null;
      createdAt: Date;
      updatedAt: Date;
      room?: {
        id: string;
        roomNumber: string;
        floorId: string;
        roomTenants?: Array<{
          tenant?: {
            id?: string | null;
            firstName?: string | null;
            lastName?: string | null;
            phone?: string | null;
            lineUserId?: string | null;
          } | null;
        }>;
      };
      versions?: Array<{
        id: string;
        invoiceId: string;
        version: number;
        subtotal: unknown;
        total: unknown;
        changeNote: string | null;
        createdAt: Date;
      }>;
      deliveries?: Array<{
        id: string;
        channel: string;
        status: string;
        recipientRef: string | null;
        sentAt: Date | null;
        viewedAt: Date | null;
        errorMessage: string | null;
        createdAt: Date;
      }>;
    },
    items: InvoiceItemSnapshot[]
  ): InvoiceResponse {
    const primaryTenant = invoice.room?.roomTenants?.[0]?.tenant;
    const tenantName = primaryTenant
      ? `${primaryTenant.firstName ?? ''} ${primaryTenant.lastName ?? ''}`.trim() || null
      : null;
    const invoiceNumber = `INV-${invoice.year}${String(invoice.month).padStart(2, '0')}-${invoice.room?.roomNumber ?? invoice.roomId.slice(0, 6)}-V${invoice.version}`;

    return {
      id: invoice.id,
      invoiceNumber,
      roomId: invoice.roomId,
      billingRecordId: invoice.billingRecordId,
      year: invoice.year,
      month: invoice.month,
      version: invoice.version,
      status: invoice.status as InvoiceStatus,
      subtotal: Number(invoice.subtotal),
      totalAmount: Number(invoice.total),
      dueDate: invoice.dueDate,
      issuedAt: invoice.issuedAt ?? null,
      sentAt: invoice.sentAt,
      sentBy: invoice.sentBy,
      viewedAt: invoice.viewedAt,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      room: invoice.room
        ? {
            id: invoice.room.id,
            roomNumber: invoice.room.roomNumber,
            floorId: invoice.room.floorId,
          }
        : undefined,
      tenant: primaryTenant?.id
        ? {
            id: primaryTenant.id,
            fullName: tenantName ?? 'Unknown tenant',
            phone: primaryTenant.phone ?? '-',
          }
        : null,
      tenantName,
      lineUserId: primaryTenant?.lineUserId ?? null,
      deliveries: (invoice.deliveries ?? []).map((delivery) => ({
        id: delivery.id,
        channel: delivery.channel,
        status: delivery.status,
        recipientRef: delivery.recipientRef,
        sentAt: delivery.sentAt,
        viewedAt: delivery.viewedAt,
        errorMessage: delivery.errorMessage,
        createdAt: delivery.createdAt,
      })),
      items,
      versions: (invoice.versions ?? []).map((v) => ({
        id: v.id,
        invoiceId: v.invoiceId,
        version: v.version,
        subtotal: Number(v.subtotal),
        totalAmount: Number(v.total),
        changeNote: v.changeNote,
        createdAt: v.createdAt,
      })),
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let invoiceServiceInstance: InvoiceService | null = null;

export function getInvoiceService(eventBus?: EventBus): InvoiceService {
  if (!invoiceServiceInstance) {
    invoiceServiceInstance = new InvoiceService(eventBus);
  }
  return invoiceServiceInstance;
}

export function createInvoiceService(eventBus?: EventBus): InvoiceService {
  return new InvoiceService(eventBus);
}
