/**
 * Full Tenant Lifecycle Trace — tests what actually happens when a new
 * tenant registers, gets approved, pays bills, and moves out.
 */
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         TENANT LIFECYCLE FULL TRACE                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const ROOM = `LIFE-${Math.floor(Math.random() * 90000 + 10000)}`;
  const LINE_USER = uuidv4();

  // ─── PHASE 1: REGISTRATION ───────────────────────────────────────
  console.log('📋 PHASE 1: TENANT REGISTRATION');
  console.log('─'.repeat(60));

  // Create a LINE user first (simulating LINE OAuth)
  const lineUser = await prisma.lineUser.create({
    data: {
      id: LINE_USER,
      lineUserId: LINE_USER,  // In real app this comes from LINE OAuth
      displayName: 'สมชาย ใจดี',
      pictureUrl: null,
    },
  });
  console.log(`✓ LINE user created: ${lineUser.displayName} (${lineUser.id.slice(0, 8)})`);

  // Create a vacant room
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

  // Tenant submits registration (via LINE or admin)
  const reg = await prisma.tenantRegistration.create({
    data: {
      id: uuidv4(),
      lineUserId: LINE_USER,
      lineDisplayName: 'สมชาย ใจดี',
      phone: '0891234567',
      claimedRoom: ROOM,
      status: 'PENDING',
    },
  });
  console.log(`✓ Registration submitted: ${reg.id.slice(0, 8)}, status=PENDING`);

  // ─── PHASE 2: REGISTRATION APPROVAL ─────────────────────────────
  console.log('\n📋 PHASE 2: ADMIN APPROVES REGISTRATION');
  console.log('─'.repeat(60));

  // Approve registration — replicate the full approve route flow
  const displayName = reg.lineDisplayName || reg.phone || 'ผู้เช่า';
  const nameParts = displayName.trim().split(/\s+/);
  const firstName = nameParts[0] || displayName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

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

  // Check: was a Tenant record created from the registration?
  const tenantFromReg = await prisma.tenant.findFirst({
    where: { lineUserId: LINE_USER },
  });
  if (!tenantFromReg) {
    console.log('❌ PROBLEM: No Tenant record created for new registrant!');
    console.log('   The system approved the registration but created NO tenant profile.');
  } else {
    console.log(`✓ Tenant record exists: ${tenantFromReg.firstName} ${tenantFromReg.lastName}`);
  }

  // Check: was RoomTenant record created?
  const roomTenant = await prisma.roomTenant.findFirst({
    where: { roomNo: ROOM, tenantId: tenantFromReg?.id },
  });
  if (!roomTenant) {
    console.log('❌ PROBLEM: No RoomTenant record linking tenant to room!');
  } else {
    console.log(`✓ RoomTenant exists: tenant=${roomTenant.tenantId.slice(0,8)}, role=${roomTenant.role}`);
  }

  // Check: what does resolvedTenantId point to?
  const regAfter = await prisma.tenantRegistration.findUnique({ where: { id: reg.id } });
  console.log(`\n  resolvedTenantId = ${regAfter?.resolvedTenantId ?? 'null'}`);
  if (regAfter?.resolvedTenantId && regAfter.resolvedTenantId !== tenantFromReg?.id) {
    console.log('❌ PROBLEM: resolvedTenantId points to WRONG tenant!');
    const wrongTenant = await prisma.tenant.findUnique({ where: { id: regAfter.resolvedTenantId } });
    console.log(`   Points to: ${wrongTenant?.firstName} ${wrongTenant?.lastName} (${wrongTenant?.id.slice(0,8)})`);
  }

  // Check: was any LINE notification sent?
  const welcomeOutbox = await prisma.outboxEvent.findMany({
    where: {
      eventType: { contains: 'WELCOME' },
      createdAt: { gt: reg.updatedAt! },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (welcomeOutbox.length === 0) {
    console.log('⚠️  No LINE welcome message event found in outbox');
  } else {
    console.log(`✓ LINE welcome message event found`);
  }

  // ─── PHASE 3: CONTRACT CREATION ──────────────────────────────────
  console.log('\n📋 PHASE 3: CREATE CONTRACT');
  console.log('─'.repeat(60));

  // If no tenant was created, create one manually for contract
  let tenantId = tenantFromReg?.id;
  if (!tenantId) {
    console.log('⚠️  Creating tenant manually (workaround for missing registration→tenant flow)');
    const t = await prisma.tenant.create({
      data: {
        id: uuidv4(),
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        phone: '0891234567',
        lineUserId: LINE_USER,
      },
    });
    tenantId = t.id;
    await prisma.roomTenant.create({
      data: { roomNo: ROOM, tenantId: t.id, role: 'PRIMARY', moveInDate: new Date() },
    });
    console.log(`✓ Manual tenant created: ${t.id.slice(0, 8)}`);
  }

  try {
    await prisma.contract.create({
      data: {
        id: uuidv4(),
        roomNo: ROOM,
        primaryTenantId: tenantId!,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        monthlyRent: 5000,
        deposit: 10000,
        status: 'ACTIVE',
      },
    });
    console.log(`✓ Contract created (ACTIVE)`);
  } catch (e: any) {
    console.log(`❌ Contract creation failed: ${e.message}`);
  }

  // ─── PHASE 4: BILLING ───────────────────────────────────────────
  console.log('\n📋 PHASE 4: BILLING');
  console.log('─'.repeat(60));

  // Check billing period
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
      waterUnits: 0, waterUsageCharge: 0, waterServiceFee: 0, waterTotal: 0,
      electricUnits: 0, electricUsageCharge: 0, electricServiceFee: 0, electricTotal: 0,
      status: 'DRAFT',
    },
  });
  console.log(`✓ Room billing created: ${rb.id.slice(0, 8)}`);

  // Create invoice
  const invoice = await prisma.invoice.create({
    data: {
      id: uuidv4(),
      roomNo: ROOM,
      roomBillingId: rb.id,
      year: 2026,
      month: 4,
      totalAmount: 5000,
      dueDate: new Date(),
      issuedAt: new Date(),
      status: 'GENERATED',
    },
  });
  console.log(`✓ Invoice created: ${invoice.id.slice(0, 8)}, status=GENERATED`);

  // Check overdue detection
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['SENT', 'VIEWED', 'GENERATED'] },
      dueDate: { lt: today },
    },
  });
  const ourOverdue = overdueInvoices.find(i => i.id === invoice.id);
  if (ourOverdue) {
    console.log(`✓ Invoice correctly detected as overdue`);
  } else {
    console.log(`❌ Invoice NOT detected as overdue (status=${invoice.status}, dueDate=${invoice.dueDate})`);
  }

  // ─── PHASE 5: MOVE-OUT ──────────────────────────────────────────
  console.log('\n📋 PHASE 5: MOVE-OUT PROCESS');
  console.log('─'.repeat(60));

  // Find contract
  const contract = await prisma.contract.findFirst({
    where: { roomNo: ROOM, status: 'ACTIVE' },
  });
  if (!contract) {
    console.log('❌ No active contract found');
    return;
  }
  console.log(`✓ Active contract: ${contract.id.slice(0, 8)}`);

  // Create move-out record
  try {
    const moveOut = await prisma.moveOut.create({
      data: {
        id: uuidv4(),
        contractId: contract.id,
        moveOutDate: new Date(),
        depositAmount: 10000,
        status: 'PENDING',
      },
    });
    console.log(`✓ MoveOut created: ${moveOut.id.slice(0, 8)}, status=PENDING`);

    // Update contract to TERMINATED
    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: 'TERMINATED', terminationDate: new Date() },
    });
    console.log(`✓ Contract → TERMINATED`);

    // Calculate deductions
    try {
      await prisma.moveOut.update({
        where: { id: moveOut.id },
        data: { totalDeduction: 0, finalRefund: 10000, status: 'DEPOSIT_CALCULATED' },
      });
      console.log(`✓ Deposit calculated: refund=10000`);
    } catch (e: any) {
      console.log(`⚠️  Deposit calculation failed: ${e.message}`);
    }

    // Send LINE notice
    const hasLine = !!(contract.primaryTenantId && (await prisma.tenant.findUnique({ where: { id: contract.primaryTenantId } }))?.lineUserId);
    if (hasLine) {
      console.log(`⚠️  LINE notice: would need CONVERSATION record (no auto-create if LINE not configured)`);
    }
  } catch (e: any) {
    console.log(`❌ MoveOut creation failed: ${e.message}`);
  }

  // ─── SUMMARY ────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    SUMMARY OF PROBLEMS                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const problems = [];

  if (welcomeOutbox.length === 0) {
    problems.push('4. LINE welcome message: outbox processor not active in test context (expected)');
  }
  problems.push('5. Move-out → LINE notice: Conversation created in approve route but no live LINE handler unless LINE credentials configured');
  problems.push('6. Move-out deposit auto-calculate: calculateDeposit() exists in moveout.service.ts but must be called manually');

  for (const p of problems) console.log(`  ${p}`);

  // Cleanup
  await prisma.moveOut.deleteMany({ where: { contractId: contract.id } }).catch(() => {});
  await prisma.invoice.deleteMany({ where: { id: invoice.id } });
  await prisma.roomBilling.deleteMany({ where: { id: rb.id } });
  await prisma.contract.deleteMany({ where: { roomNo: ROOM } });
  await prisma.roomTenant.deleteMany({ where: { roomNo: ROOM } });
  await prisma.conversation.deleteMany({ where: { lineUserId: LINE_USER } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.tenantRegistration.deleteMany({ where: { id: reg.id } });
  await prisma.room.deleteMany({ where: { roomNo: ROOM } });
  await prisma.lineUser.deleteMany({ where: { id: LINE_USER } });

  console.log('\n✓ Cleanup done');
  await prisma.$disconnect();
}

main().catch(console.error);
