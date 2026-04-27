/**
 * Full Invoice Flex Test — ส่ง invoice notification ผ่าน EventBus เหมือน production
 */
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/db/client';
import { bootstrapMessagingRuntime } from '../src/modules/messaging/bootstrap';
import { getOutboxProcessor } from '../src/lib/outbox/processor';
import { getEventBus } from '../src/lib/events/event-bus';
import { EventTypes } from '../src/lib/events/types';

const LINE_USER_ID = 'U2bc1b2cb10ae97cff81ef0b494ee9962';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         FULL INVOICE FLEX MESSAGE TEST                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // สร้าง test data
  const ROOM = `TEST-${Math.floor(Math.random() * 90000 + 10000)}`;

  console.log('📋 STEP 1: สร้าง test data...');
  console.log('─'.repeat(60));

  // Create LINE user
  const lineUser = await prisma.lineUser.upsert({
    where: { lineUserId: LINE_USER_ID },
    update: {},
    create: {
      id: uuidv4(),
      lineUserId: LINE_USER_ID,
      displayName: 'ทดสอบ ระบบ',
      pictureUrl: null,
    },
  });
  console.log(`✓ LINE user: ${lineUser.displayName}`);

  // Create room with bank account
  const room = await prisma.room.create({
    data: {
      roomNo: ROOM,
      floorNo: 1,
      defaultAccountId: 'ACC_F1',
      defaultRuleCode: 'STANDARD',
      defaultRentAmount: 5000,
      hasFurniture: false,
      defaultFurnitureAmount: 0,
      roomStatus: 'OCCUPIED',
    },
  }).catch(() => {});
  console.log(`✓ Room: ${ROOM}`);

  // Create tenant linked to LINE user
  const tenant = await prisma.tenant.create({
    data: {
      id: uuidv4(),
      firstName: 'ทดสอบ',
      lastName: 'ผู้เช่า',
      phone: '0891234567',
      lineUserId: LINE_USER_ID,
    },
  });
  console.log(`✓ Tenant: ${tenant.firstName} ${tenant.lastName} (${tenant.lineUserId})`);

  // Link tenant to room as PRIMARY
  await prisma.roomTenant.create({
    data: {
      id: uuidv4(),
      roomNo: ROOM,
      tenantId: tenant.id,
      role: 'PRIMARY',
      moveInDate: new Date(),
    },
  });
  console.log(`✓ RoomTenant: ${ROOM} ← ${tenant.id.slice(0, 8)} (PRIMARY)`);

  // Create billing period
  const bp = await prisma.billingPeriod.upsert({
    where: { year_month: { year: 2026, month: 4 } },
    create: { id: uuidv4(), year: 2026, month: 4, status: 'LOCKED' },
    update: {},
  });
  console.log(`✓ Billing period: ${bp.year}/${bp.month}`);

  // Create room billing
  const rb = await prisma.roomBilling.create({
    data: {
      id: uuidv4(),
      billingPeriodId: bp.id,
      roomNo: ROOM,
      recvAccountId: 'ACC_F1',
      ruleCode: 'STANDARD',
      rentAmount: 5000,
      waterMode: 'NORMAL',
      electricMode: 'NORMAL',
      status: 'DRAFT',
    },
  });
  console.log(`✓ Room billing: ${rb.id.slice(0, 8)}`);

  // Create invoice
  const invoice = await prisma.invoice.create({
    data: {
      id: uuidv4(),
      roomNo: ROOM,
      roomBillingId: rb.id,
      year: 2026,
      month: 4,
      totalAmount: 5500,
      dueDate: new Date('2026-04-30'),
      issuedAt: new Date(),
      status: 'GENERATED',
    },
  });
  console.log(`✓ Invoice: ${invoice.id.slice(0, 8)}, amount=฿${invoice.totalAmount}`);
  console.log('');

  // Bootstrap EventBus handlers
  console.log('📋 STEP 2: Bootstrap EventBus handlers...');
  console.log('─'.repeat(60));
  await bootstrapMessagingRuntime({ allowInTest: true });
  console.log('✓ Messaging runtime bootstrapped');
  const bus = getEventBus();
  const count = bus.getHandlerCount(EventTypes.INVOICE_GENERATED);
  console.log(`✓ InvoiceGenerated handlers: ${count}`);
  console.log('');

  // Publish InvoiceGenerated event to EventBus
  console.log('📋 STEP 3: Publish InvoiceGenerated event → EventBus...');
  console.log('─'.repeat(60));
  await bus.publish(
    EventTypes.INVOICE_GENERATED,
    'Invoice',
    invoice.id,
    {
      invoiceId: invoice.id,
      roomId: uuidv4(),
      roomNumber: ROOM,
      billingRecordId: rb.id,
      year: 2026,
      month: 4,
      version: 1,
      subtotal: 5000,
      total: 5500,
      dueDate: new Date('2026-04-30'),
    }
  );
  console.log('✓ Event published\n');

  // Cleanup
  console.log('📋 CLEANUP...');
  await prisma.invoice.deleteMany({ where: { id: invoice.id } });
  await prisma.roomBilling.deleteMany({ where: { id: rb.id } });
  await prisma.roomTenant.deleteMany({ where: { roomNo: ROOM } });
  await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  await prisma.room.deleteMany({ where: { roomNo: ROOM } });
  console.log('✓ Cleanup done');
  await prisma.$disconnect();
}

main().catch(console.error);
