import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { EventBus, EventTypes } from '@/lib/events';
import { isLineConfigured } from '@/lib/line';
import { buildInvoiceAccessUrl } from '@/lib/invoices/access';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { INVOICE_STATUS } from '@/lib/constants';

import {
  GenerateInvoiceInput,
  SendInvoiceInput,
  ListInvoicesQuery,
  InvoiceResponse,
  InvoicesListResponse,
  InvoiceItemSnapshot,
  InvoiceSentPayload,
  InvoiceViewedPayload,
  InvoiceOverduePayload,
} from './types';
import type { InvoiceStatus } from './types';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ValidationError,
} from '@/lib/utils/errors';

// ============================================================================
// Invoice Service
//
// Aligned with new schema: Invoice.roomNo, Invoice.roomBillingId, Invoice.totalAmount
// ============================================================================

export interface InvoiceSendResult {
  queued: boolean;
  invoice: InvoiceResponse | null;
  errorMessage: string | null;
  lineConfigured: boolean;
  hasLineRecipient: boolean;
  deliveryStatus: 'PENDING' | 'FAILED';
  deliveryId: string | null;
  messageTemplateId: string | null;
  documentTemplateId: string | null;
  documentTemplateHash: string | null;
  pdfUrl: string;
}

type InvoiceResponseRecord = {
  id: string;
  roomNo: string;
  roomBillingId: string;
  year: number;
  month: number;
  status: string;
  totalAmount: unknown;
  dueDate: Date;
  issuedAt?: Date | null;
  sentAt?: Date | null;
  paidAt?: Date | null;
  note?: string | null;
  accessToken?: string | null;
  createdAt: Date;
  updatedAt: Date;
  room?: {
    roomNo: string;
    floorNo: number;
    defaultAccountId: string;
    defaultRuleCode: string;
    defaultRentAmount: unknown;
    hasFurniture: boolean;
    defaultFurnitureAmount: unknown;
    roomStatus: string;
    lineUserId?: string | null;
    tenants?: Array<{
      tenant?: {
        id?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        phone?: string | null;
        lineUserId?: string | null;
      } | null;
    }>;
  };
  roomBilling?: {
    billingPeriodId: string;
  };
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
};

