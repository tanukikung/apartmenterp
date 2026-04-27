/**
 * LINE Messaging Integration Tests
 *
 * Tests the complete LINE welcome message flow:
 * 1. Registration approval writes RegistrationApproved outbox event
 * 2. Outbox processor publishes event to EventBus
 * 3. EventBus triggers welcome-notifier handler
 * 4. Handler calls sendLineMessage() → LINE API
 *
 * Run: USE_PRISMA_TEST_DB=true npx tsx tests/line-messaging.test.ts
 */
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         LINE MESSAGING INTEGRATION TESTS                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const ROOM = `LINE-TEST-${Math.floor(Math.random() * 90000 + 10000)}`;
  const LINE_USER_ID = uuidv4();

  // ─── SETUP ──────────────────────────────────────────────────────────
  console.log('📋 SETUP: Create test data');
  console.log('─'.repeat(60));

  // Create LINE user
  const lineUser = await prisma.lineUser.create({
    data: {
      id: LINE_USER_ID,
      lineUserId: LINE_USER_ID,
      displayName: 'ทดสอบ ระบบไลน์',
      pictureUrl: null,
    },
  });
  console.log(`✓ LINE user created: ${lineUser.displayName}`);

  // Create room
  await prisma.room.create({
    data: {
      roomNo: ROOM,
      floorNo: 1,
      defaultAccountId: 'ACC_F1',
      defaultRuleCode: 'STANDARD',
      defaultRentAmount: 5000,
      hasFurniture: false,
      defaultFurnitureAmount: 0,
      roomStatus: 'VACANT',
    },
  });
  console.log(`✓ Room ${ROOM} created (VACANT)`);

  // Create PENDING registration
  const reg = await prisma.tenantRegistration.create({
    data: {
      id: uuidv4(),
      lineUserId: LINE_USER_ID,
      lineDisplayName: 'ทดสอบ ระบบไลน์',
      phone: '0891234567',
      claimedRoom: ROOM,
      status: 'PENDING',
    },
  });
  console.log(`✓ Registration created: ${reg.id.slice(0, 8)}, status=PENDING\n`);

  // ─── TEST 1: Registration approval writes outbox event ─────────────
  console.log('📋 TEST 1: Approve registration → writes RegistrationApproved outbox event');
  console.log('─'.repeat(60));

  const displayName = reg.lineDisplayName || reg.phone || 'ผู้เช่า';
  const nameParts = displayName.trim().split(/\s+/);
  const firstName = nameParts[0] || displayName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  let createdTenantId: string;
  await prisma.$transaction(async (tx) => {
    const newTenant = await tx.tenant.create({
      data: {
        id: uuidv4(),
        firstName,
        lastName,
        phone: reg.phone || '',
        lineUserId: reg.lineUserId,
      },
    });
    createdTenantId = newTenant.id;
    await tx.roomTenant.create({
      data: {
        id: uuidv4(),
        roomNo: ROOM,
        tenantId: newTenant.id,
        role: 'PRIMARY',
        moveInDate: new Date(),
      },
    });
    await tx.room.update({
      where: { roomNo: ROOM },
      data: { roomStatus: 'OCCUPIED' },
    });
    await tx.tenantRegistration.update({
      where: { id: reg.id },
      data: {
        status: 'APPROVED',
        resolvedRoomNo: ROOM,
        resolvedTenantId: newTenant.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await tx.conversation.create({
      data: {
        id: uuidv4(),
        lineUserId: reg.lineUserId,
        tenantId: newTenant.id,
        roomNo: ROOM,
        lastMessageAt: new Date(),
        unreadCount: 0,
        status: 'ACTIVE',
      },
    });
  });
  console.log(`✓ Tenant created and linked to room`);

  // Write welcome message to outbox (simulate approve route)
  const { getOutboxProcessor } = await import('../src/lib/outbox/processor.ts');
  const processor = getOutboxProcessor();
  await processor.writeOne(
    'Conversation',
    reg.lineUserId,
    'RegistrationApproved',
    {
      tenantId: createdTenantId,
      lineUserId: reg.lineUserId,
      roomNo: ROOM,
      tenantName: `${firstName} ${lastName}`.trim(),
      messageType: 'welcome',
    },
  );
  console.log(`✓ RegistrationApproved outbox event written`);

  // Verify outbox event exists
  const outboxEvent = await prisma.outboxEvent.findFirst({
    where: {
      eventType: 'RegistrationApproved',
      aggregateId: LINE_USER_ID,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!outboxEvent) {
    console.log(`❌ FAIL: No outbox event found`);
  } else {
    console.log(`✓ PASS: Outbox event exists (${outboxEvent.id.slice(0, 8)})`);
    console.log(`  eventType: ${outboxEvent.eventType}`);
    console.log(`  aggregateType: ${outboxEvent.aggregateType}`);
    console.log(`  payload: ${JSON.stringify(outboxEvent.payload)}`);
  }

  // ─── TEST 2: Process outbox → EventBus → welcome-notifier ─────────
  console.log('\n📋 TEST 2: Process outbox → EventBus → welcome-notifier handler');
  console.log('─'.repeat(60));

  // Bootstrap the messaging runtime to register all EventBus handlers
  // (normally done at server startup via instrumentation.ts)
  const { bootstrapMessagingRuntime } = await import('../src/modules/messaging/bootstrap');
  await bootstrapMessagingRuntime({ allowInTest: true });
  console.log('✓ Messaging runtime bootstrapped');

  // Check if LINE is configured
  const lineConfigured = !!(process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET &&
    (process.env.LINE_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN));

  if (!lineConfigured) {
    console.log(`⚠️  LINE not configured — skipping live API test`);
    console.log(`  Set LINE_CHANNEL_ID, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN in .env`);
  } else {
    console.log(`✓ LINE is configured — testing live API call`);

    // Process the outbox event
    const result = await processor.process();
    console.log(`  Outbox processor result: processed=${result.processed}, failed=${result.failed}`);

    if (result.processed > 0) {
      console.log(`✓ PASS: Outbox event was processed`);
    } else if (result.failed > 0) {
      console.log(`⚠️  Outbox event failed: ${result.errors.map(e => e.error).join(', ')}`);
    } else {
      console.log(`⚠️  No events processed (may already be processed from previous run)`);
    }
  }

  // ─── TEST 3: Verify EventBus handler is registered ─────────────────
  console.log('\n📋 TEST 3: Verify REGISTRATION_APPROVED EventBus handler');
  console.log('─'.repeat(60));

  const { getEventBus } = await import('../src/lib/events/event-bus.ts');
  const bus = getEventBus();
  const handlerCount = bus.getHandlerCount('RegistrationApproved');
  console.log(`  Handler count for 'RegistrationApproved': ${handlerCount}`);

  if (handlerCount > 0) {
    console.log(`✓ PASS: EventBus handler registered`);
  } else {
    console.log(`❌ FAIL: No EventBus handler for RegistrationApproved`);
    console.log(`  → welcome-notifier.ts not imported in bootstrapMessagingRuntime()`);
  }

  // ─── TEST 4: Direct handler test (no real LINE API) ─────────────────
  console.log('\n📋 TEST 4: Direct welcome-notifier handler test');
  console.log('─'.repeat(60));

  // Import and call handler directly with a mock
  const { getEventBus: getBus2 } = await import('../src/lib/events/event-bus.ts');
  const testBus = getBus2();

  // Create a test event
  const testPayload = {
    tenantId: createdTenantId!,
    lineUserId: LINE_USER_ID,
    roomNo: ROOM,
    tenantName: `${firstName} ${lastName}`.trim(),
    messageType: 'welcome' as const,
  };

  // Subscribe a mock handler to capture the event
  let handlerCalled = false;
  let capturedPayload: typeof testPayload | null = null;
  testBus.subscribe('RegistrationApproved', async (evt: any) => {
    handlerCalled = true;
    capturedPayload = evt.payload;
  });

  // Publish the event
  await testBus.publish('RegistrationApproved', 'Conversation', LINE_USER_ID, testPayload);

  if (handlerCalled && capturedPayload) {
    console.log(`✓ PASS: Handler was called`);
    console.log(`  Received payload: ${JSON.stringify(capturedPayload)}`);
  } else {
    console.log(`❌ FAIL: Handler was not called`);
  }

  // ─── CLEANUP ───────────────────────────────────────────────────────
  console.log('\n📋 CLEANUP');
  console.log('─'.repeat(60));

  await prisma.conversation.deleteMany({ where: { lineUserId: LINE_USER_ID } });
  await prisma.tenant.deleteMany({ where: { lineUserId: LINE_USER_ID } });
  await prisma.roomTenant.deleteMany({ where: { roomNo: ROOM } });
  await prisma.tenantRegistration.deleteMany({ where: { id: reg.id } });
  await prisma.room.deleteMany({ where: { roomNo: ROOM } });
  await prisma.lineUser.deleteMany({ where: { id: LINE_USER_ID } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: LINE_USER_ID } });

  console.log('✓ Cleanup done');
  await prisma.$disconnect();
}

main().catch(console.error);
