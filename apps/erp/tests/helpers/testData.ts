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
  
  // Create building and floor first since Room requires floorId
  const building = await prisma.building.create({
    data: {
      id: uuidv4(),
      name: 'Test Building A',
      address: 'Test Address',
      totalFloors: 5,
    },
  });
  
  const floor = await prisma.floor.create({
    data: {
      id: uuidv4(),
      buildingId: building.id,
      floorNumber: 1,
    },
  });
  
  return prisma.room.create({
    data: {
      id: uuidv4(),
      floorId: floor.id,
      roomNumber: '101',
      status: 'VACANT',
      maxResidents: 2,
    },
  });
}

export async function createTestConversation(roomId?: string) {
  const room = roomId ? { id: roomId } : await createTestRoom();
  
  return prisma.conversation.create({
    data: {
      id: uuidv4(),
      roomId: room.id,
      lineUserId: uuidv4(),
      lastMessageAt: new Date(),
    },
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

export async function createTestInvoice(roomId: string) {
  // Create a billing record first since Invoice requires billingRecordId, year, and month
  const billingRecord = await prisma.billingRecord.create({
    data: {
      id: uuidv4(),
      roomId,
      year: 2026,
      month: 3,
      billingDay: 1,
      dueDay: 5,
      overdueDay: 15,
      status: 'LOCKED',
      subtotal: 5000 as unknown as any,
      lockedAt: new Date(),
      lockedBy: 'system',
    },
  });

  return prisma.invoice.create({
    data: {
      id: uuidv4(),
      roomId,
      billingRecordId: billingRecord.id,
      year: 2026,
      month: 3,
      version: 1,
      status: 'GENERATED',
      subtotal: 5000 as unknown as any,
      total: 5000 as unknown as any,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
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