type LockedInvoiceSendRow = {
  id: string;
  roomNo: string;
  roomBillingId: string;
  year: number;
  month: number;
  status: InvoiceStatus;
  totalAmount: unknown;
  dueDate: Date;
  issuedAt: Date | null;
  sentAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type LockedPrimaryRecipientRow = {
  roomTenantId: string;
  tenantId: string;
  lineUserId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
};

export class InvoiceService {
  private eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || EventBus.getInstance();
  }

  async generateInvoiceFromBilling(roomBillingId: string): Promise<InvoiceResponse> {
    // All validation (existence, LOCKED status, duplicate-invoice check) is now
    // inside generateInvoice's $transaction, which is the single authoritative
    // source — no TOCTOU window remains.
    return this.generateInvoice({ billingRecordId: roomBillingId });
  }

  /**
   * Generate invoice from locked RoomBilling
   */
  async generateInvoice(
    input: GenerateInvoiceInput,
    generatedBy?: string
  ): Promise<InvoiceResponse> {
    logger.info({ type: 'invoice_generate', roomBillingId: input.billingRecordId });

    const roomBilling = await prisma.roomBilling.findUnique({
      where: { id: input.billingRecordId },
      include: {
        billingPeriod: true,
        effectiveRule: true,
      },
    });

    if (!roomBilling) {
      throw new NotFoundError('RoomBilling', input.billingRecordId);
    }

    if (roomBilling.status !== 'LOCKED') {
      throw new BadRequestError('Can only generate invoice from LOCKED billing record');
    }

    // Check if invoice already exists for this billing
    const existingInvoice = await prisma.invoice.findUnique({
      where: { roomBillingId: input.billingRecordId },
    });

    if (existingInvoice) {
      throw new BadRequestError('Invoice already exists for this billing record');
    }

    const period = roomBilling.billingPeriod;
    const dueDate = new Date(period.year, period.month - 1, period.dueDay);
    if (dueDate < new Date()) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    // Create invoice and update billing status atomically
    const invoice = await prisma.$transaction(async (tx) => {
      const commonAreaShare = Number((roomBilling as { commonAreaWaterShare?: unknown }).commonAreaWaterShare ?? 0);
      const totalAmount = Number(roomBilling.totalDue) + commonAreaShare;

      const inv = await tx.invoice.create({
        data: {
          id: uuidv4(),
          roomNo: roomBilling.roomNo,
          roomBillingId: roomBilling.id,
          year: period.year,
          month: period.month,
          status: INVOICE_STATUS.GENERATED,
          totalAmount,
          dueDate,
          issuedAt: new Date(),
        },
      });
      await tx.roomBilling.update({
        where: { id: roomBilling.id },
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
            roomNo: inv.roomNo,
            roomBillingId: roomBilling.id,
            year: inv.year,
            month: inv.month,
            totalAmount: Number(inv.totalAmount),
            dueDate: dueDate.toISOString().split('T')[0],
            generatedBy,
          },
          retryCount: 0,
        },
      });
      return inv;
    });

    const response = this.formatInvoiceResponse(invoice);

    const action = 'INVOICE_GENERATED' as const;
    await logAudit({
      actorId: generatedBy || 'system',
      actorRole: 'ADMIN',
      action,
      entityType: 'INVOICE',
      entityId: invoice.id,
      metadata: {
        roomBillingId: roomBilling.id,
        year: period.year,
        month: period.month,
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
            tenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
        deliveries: {
          orderBy: { createdAt: 'desc' },
        },
        roomBilling: true,
      },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }

    return this.formatInvoiceResponse(invoice);
  }

  async getInvoicePreview(id: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        room: {
          include: {
            tenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
            },
          },
        },
        roomBilling: true,
      },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }
    const rb = invoice.roomBilling;
    // Build item snapshots from RoomBilling fields
    const items: InvoiceItemSnapshot[] = [];
    if (rb) {
      if (Number(rb.rentAmount) > 0) {
        items.push({ typeCode: 'RENT', typeName: 'ค่าเช่า', description: null, quantity: 1, unitPrice: Number(rb.rentAmount), total: Number(rb.rentAmount) });
      }
      if (Number(rb.waterTotal) > 0) {
        const wUnits = Number(rb.waterUnits);
        items.push({ typeCode: 'WATER', typeName: 'ค่าน้ำ', description: null, quantity: wUnits, unitPrice: wUnits > 0 ? Number(rb.waterUsageCharge) / wUnits : 0, total: Number(rb.waterTotal) });
      }
      if (Number(rb.electricTotal) > 0) {
        const eUnits = Number(rb.electricUnits);
        items.push({ typeCode: 'ELECTRIC', typeName: 'ค่าไฟ', description: null, quantity: eUnits, unitPrice: eUnits > 0 ? Number(rb.electricUsageCharge) / eUnits : 0, total: Number(rb.electricTotal) });
      }
      if (Number(rb.furnitureFee) > 0) {
        items.push({ typeCode: 'FURNITURE', typeName: 'ค่าเฟอร์นิเจอร์', description: null, quantity: 1, unitPrice: Number(rb.furnitureFee), total: Number(rb.furnitureFee) });
      }
      if (Number(rb.otherFee) > 0) {
        items.push({ typeCode: 'OTHER', typeName: 'อื่นๆ', description: rb.note ?? null, quantity: 1, unitPrice: Number(rb.otherFee), total: Number(rb.otherFee) });
      }
    }
    const primaryTenant = invoice.room?.tenants?.[0]?.tenant;
    const tenantName = primaryTenant ? `${primaryTenant.firstName ?? ''} ${primaryTenant.lastName ?? ''}`.trim() || null : null;
    const tenantPhone = primaryTenant?.phone ?? null;
    const dueDateStr = invoice.dueDate.toISOString().split('T')[0];
    const invoiceNumber = `INV-${invoice.year}${String(invoice.month).padStart(2, '0')}-${invoice.roomNo}`;

    // ── Meter reading details ─────────────────────────────────────────────
    const meterReadings: NonNullable<import('./types').InvoicePreviewResponse['meterReadings']> = {};

    if (rb && Number(rb.waterTotal) > 0) {
      const wUnits = Number(rb.waterUnits);
      const wUsage = Number(rb.waterUsageCharge);
      meterReadings.water = {
        prev:        rb.waterPrev != null ? Number(rb.waterPrev) : null,
        curr:        rb.waterCurr != null ? Number(rb.waterCurr) : null,
        units:       wUnits,
        ratePerUnit: wUnits > 0 ? wUsage / wUnits : 0,
        usageCharge: wUsage,
        serviceFee:  Number(rb.waterServiceFee),
        total:       Number(rb.waterTotal),
      };
    }

    if (rb && Number(rb.electricTotal) > 0) {
      const eUnits = Number(rb.electricUnits);
      const eUsage = Number(rb.electricUsageCharge);
      meterReadings.electric = {
        prev:        rb.electricPrev != null ? Number(rb.electricPrev) : null,
        curr:        rb.electricCurr != null ? Number(rb.electricCurr) : null,
        units:       eUnits,
        ratePerUnit: eUnits > 0 ? eUsage / eUnits : 0,
        usageCharge: eUsage,
        serviceFee:  Number(rb.electricServiceFee),
        total:       Number(rb.electricTotal),
      };
    }

    return {
      invoiceId: invoice.id,
      invoiceNumber,
      year: invoice.year,
      month: invoice.month,
      roomNo: invoice.roomNo,
      floorNo: invoice.room?.floorNo ?? null,
      tenantName,
      tenantPhone,
      items,
      totalAmount: Number(invoice.totalAmount),
      dueDate: dueDateStr,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      status: invoice.status,
      meterReadings: Object.keys(meterReadings).length > 0 ? meterReadings : undefined,
    };
  }

  /**
   * Get invoice by room/year/month
   */
  async getInvoice(
    roomNo: string,
    year: number,
    month: number
  ): Promise<InvoiceResponse | null> {
    const invoice = await prisma.invoice.findFirst({
      where: { roomNo, year, month },
      include: {
        room: {
          include: {
            tenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
        deliveries: { orderBy: { createdAt: 'desc' } },
        roomBilling: true,
      },
    });

    if (!invoice) return null;
    return this.formatInvoiceResponse(invoice);
  }

  /**
   * List invoices
   */
  async listInvoices(query: ListInvoicesQuery): Promise<InvoicesListResponse> {
    const { q, roomNo, year, month, status, page, pageSize, sortBy, sortOrder } = query;

    const where: Record<string, unknown> = {};

    if (roomNo) where.roomNo = roomNo;
    if (year) where.year = year;
    if (month) where.month = month;
    if (status) where.status = status;

    // Free-text search: matches on roomNo OR id (prefix), OR tenant firstName/lastName
    // via the nested room → roomTenants → tenant relation. Case-insensitive.
    if (q) {
      const trimmed = q.trim();
      where.OR = [
        { roomNo: { contains: trimmed, mode: 'insensitive' } },
        { id: { startsWith: trimmed } },
        {
          room: {
            tenants: {
              some: {
                moveOutDate: null,
                tenant: {
                  OR: [
                    { firstName: { contains: trimmed, mode: 'insensitive' } },
                    { lastName: { contains: trimmed, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        },
      ];
    }

    const SORT_FIELD_MAP: Record<string, string> = { totalAmount: 'totalAmount' };
    const prismaOrderField = SORT_FIELD_MAP[sortBy] ?? sortBy;

    const total = await prisma.invoice.count({ where });

    if (total === 0) {
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        room: {
          include: {
            tenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
        deliveries: { orderBy: { createdAt: 'desc' } },
        roomBilling: true,
      },
      orderBy: { [prismaOrderField]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: invoices.map((inv) => this.formatInvoiceResponse(inv)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Canonical invoice send flow.
   */
  async sendInvoice(
    id: string,
    input: SendInvoiceInput,
    sentBy?: string
  ): Promise<InvoiceSendResult> {
    logger.info({ type: 'invoice_send', invoiceId: id, channel: input.channel });

    // PDF / PRINT channels do not go through LINE or the outbox. They
    // record a synchronous InvoiceDelivery row and return the admin-facing
    // PDF URL so staff can download, hand-off, or feed a print queue.
    if (input.channel === 'PDF' || input.channel === 'PRINT') {
      return this.sendInvoiceNonLineChannel(id, input.channel, sentBy);
    }

    if (input.channel !== 'LINE' || input.sendToLine === false) {
      throw new ValidationError('Only LINE, PDF and PRINT delivery are supported');
    }

    const lineConfigured = isLineConfigured();
    const pdfUrl = buildInvoiceAccessUrl(id, {
      absoluteBaseUrl: process.env.APP_BASE_URL || '',
      signed: true,
    });

    let sentPayload: InvoiceSentPayload | null = null;
    let updatedInvoiceRecord: InvoiceResponseRecord | null = null;

    const txResult = await prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoiceForSend(tx, id);

      if (!invoice) {
        throw new NotFoundError('Invoice', id);
      }

      if (invoice.status === INVOICE_STATUS.SENT || invoice.status === INVOICE_STATUS.PAID) {
        throw new ValidationError(`Invoice is already ${invoice.status.toLowerCase()}`);
      }

      const primaryTenant = await this.lockPrimaryRecipientForSend(tx, invoice.roomNo);
      const lineUserId = primaryTenant?.lineUserId ?? null;
      const hasLineRecipient = lineUserId !== null;
      const initialStatus: 'PENDING' | 'FAILED' =
        lineConfigured && hasLineRecipient ? 'PENDING' : 'FAILED';
      const initialError = !lineConfigured
        ? 'LINE is not configured'
        : !hasLineRecipient
          ? 'No LINE account linked to the tenant'
          : null;

      let docTemplate: { id: string; body: string } | null = null;
      try {
        docTemplate = await tx.documentTemplate.findFirst({
          where: { type: 'INVOICE' },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, body: true },
        });
      } catch (err) {
        logger.warn({ type: 'invoice_doc_template_lookup_failed', invoiceId: id, error: err instanceof Error ? err.message : String(err) });
      }

      const documentTemplateId = docTemplate?.id ?? null;
      const documentTemplateHash = docTemplate?.body
        ? createHash('sha256').update(docTemplate.body).digest('hex')
        : null;

      const delivery = await tx.invoiceDelivery.create({
        data: {
          invoiceId: id,
          channel: (input.channel as 'LINE' | 'PDF' | 'PRINT') ?? 'LINE',
          status: initialStatus,
          recipientRef: lineUserId,
          errorMessage: initialError,
          createdBy: sentBy,
          ...(documentTemplateId ? { documentTemplateId } : {}),
          ...(documentTemplateHash ? { documentTemplateHash } : {}),
        },
      });
      const deliveryId = delivery.id;

      if (!lineConfigured || !hasLineRecipient) {
        return {
          queued: false,
          errorMessage: initialError,
          lineConfigured,
          hasLineRecipient,
          deliveryStatus: initialStatus,
          deliveryId,
          messageTemplateId: null,
          documentTemplateId,
          documentTemplateHash,
          pdfUrl,
        };
      }

      let templateBody: string | null = null;
      let resolvedTemplateId: string | null = null;
      try {
        const msgTemplate = input.templateId
          ? await tx.messageTemplate.findUnique({ where: { id: input.templateId } })
          : await tx.messageTemplate.findFirst({
              where: { type: 'INVOICE_SEND' },
              orderBy: { updatedAt: 'desc' },
            });
        if (msgTemplate) {
          templateBody = msgTemplate.body;
          resolvedTemplateId = msgTemplate.id;
        }
      } catch (err) {
        logger.warn({ type: 'invoice_msg_template_lookup_failed', invoiceId: id, error: err instanceof Error ? err.message : String(err) });
      }

      const tenantFullName = primaryTenant
        ? `${primaryTenant.firstName ?? ''} ${primaryTenant.lastName ?? ''}`.trim() || null
        : null;
      const invoiceNumber = `INV-${invoice.year}${String(invoice.month).padStart(2, '0')}-${invoice.roomNo}`;

      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Invoice',
          aggregateId: id,
          eventType: 'InvoiceSendRequested',
          payload: {
            invoiceId: id,
            deliveryId,
            lineUserId,
            pdfUrl,
            roomNo: invoice.roomNo,
            totalAmount: Number(invoice.totalAmount),
            dueDate: invoice.dueDate?.toISOString?.() ?? null,
            templateId: resolvedTemplateId,
            templateBody,
            lineConfigured,
            // Variables for mail-merge in the LINE worker. Kept flat and
            // serialisable so the payload survives round-tripping through the
            // outbox (JSON column).
            interpolationVars: {
              tenantName: tenantFullName ?? '',
              roomNumber: invoice.roomNo,
              invoiceNumber,
              year: String(invoice.year),
              month: String(invoice.month).padStart(2, '0'),
              totalAmount: Number(invoice.totalAmount).toLocaleString('th-TH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
              dueDate: invoice.dueDate
                ? invoice.dueDate.toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : '',
            },
          },
          retryCount: 0,
        },
      });

      const sentAt = new Date();
      const updatedCount = await tx.invoice.updateMany({
        where: { id, status: invoice.status },
        data: { status: INVOICE_STATUS.SENT, sentAt },
      });

      if (updatedCount.count !== 1) {
        throw new ConflictError('Invoice send state changed before delivery could be queued');
      }

      const updatedInvoice = await tx.invoice.findUnique({
        where: { id },
        include: {
          room: {
            include: {
              tenants: {
                where: { role: 'PRIMARY', moveOutDate: null },
                include: { tenant: true },
                take: 1,
              },
            },
          },
          deliveries: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!updatedInvoice) {
        throw new NotFoundError('Invoice', id);
      }

      updatedInvoiceRecord = updatedInvoice;
      sentPayload = {
        invoiceId: updatedInvoice.id,
        tenantId: primaryTenant?.tenantId || '',
        lineUserId,
        sentBy: sentBy || 'system',
        lineMessageId: undefined,
        sentAt: sentAt.toISOString(),
      };

      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Invoice',
          aggregateId: updatedInvoice.id,
          eventType: EventTypes.INVOICE_SENT,
          payload: {
            invoiceId: updatedInvoice.id,
            tenantId: primaryTenant?.tenantId || '',
            lineUserId: lineUserId || '',
            sentBy: sentBy || 'system',
            sentByName: sentBy || 'system',
            sentAt: sentAt.toISOString(),
          },
          retryCount: 0,
        },
      });

      return {
        queued: true,
        errorMessage: null,
        lineConfigured,
        hasLineRecipient: true,
        deliveryStatus: 'PENDING' as const,
        deliveryId,
        messageTemplateId: resolvedTemplateId,
        documentTemplateId,
        documentTemplateHash,
        pdfUrl,
      };
    });

    if (!txResult.queued) {
      return { ...txResult, invoice: null };
    }

    if (!sentPayload || !updatedInvoiceRecord) {
      throw new ConflictError('Invoice delivery could not be queued');
    }

    await this.eventBus.publish(
      EventTypes.INVOICE_SENT,
      'Invoice',
      id,
      sentPayload as unknown,
      { userId: sentBy }
    );

    return {
      ...txResult,
      invoice: this.formatInvoiceResponse(updatedInvoiceRecord),
    };
  }

  /**
   * Mark invoice as viewed
   */
  async markInvoiceViewed(id: string, tenantId?: string): Promise<InvoiceResponse> {
    const invoice = await prisma.invoice.findUnique({ where: { id } });

    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }

    if (invoice.paidAt) {
      return this.getInvoiceById(id);
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: INVOICE_STATUS.VIEWED },
      include: {
        room: {
          include: {
            tenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
        deliveries: { orderBy: { createdAt: 'desc' } },
        roomBilling: true,
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
      payload
    );

    return this.formatInvoiceResponse(updated);
  }

  /**
   * Cancel an invoice and revert the associated RoomBilling to LOCKED
   * so it can be re-invoiced after corrections.
   * Only GENERATED/overdue invoices can be cancelled; SENT/PAID cannot.
   */
  async cancelInvoice(id: string, cancelledBy: string, reason: string): Promise<InvoiceResponse> {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }

    if (invoice.status === INVOICE_STATUS.CANCELLED) {
      throw new BadRequestError('Invoice is already cancelled');
    }
    if (invoice.status === INVOICE_STATUS.SENT || invoice.status === INVOICE_STATUS.PAID) {
      throw new BadRequestError(`Cannot cancel an invoice with status ${invoice.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Cancel the invoice
      const cancelled = await tx.invoice.update({
        where: { id },
        data: { status: INVOICE_STATUS.CANCELLED },
      });

      // Revert RoomBilling to LOCKED so it can be re-invoiced
      await tx.roomBilling.update({
        where: { id: invoice.roomBillingId },
        data: { status: 'LOCKED' },
      });

      // Cancel associated pending deliveries so they can't be resent
      await tx.invoiceDelivery.updateMany({
        where: { invoiceId: id, status: { in: ['PENDING', 'SENT'] } },
        data: { status: 'CANCELLED' as const },
      });

      return cancelled;
    });

    await logAudit({
      actorId: cancelledBy,
      actorRole: 'ADMIN',
      action: 'INVOICE_CANCELLED',
      entityType: 'INVOICE',
      entityId: id,
      metadata: { roomBillingId: invoice.roomBillingId, reason },
    });

    logger.info({ type: 'invoice_cancelled', invoiceId: id, cancelledBy, reason });

    return this.formatInvoiceResponse(updated);
  }

  /**
   * Check for overdue invoices
   */
  async checkOverdueInvoices(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['SENT', 'VIEWED', INVOICE_STATUS.GENERATED] },
        dueDate: { lt: today },
      },
      include: {
        roomBilling: {
          include: { effectiveRule: true },
        },
      },
    });

    if (overdueInvoices.length === 0) {
      logger.info({ type: 'overdue_check', count: 0 });
      return;
    }

    // Batch update DB + publish events concurrently
    await Promise.all(
      overdueInvoices.map(async (invoice) => {
        const daysOverdue = Math.floor(
          (today.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Compute late payment penalty using the billing rule's penaltyPerDay.
        // penaltyPerDay is the daily rate (e.g., 0.0005 = ~1.5% per month on 30-day month).
        // Apply grace period first — no penalty within grace days.
        const gracePeriodDays = invoice.roomBilling.effectiveRule.gracePeriodDays ?? 0;
        const chargeableDays = Math.max(0, daysOverdue - gracePeriodDays);
        const penaltyPerDay = Number(invoice.roomBilling.effectiveRule.penaltyPerDay ?? 0);
        const maxPenalty = Number(invoice.roomBilling.effectiveRule.maxPenalty ?? 0);
        const lateFeeAmount = penaltyPerDay > 0
          ? Math.min(chargeableDays * penaltyPerDay * Number(invoice.totalAmount), maxPenalty)
          : 0;

        const payload: InvoiceOverduePayload = {
          invoiceId: invoice.id,
          roomId: invoice.roomNo,
          roomNumber: invoice.roomNo,
          daysOverdue,
          totalAmount: Number(invoice.totalAmount),
        };

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: INVOICE_STATUS.OVERDUE,
            ...(lateFeeAmount > 0
              ? { lateFeeAmount, lateFeeAppliedAt: new Date() }
              : {}),
          },
        });
        await this.eventBus.publish(
          EventTypes.INVOICE_MARKED_OVERDUE,
          'Invoice',
          invoice.id,
          payload
        );
      })
    );

    logger.info({ type: 'overdue_check', count: overdueInvoices.length });
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private async lockInvoiceForSend(
    tx: Prisma.TransactionClient,
    id: string
  ): Promise<LockedInvoiceSendRow | null> {
    const rows = await tx.$queryRaw<LockedInvoiceSendRow[]>`
      SELECT
        i."id",
        i."roomNo",
        i."roomBillingId",
        i."year",
        i."month",
        i."status"::text AS "status",
        i."totalAmount",
        i."dueDate",
        i."issuedAt",
        i."sentAt",
        i."paidAt",
        i."createdAt",
        i."updatedAt"
      FROM "invoices" i
      WHERE i."id" = ${id}
      FOR UPDATE OF i
    `;

    return rows[0] ?? null;
  }

  /**
   * Deliver an invoice via the PDF or PRINT channel.
   *
   * These channels do not use LINE or the outbox. We lock the invoice row,
   * record a synchronous InvoiceDelivery, flip the invoice to SENT, and
   * return the admin-facing signed PDF URL so staff can download (PDF) or
   * feed it to a print queue (PRINT).
   *
   * PDF: delivery status = SENT (staff already has the file)
   * PRINT: delivery status = PENDING until staff marks it printed
   */
  private async sendInvoiceNonLineChannel(
    id: string,
    channel: 'PDF' | 'PRINT',
    sentBy?: string
  ): Promise<InvoiceSendResult> {
    const pdfUrl = buildInvoiceAccessUrl(id, {
      absoluteBaseUrl: process.env.APP_BASE_URL || '',
      signed: true,
    });

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoiceForSend(tx, id);
      if (!invoice) {
        throw new NotFoundError('Invoice', id);
      }
      if (invoice.status === INVOICE_STATUS.SENT || invoice.status === INVOICE_STATUS.PAID) {
        throw new ValidationError(`Invoice is already ${invoice.status.toLowerCase()}`);
      }

      let docTemplate: { id: string; body: string } | null = null;
      try {
        docTemplate = await tx.documentTemplate.findFirst({
          where: { type: 'INVOICE' },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, body: true },
        });
      } catch (err) {
        logger.warn({
          type: 'invoice_doc_template_lookup_failed',
          invoiceId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const documentTemplateId = docTemplate?.id ?? null;
      const documentTemplateHash = docTemplate?.body
        ? createHash('sha256').update(docTemplate.body).digest('hex')
        : null;

      // PDF: already delivered to admin (downloaded) → SENT immediately.
      // PRINT: awaits physical print confirmation → PENDING until staff flips
      // it via PATCH /api/invoices/deliveries/[id]/mark-printed.
      const sentAtForDelivery: Date | null = channel === 'PDF' ? new Date() : null;

      const delivery = await tx.invoiceDelivery.create({
        data: {
          invoiceId: id,
          channel,
          status: channel === 'PDF' ? 'SENT' : 'PENDING',
          recipientRef: null,
          sentAt: sentAtForDelivery,
          createdBy: sentBy,
          ...(documentTemplateId ? { documentTemplateId } : {}),
          ...(documentTemplateHash ? { documentTemplateHash } : {}),
        },
      });

      const sentAt = new Date();
      const updatedCount = await tx.invoice.updateMany({
        where: { id, status: invoice.status },
        data: { status: INVOICE_STATUS.SENT, sentAt },
      });
      if (updatedCount.count !== 1) {
        throw new ConflictError('Invoice send state changed before delivery could be recorded');
      }

      const updatedInvoice = await tx.invoice.findUnique({
        where: { id },
        include: {
          room: {
            include: {
              tenants: {
                where: { role: 'PRIMARY', moveOutDate: null },
                include: { tenant: true },
                take: 1,
              },
            },
          },
          deliveries: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!updatedInvoice) {
        throw new NotFoundError('Invoice', id);
      }

      return {
        delivery,
        updatedInvoice,
        documentTemplateId,
        documentTemplateHash,
      };
    });

    await logAudit({
      actorId: sentBy || 'system',
      action: channel === 'PDF' ? 'INVOICE_PDF_GENERATED' : 'INVOICE_PRINT_QUEUED',
      entityType: 'INVOICE',
      entityId: id,
      metadata: {
        deliveryId: result.delivery.id,
        channel,
        pdfUrl,
      },
    });

    logger.info({
      type: channel === 'PDF' ? 'invoice_pdf_generated' : 'invoice_print_queued',
      invoiceId: id,
      deliveryId: result.delivery.id,
    });

    return {
      queued: true,
      invoice: this.formatInvoiceResponse(result.updatedInvoice),
      errorMessage: null,
      lineConfigured: isLineConfigured(),
      hasLineRecipient: false,
      deliveryStatus: 'PENDING',
      deliveryId: result.delivery.id,
      messageTemplateId: null,
      documentTemplateId: result.documentTemplateId,
      documentTemplateHash: result.documentTemplateHash,
      pdfUrl,
    };
  }

  private async lockPrimaryRecipientForSend(
    tx: Prisma.TransactionClient,
    roomNo: string
  ): Promise<LockedPrimaryRecipientRow | null> {
    const rows = await tx.$queryRaw<LockedPrimaryRecipientRow[]>`
      SELECT
        rt."id" AS "roomTenantId",
        t."id" AS "tenantId",
        t."lineUserId",
        t."firstName",
        t."lastName",
        t."phone"
      FROM "room_tenants" rt
      INNER JOIN "tenants" t ON t."id" = rt."tenantId"
      WHERE rt."roomNo" = ${roomNo}
        AND rt."role" = 'PRIMARY'::"TenantRole"
        AND rt."moveOutDate" IS NULL
      ORDER BY rt."createdAt" ASC
      LIMIT 1
      FOR UPDATE OF rt, t
    `;

    return rows[0] ?? null;
  }

  private formatInvoiceResponse(
    invoice: InvoiceResponseRecord
  ): InvoiceResponse {
    type RoomWithTenants = {
      roomNo: string;
      tenants?: Array<{ tenant?: { id?: string; firstName?: string; lastName?: string; phone?: string; lineUserId?: string | null } | null }>;
      roomTenants?: Array<{ tenant?: { id?: string; firstName?: string; lastName?: string; phone?: string; lineUserId?: string | null } | null }>;
    };
    const room = invoice.room as unknown as RoomWithTenants | undefined;
    const primaryTenant = room?.tenants?.[0]?.tenant ?? room?.roomTenants?.[0]?.tenant;
    const tenantName = primaryTenant
      ? `${primaryTenant.firstName ?? ''} ${primaryTenant.lastName ?? ''}`.trim() || null
      : null;
    const invoiceNumber = `INV-${invoice.year}${String(invoice.month).padStart(2, '0')}-${invoice.roomNo}`;

    return {
      id: invoice.id,
      invoiceNumber,
      roomNo: invoice.roomNo,
      roomBillingId: invoice.roomBillingId,
      billingPeriodId: invoice.roomBilling?.billingPeriodId ?? '',
      year: invoice.year,
      month: invoice.month,
      status: invoice.status as InvoiceStatus,
      totalAmount: Number(invoice.totalAmount),
      dueDate: invoice.dueDate,
      issuedAt: invoice.issuedAt ?? null,
      sentAt: invoice.sentAt ?? null,
      paidAt: invoice.paidAt ?? null,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      room: room
        ? {
            roomNo: room.roomNo,
            roomNumber: room.roomNo,
          }
        : undefined,
      tenant: primaryTenant?.id
        ? {
            id: primaryTenant.id,
            fullName: tenantName ?? 'ไม่ระบุผู้เช่า',
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
      items: [],
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createInvoiceService(eventBus?: EventBus): InvoiceService {
  return new InvoiceService(eventBus);
}
