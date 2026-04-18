import { prisma } from '@/lib';
import { v4 as uuidv4 } from 'uuid';

export async function createTestTenant() {
  return prisma.tenant.create({
    data: {
      id: uuidv4(),
      firstName: 'Test',
      lastName: 'Tenant',
      phone: '0999123456',
    },
  });
}

export async function createTestRoom(tenantId?: string) {
  const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : await createTestTenant();

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  // New schema: Room PK is roomNo (string), no building/floor models
  const roomNo = `TEST-${Math.floor(Math.random() * 9000) + 1000}`;
  return prisma.room.create({
    data: {
      roomNo,
      floorNo: 1,
      defaultAccountId: 'ACC_F1',
      defaultRuleCode: 'STANDARD',
      defaultRentAmount: 5000,
      hasFurniture: false,
      defaultFurnitureAmount: 0,
      roomStatus: 'VACANT',
    } as any,
  });
}

export async function createTestConversation(roomNo?: string) {
  const room = roomNo ? { roomNo } : await createTestRoom();

  return prisma.conversation.create({
    data: {
      id: uuidv4(),
      roomNo: (room as { roomNo: string }).roomNo,
      lineUserId: uuidv4(),
      lastMessageAt: new Date(),
    } as any,
  });
}

export async function createTestMessage(conversationId: string) {
  return prisma.message.create({
    data: {
      id: uuidv4(),
      conversationId,
      lineMessageId: uuidv4(),
      direction: 'INCOMING',
      type: 'TEXT',
      content: 'Test message',
      sentAt: new Date(),
    },
  });
}

export async function createTestInvoice(roomNo: string) {
  // Create a BillingPeriod and RoomBilling since Invoice requires roomBillingId
  const period = await prisma.billingPeriod.create({
    data: {
      year: 2026,
      month: 3,
      status: 'LOCKED' as any,
    } as any,
  });

  const roomBilling = await (prisma as any).roomBilling.create({
    data: {
      id: uuidv4(),
      billingPeriodId: period.id,
      roomNo,
      recvAccountId: 'ACC_F1',
      ruleCode: 'STANDARD',
      rentAmount: 5000,
      waterMode: 'NORMAL',
      waterUnits: 0,
      waterUsageCharge: 0,
      waterServiceFee: 0,
      waterTotal: 0,
      electricMode: 'NORMAL',
      electricUnits: 0,
      electricUsageCharge: 0,
      electricServiceFee: 0,
      electricTotal: 0,
      furnitureFee: 0,
      otherFee: 0,
      totalDue: 5000,
      status: 'LOCKED',
    },
  });

  return prisma.invoice.create({
    data: {
      id: uuidv4(),
      roomNo,
      roomBillingId: roomBilling.id,
      year: 2026,
      month: 3,
      status: 'GENERATED',
      totalAmount: 5000 as unknown as any,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } as any,
  });
}

export async function createTestOutboxEvent(aggregateType: string = 'INVOICE') {
  return prisma.outboxEvent.create({
    data: {
      id: uuidv4(),
      eventType: 'INVOICE_CREATED',
      aggregateType,
      aggregateId: uuidv4(),
      payload: JSON.stringify({ test: 'data' }),
      processedAt: null,
      retryCount: 0,
    },
  });
}
