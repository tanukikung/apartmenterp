import { prisma } from '@/lib/db/client';
import { buildFileAccessUrl } from '@/lib/files/access';
import { sendLineFileMessage, sendLineMessage } from '@/lib/line/client';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/utils/errors';
import { Prisma } from '@prisma/client';
import type { CreateDeliveryOrderInput, DeliveryOrderListQuery } from './types';

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function buildSignedDocumentFileUrl(storageKey: string): string {
  const absoluteBaseUrl = (process.env.APP_BASE_URL || '').trim();
  if (!absoluteBaseUrl) {
    throw new Error('APP_BASE_URL must be configured for document delivery');
  }

  return buildFileAccessUrl(storageKey, {
    absoluteBaseUrl,
    inline: true,
    signed: true,
    expiresInSeconds: 15 * 60,
  });
}

function buildAbsoluteAppUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }

  const absoluteBaseUrl = (process.env.APP_BASE_URL || '').trim();
  if (!absoluteBaseUrl) {
    throw new Error('APP_BASE_URL must be configured for document delivery');
  }

  return `${absoluteBaseUrl.replace(/\/+$/, '')}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export class DeliveryService {
  private async recalculateOrderStatus(orderId: string): Promise<void> {
    const items = await prisma.deliveryOrderItem.findMany({
      where: { deliveryOrderId: orderId },
      select: { status: true },
    });

    const sentCount = items.filter((item) => item.status === 'SENT').length;
    const failedCount = items.filter((item) => item.status === 'FAILED').length;
    const skippedCount = items.filter((item) => item.status === 'SKIPPED').length;
    const pendingCount = items.filter((item) => item.status === 'PENDING').length;

    let status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SENDING' = 'SENDING';
    if (pendingCount === 0) {
      if (sentCount === 0 && failedCount > 0) {
        status = 'FAILED';
      } else if (sentCount === items.length) {
        status = 'COMPLETED';
      } else if (sentCount > 0 || skippedCount > 0) {
        status = 'PARTIAL';
      } else {
        status = 'COMPLETED';
      }
    }

    await prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { sentCount, failedCount, status },
    });
  }

  private async sendDeliveryOrderItemNow(input: {
    itemId: string;
    orderId: string;
    lineUserId: string;
    documentTitle: string;
    roomNo: string;
    pdfUrl: string;
    generatedDocumentId?: string | null;
  }): Promise<void> {
    const { itemId, orderId, lineUserId, documentTitle, roomNo, pdfUrl, generatedDocumentId } = input;
    const absolutePdfUrl = buildAbsoluteAppUrl(pdfUrl);
    const fileName = `${documentTitle}-${roomNo}.pdf`;

    try {
      try {
        await sendLineFileMessage(lineUserId, absolutePdfUrl, fileName);
      } catch {
        await sendLineMessage(
          lineUserId,
          `${documentTitle}\nห้อง ${roomNo}\nดาวน์โหลดเอกสาร: ${absolutePdfUrl}`,
        );
      }

      await prisma.deliveryOrderItem.update({
        where: { id: itemId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          errorMessage: null,
        },
      });

      if (generatedDocumentId) {
        await prisma.generatedDocument.update({
          where: { id: generatedDocumentId },
          data: { status: 'SENT' },
        });
      }
    } catch (error) {
      await prisma.deliveryOrderItem.update({
        where: { id: itemId },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    } finally {
      await this.recalculateOrderStatus(orderId);
    }
  }

  async createOrder(input: CreateDeliveryOrderInput, actorId?: string | null) {
    const docWhere: Prisma.GeneratedDocumentWhereInput = {
      documentType: input.documentType as unknown as Prisma.GeneratedDocumentWhereInput['documentType'],
    };
    if (input.year) docWhere.year = input.year;
    if (input.month) docWhere.month = input.month;

    let roomNos: string[] | undefined = input.roomNos;
    if (input.floorNumber && !roomNos?.length) {
      const rooms = await prisma.room.findMany({
        where: { floorNo: input.floorNumber },
        select: { roomNo: true },
      });
      roomNos = rooms.map((room) => room.roomNo);
    }
    if (roomNos?.length) {
      docWhere.roomNo = { in: roomNos };
    }

    const docs = await prisma.generatedDocument.findMany({
      where: docWhere,
      include: {
        room: true,
        files: { include: { uploadedFile: true } },
      },
      orderBy: { generatedAt: 'desc' },
    });

    const latestByRoom = new Map<string, (typeof docs)[number]>();
    for (const doc of docs) {
      if (!latestByRoom.has(doc.roomNo)) {
        latestByRoom.set(doc.roomNo, doc);
      }
    }

    if (latestByRoom.size === 0) {
      throw new NotFoundError('ไม่พบเอกสารที่ตรงกับเงื่อนไข');
    }

    const roomNosList = Array.from(latestByRoom.keys());
    const roomTenants = await prisma.roomTenant.findMany({
      where: { roomNo: { in: roomNosList }, moveOutDate: null },
      include: { tenant: true, room: true },
    });

    const recipientByRoom = new Map<string, { tenantId: string; lineUserId: string | null }>();
    for (const roomTenant of roomTenants) {
      const lineUserId = roomTenant.room.lineUserId || roomTenant.tenant.lineUserId || null;
      if (!recipientByRoom.has(roomTenant.roomNo)) {
        recipientByRoom.set(roomTenant.roomNo, { tenantId: roomTenant.tenantId, lineUserId });
      }
    }

    const scopeRoomNos = Array.from(latestByRoom.keys()).sort((a, b) => naturalCollator.compare(a, b));

    const order = await prisma.deliveryOrder.create({
      data: {
        channel: 'LINE',
        documentType: input.documentType as unknown as Prisma.DeliveryOrderCreateInput['documentType'],
        description: input.description,
        year: input.year,
        month: input.month,
        floorNumber: input.floorNumber,
        scopeRoomNos,
        status: 'DRAFT',
        totalCount: latestByRoom.size,
        createdBy: actorId,
        items: {
          create: scopeRoomNos.map((roomNo) => {
            const doc = latestByRoom.get(roomNo)!;
            const recipient = recipientByRoom.get(roomNo);
            const hasPdf = doc.files.some((file) => file.role === 'PDF');
            return {
              roomNo,
              tenantId: recipient?.tenantId || null,
              generatedDocumentId: doc.id,
              invoiceId: doc.invoiceId,
              recipientRef: recipient?.lineUserId || null,
              status: !recipient?.lineUserId || !hasPdf ? 'SKIPPED' : 'PENDING',
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
    if (!order) {
      throw new NotFoundError('ไม่พบ Delivery Order');
    }

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
    if (!order) {
      throw new NotFoundError('ไม่พบ Delivery Order');
    }

    await prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { status: 'SENDING' },
    });

    for (const item of order.items) {
      if (!item.recipientRef || !item.generatedDocument) continue;
      const pdfFile = item.generatedDocument.files.find((file) => file.role === 'PDF');
      if (!pdfFile) continue;

      await this.sendDeliveryOrderItemNow({
        itemId: item.id,
        orderId: order.id,
        lineUserId: item.recipientRef,
        documentTitle: item.generatedDocument.title,
        roomNo: item.roomNo,
        pdfUrl: buildSignedDocumentFileUrl(pdfFile.uploadedFile.storageKey),
        generatedDocumentId: item.generatedDocument.id,
      });
    }

    return { message: 'ส่งเอกสารเรียบร้อย' };
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
    if (!item) {
      throw new NotFoundError('ไม่พบรายการ');
    }
    if (!item.recipientRef) {
      throw new BadRequestError('ไม่มี LINE ID ผู้รับ');
    }

    await prisma.deliveryOrderItem.update({
      where: { id: itemId },
      data: { status: 'PENDING', errorMessage: null },
    });

    const pdfFile = item.generatedDocument?.files.find((file) => file.role === 'PDF');
    if (!pdfFile) {
      throw new NotFoundError('ไม่พบไฟล์ PDF');
    }

    await this.sendDeliveryOrderItemNow({
      itemId: item.id,
      orderId,
      lineUserId: item.recipientRef,
      documentTitle: item.generatedDocument!.title,
      roomNo: item.roomNo,
      pdfUrl: buildSignedDocumentFileUrl(pdfFile.uploadedFile.storageKey),
      generatedDocumentId: item.generatedDocumentId,
    });
  }

  async sendSingleDocument(generatedDocumentId: string, actorId?: string | null) {
    const doc = await prisma.generatedDocument.findUnique({
      where: { id: generatedDocumentId },
      include: { room: true, files: { include: { uploadedFile: true } } },
    });
    if (!doc) {
      throw new NotFoundError('GeneratedDocument', generatedDocumentId);
    }

    const pdfFile = doc.files.find((file) => file.role === 'PDF');
    if (!pdfFile) {
      throw new NotFoundError('Generated document PDF');
    }

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

    const roomTenant = await prisma.roomTenant.findFirst({
      where: { roomNo: doc.roomNo, moveOutDate: null },
      include: { tenant: true, room: true },
    });
    const lineUserId = doc.room.lineUserId || roomTenant?.tenant.lineUserId;
    if (!lineUserId) {
      throw new BadRequestError('ไม่พบ LINE ID ของผู้เช่าห้องนี้');
    }

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

    await this.sendDeliveryOrderItemNow({
      itemId: order.items[0].id,
      orderId: order.id,
      lineUserId,
      documentTitle: doc.title,
      roomNo: doc.roomNo,
      pdfUrl: buildSignedDocumentFileUrl(pdfFile.uploadedFile.storageKey),
      generatedDocumentId: doc.id,
    });

    return order;
  }
}

let _instance: DeliveryService | null = null;

export function getDeliveryService(): DeliveryService {
  if (!_instance) {
    _instance = new DeliveryService();
  }
  return _instance;
}
