import { prisma } from '@/lib/db/client';
import { getServiceContainer } from '@/lib/service-container';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/utils/errors';
import { Prisma } from '@prisma/client';
import type { CreateDeliveryOrderInput, DeliveryOrderListQuery } from './types';

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export class DeliveryService {
  // Creates a DeliveryOrder + items by finding matching GeneratedDocuments
  async createOrder(input: CreateDeliveryOrderInput, actorId?: string | null) {
    // 1. Build where clause for GeneratedDocument
    // Note: Zod schema uses 'GENERAL' but Prisma enum has 'GENERAL_NOTICE' — cast via unknown
    const docWhere = {
      documentType: input.documentType,
    } as any as Prisma.GeneratedDocumentWhereInput;
    if (input.year) docWhere.year = input.year;
    if (input.month) docWhere.month = input.month;

    // 2-3. Room scope
    let roomNos: string[] | undefined = input.roomNos;
    if (input.floorNumber && !roomNos?.length) {
      const rooms = await prisma.room.findMany({
        where: { floorNo: input.floorNumber },
        select: { roomNo: true },
      });
      roomNos = rooms.map(r => r.roomNo);
    }
    if (roomNos?.length) {
      docWhere.roomNo = { in: roomNos };
    }

    // 4. Find latest document per room
    const docs = await prisma.generatedDocument.findMany({
      where: docWhere,
      include: {
        room: true,
        files: { include: { uploadedFile: true } },
      },
      orderBy: { generatedAt: 'desc' },
    });

    // Group by room - take latest only
    const latestByRoom = new Map<string, typeof docs[0]>();
    for (const doc of docs) {
      if (!latestByRoom.has(doc.roomNo)) {
        latestByRoom.set(doc.roomNo, doc);
      }
    }

    if (latestByRoom.size === 0) {
      throw new Error('ไม่พบเอกสารที่ตรงกับเงื่อนไข');
    }

    // 5. Resolve LINE recipients for each room
    const roomNosList = Array.from(latestByRoom.keys());
    const roomTenants = await prisma.roomTenant.findMany({
      where: { roomNo: { in: roomNosList }, moveOutDate: null },
      include: { tenant: true, room: true },
    });

    const recipientByRoom = new Map<string, { tenantId: string; lineUserId: string | null }>();
    for (const rt of roomTenants) {
      // Use room's lineUserId first, then tenant's
      const lineUserId = rt.room.lineUserId || rt.tenant.lineUserId || null;
      if (!recipientByRoom.has(rt.roomNo)) {
        recipientByRoom.set(rt.roomNo, { tenantId: rt.tenantId, lineUserId });
      }
    }

    // 6. Create order + items in transaction
    const scopeRoomNos = Array.from(latestByRoom.keys()).sort((a, b) => naturalCollator.compare(a, b));

    const order = await prisma.deliveryOrder.create({
      data: {
        channel: 'LINE',
        documentType: input.documentType as unknown as Prisma.DeliveryOrderCreateInput['documentType'],
        description: input.description,
        year: input.year,
        month: input.month,
        floorNumber: input.floorNumber,
        scopeRoomNos: scopeRoomNos,
        status: 'DRAFT',
        totalCount: latestByRoom.size,
        createdBy: actorId,
        items: {
          create: scopeRoomNos.map(roomNo => {
            const doc = latestByRoom.get(roomNo)!;
            const recipient = recipientByRoom.get(roomNo);
            const hasPdf = doc.files.some(f => f.role === 'PDF');
            return {
              roomNo,
              tenantId: recipient?.tenantId || null,
              generatedDocumentId: doc.id,
              invoiceId: doc.invoiceId,
              recipientRef: recipient?.lineUserId || null,
              status: (!recipient?.lineUserId || !hasPdf) ? 'SKIPPED' : 'PENDING',
            };
          }),
        },
      },
      include: {
        items: {
          include: {
            room: true,
            tenant: true,
            generatedDocument: {
              include: { files: { include: { uploadedFile: true } } },
            },
          },
        },
      },
    });

    // Update skipped count
    const skippedCount = order.items.filter(i => i.status === 'SKIPPED').length;
    if (skippedCount > 0) {
      await prisma.deliveryOrder.update({
        where: { id: order.id },
        data: { totalCount: order.items.length },
      });
    }

    // 7. If sendNow, execute immediately
    if (input.sendNow) {
      await this.executeOrder(order.id, actorId);
    }

    return order;
  }

  async listOrders(query: DeliveryOrderListQuery) {
    const where: Prisma.DeliveryOrderWhereInput = {};
    if (query.year) where.year = query.year;
    if (query.month) where.month = query.month;
    if (query.status) where.status = query.status;

    const [total, orders] = await Promise.all([
      prisma.deliveryOrder.count({ where }),
      prisma.deliveryOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      data: orders,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async getOrder(id: string) {
    const order = await prisma.deliveryOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            room: true,
            tenant: true,
            generatedDocument: {
              include: { files: { include: { uploadedFile: true } }, template: true },
            },
          },
        },
      },
    });
    if (!order) throw new Error('ไม่พบ Delivery Order');

    // Sort items by room number naturally
    order.items.sort((a, b) => naturalCollator.compare(a.roomNo, b.roomNo));
    return order;
  }

  async executeOrder(orderId: string, _actorId?: string | null) {
    const order = await prisma.deliveryOrder.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { status: 'PENDING' },
          include: {
            generatedDocument: {
              include: { files: { include: { uploadedFile: true } } },
            },
          },
        },
      },
    });
    if (!order) throw new Error('ไม่พบ Delivery Order');

    await prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { status: 'SENDING' },
    });

    const container = getServiceContainer();
    const bus = container.eventBus;

    for (const item of order.items) {
      if (!item.recipientRef || !item.generatedDocument) continue;
      const pdfFile = item.generatedDocument.files.find(f => f.role === 'PDF');
      if (!pdfFile) continue;

      await bus.publish(
        'DeliveryOrderItemSendRequested',
        'DeliveryOrderItem',
        item.id,
        {
          itemId: item.id,
          orderId: order.id,
          lineUserId: item.recipientRef,
          documentTitle: item.generatedDocument.title,
          roomNo: item.roomNo,
          pdfUrl: pdfFile.uploadedFile.url,
        },
      );
    }

    return { message: 'กำลังส่ง...' };
  }

  async resendItem(orderId: string, itemId: string) {
    const item = await prisma.deliveryOrderItem.findFirst({
      where: { id: itemId, deliveryOrderId: orderId },
      include: {
        generatedDocument: {
          include: { files: { include: { uploadedFile: true } } },
        },
      },
    });
    if (!item) throw new Error('ไม่พบรายการ');
    if (!item.recipientRef) throw new Error('ไม่มี LINE ID ผู้รับ');

    await prisma.deliveryOrderItem.update({
      where: { id: itemId },
      data: { status: 'PENDING', errorMessage: null },
    });

    const pdfFile = item.generatedDocument?.files.find(f => f.role === 'PDF');
    if (!pdfFile) throw new Error('ไม่พบไฟล์ PDF');

    const container = getServiceContainer();
    await container.eventBus.publish(
      'DeliveryOrderItemSendRequested',
      'DeliveryOrderItem',
      item.id,
      {
        itemId: item.id,
        orderId,
        lineUserId: item.recipientRef,
        documentTitle: item.generatedDocument!.title,
        roomNo: item.roomNo,
        pdfUrl: pdfFile.uploadedFile.url,
      },
    );
  }

  /**
   * Send a single generated document via LINE.
   *
   * FLOW: Send uses only the already-rendered, already-saved PDF artifact.
   * This method does NOT regenerate, does NOT pull live billing data, and
   * does NOT mutate the GeneratedDocument status optimistically.
   *
   * Idempotency: if the document has already been successfully sent (a
   * DeliveryOrderItem with status=SENT exists for this generatedDocumentId),
   * a ConflictError is thrown so the caller knows not to retry.
   */
  async sendSingleDocument(generatedDocumentId: string, actorId?: string | null) {
    const doc = await prisma.generatedDocument.findUnique({
      where: { id: generatedDocumentId },
      include: { room: true, files: { include: { uploadedFile: true } } },
    });
    if (!doc) throw new NotFoundError('GeneratedDocument', generatedDocumentId);

    const pdfFile = doc.files.find(f => f.role === 'PDF');
    if (!pdfFile) throw new NotFoundError('Generated document PDF');

    // Idempotency check: do not send again if already successfully delivered.
    const existingSuccess = await prisma.deliveryOrderItem.findFirst({
      where: {
        generatedDocumentId,
        status: 'SENT',
      },
    });
    if (existingSuccess) {
      throw new ConflictError(
        'This document has already been sent successfully. To resend, use the Resend action on the existing delivery order.',
      );
    }

    // Find LINE recipient
    const roomTenant = await prisma.roomTenant.findFirst({
      where: { roomNo: doc.roomNo, moveOutDate: null },
      include: { tenant: true, room: true },
    });
    const lineUserId = doc.room.lineUserId || roomTenant?.tenant.lineUserId;
    if (!lineUserId) throw new BadRequestError('ไม่พบ LINE ID ของผู้เช่าห้องนี้');

    // Create ad-hoc delivery order for tracking
    const order = await prisma.deliveryOrder.create({
      data: {
        channel: 'LINE',
        documentType: doc.documentType,
        year: doc.year,
        month: doc.month,
        scopeRoomNos: [doc.roomNo],
        status: 'SENDING',
        totalCount: 1,
        createdBy: actorId,
        items: {
          create: [{
            roomNo: doc.roomNo,
            tenantId: roomTenant?.tenantId || null,
            generatedDocumentId: doc.id,
            invoiceId: doc.invoiceId,
            recipientRef: lineUserId,
            status: 'PENDING',
          }],
        },
      },
      include: { items: true },
    });

    const container = getServiceContainer();
    await container.eventBus.publish(
      'DeliveryOrderItemSendRequested',
      'DeliveryOrderItem',
      order.items[0].id,
      {
        itemId: order.items[0].id,
        orderId: order.id,
        lineUserId,
        documentTitle: doc.title,
        roomNo: doc.roomNo,
        pdfUrl: pdfFile.uploadedFile.url,
      },
    );

    // Note: GeneratedDocument.status is NOT updated here optimistically.
    // The event handler will update it to SENT once delivery is confirmed.
    // This ensures the status always reflects actual delivery state.

    return order;
  }
}

let _instance: DeliveryService | null = null;
export function getDeliveryService(): DeliveryService {
  if (!_instance) _instance = new DeliveryService();
  return _instance;
}
