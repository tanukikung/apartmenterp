/**
 * Simulate realistic system state: invoices, payments, maintenance, notifications, audit
 */
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

const THAI_ISSUES = [
  'เตาแม็กไฟไม่ติด', 'เครื่องปรับอากาศไม่เย็น', 'ประตูห้องน้ำติดขัด',
  'ท่อน้ำรั่ว', 'สวิตช์ไฟชำรุด', 'ม่านบังแดดขาด', 'กระจกร้าว',
];

async function randomDate(daysBack) {
  return new Date(Date.now() - Math.random() * daysBack * 24 * 60 * 60 * 1000);
}

async function simulate() {
  console.log('=== SIMULATING REALISTIC SYSTEM STATE ===\n');

  // 1. Update invoice timestamps
  console.log('Updating invoice timestamps...');
  const invoices = await prisma.invoice.findMany({ orderBy: [{ year: 'asc' }, { month: 'asc' }] });
  for (const inv of invoices) {
    const updates = {};
    if (['SENT', 'PAID', 'OVERDUE'].includes(inv.status) && !inv.sentAt) {
      updates.sentAt = await randomDate(5);
    }
    if (inv.status === 'PAID' && !inv.paidAt) {
      updates.paidAt = await randomDate(25);
    }
    if (Object.keys(updates).length > 0) {
      await prisma.invoice.update({ where: { id: inv.id }, data: updates });
    }
  }
  console.log('  Done');

  // 2. Payment transactions for PAID invoices (only new ones)
  console.log('Creating payment transactions...');
  const paidInvoices = invoices.filter(i => i.status === 'PAID');
  let paymentsCreated = 0;

  for (const inv of paidInvoices) {
    const existingPayments = await prisma.paymentTransaction.count({ where: { invoiceId: inv.id } });
    if (existingPayments > 0) continue;

    const paymentCount = Math.random() < 0.9 ? 1 : 2;
    const totalAmount = parseFloat(inv.totalAmount);

    for (let p = 0; p < paymentCount; p++) {
      const amount = p === paymentCount - 1 ? totalAmount : Math.floor(totalAmount * (0.4 + Math.random() * 0.4));
      await prisma.paymentTransaction.create({
        data: {
          amount: amount,
          transactionDate: await randomDate(25),
          roomNo: inv.roomNo,
          description: `Invoice ${inv.year}/${String(inv.month).padStart(2, '0')} payment`,
          reference: `REF-${uuidv4().slice(0, 8).toUpperCase()}`,
          sourceFile: 'bank_statement.xlsx',
          status: 'CONFIRMED',
          invoiceId: inv.id,
          confirmedAt: await randomDate(20),
          confirmedBy: 'system',
        },
      });
      paymentsCreated++;
    }
  }
  console.log(`  Created ${paymentsCreated} payment transactions`);

  // 3. Maintenance tickets
  console.log('Creating maintenance tickets...');
  const rooms = await prisma.room.findMany({ take: 50, select: { roomNo: true } });
  const statuses = ['OPEN', 'IN_PROGRESS', 'DONE'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  for (let i = 0; i < 25; i++) {
    const room = rooms[Math.floor(Math.random() * rooms.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const created = await randomDate(30);
    const issue = THAI_ISSUES[Math.floor(Math.random() * THAI_ISSUES.length)];
    const tenant = await prisma.roomTenant.findFirst({
      where: { roomNo: room.roomNo, role: 'PRIMARY' },
      select: { tenantId: true },
    });

    await prisma.maintenanceTicket.create({
      data: {
        roomNo: room.roomNo,
        tenantId: tenant?.tenantId ?? (await prisma.tenant.findFirst({ select: { id: true } })).id,
        title: issue,
        description: issue + ' - กรุณาตรวจสอบและซ่อมแซม',
        priority: priorities[Math.floor(Math.random() * priorities.length)],
        status,
        createdAt: created,
        updatedAt: new Date(created.getTime() + Math.random() * 3 * 24 * 60 * 60 * 1000),
      },
    });
  }
  console.log('  Created 25 maintenance tickets');

  // 4. Notifications
  console.log('Creating notification records...');
  const notifTypes = ['INVOICE_REMINDER', 'PAYMENT_REMINDER', 'NOTICE', 'CUSTOM'];

  for (let i = 0; i < 40; i++) {
    const type = notifTypes[Math.floor(Math.random() * notifTypes.length)];
    const room = rooms[Math.floor(Math.random() * rooms.length)];
    const created = await randomDate(14);

    let content = '';
    if (type === 'INVOICE_REMINDER') content = `ส่งใบแจ้งหนี้ห้อง ${room.roomNo} ผ่าน LINE แล้ว`;
    else if (type === 'PAYMENT_REMINDER') content = `ได้รับชำระเงินห้อง ${room.roomNo} ฿${Math.floor(Math.random() * 3000 + 2000).toLocaleString()}`;
    else if (type === 'OVERDUE_WARNING') content = `แจ้งเตือน: ค้างชำระห้อง ${room.roomNo}`;
    else content = `อัพเดทการซ่อมห้อง ${room.roomNo}`;

    await prisma.notification.create({
      data: {
        type,
        roomNo: room.roomNo,
        content,
        status: Math.random() < 0.2 ? 'FAILED' : 'SENT',
        scheduledAt: created,
        sentAt: Math.random() < 0.8 ? new Date(created.getTime() + 1000) : null,
        createdAt: created,
      },
    });
  }
  console.log('  Created 40 notifications');

  // 5. Audit logs
  console.log('Creating audit log entries...');
  const actionTypes = [
    'invoice.created', 'invoice.sent', 'invoice.paid',
    'payment.confirmed', 'room.status_changed', 'maintenance.created',
    'user.login', 'settings.updated',
  ];
  const entityTypes = ['Invoice', 'Payment', 'Room', 'Maintenance', 'User', 'Settings'];

  for (let i = 0; i < 25; i++) {
    const action = actionTypes[Math.floor(Math.random() * actionTypes.length)];
    const entityType = entityTypes[Math.floor(Math.random() * entityTypes.length)];
    const entityId = uuidv4();
    const userId = Math.random() < 0.8 ? 'owner-001' : 'staff-001';
    const userName = Math.random() < 0.8 ? 'owner' : 'staff';
    const room = rooms[Math.floor(Math.random() * rooms.length)];

    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        userId,
        userName,
        details: JSON.stringify({ ip: '192.168.1.' + Math.floor(Math.random() * 255), roomNo: room.roomNo }),
        createdAt: await randomDate(7),
        eventHash: uuidv4().replace(/-/g, ''),
      },
    });
  }
  console.log('  Created 25 audit logs');

  // 6. Outbox events
  console.log('Creating outbox events...');
  const eventTypes = ['LINE_MESSAGE_SENT', 'INVOICE_PDF_GENERATED', 'EMAIL_SENT'];

  for (let i = 0; i < 8; i++) {
    const evType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const inv = invoices[Math.floor(Math.random() * invoices.length)];
    const isProcessed = Math.random() < 0.85;

    await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Invoice',
        aggregateId: inv.id,
        eventType: evType,
        payload: { invoiceId: inv.id, roomNo: inv.roomNo, year: inv.year, month: inv.month },
        status: isProcessed ? 'PROCESSED' : 'PENDING',
        createdAt: await randomDate(2),
        processedAt: isProcessed ? new Date() : null,
      },
    });
  }
  console.log('  Created 8 outbox events');

  // Summary
  console.log('\n=== FINAL STATUS ===');

  const invStatus = await prisma.invoice.groupBy({ by: ['status'], _count: true });
  console.log('Invoices:', invStatus.map(s => `${s.status}: ${s._count}`).join(', '));

  const payStatus = await prisma.paymentTransaction.groupBy({ by: ['status'], _count: true });
  console.log('Payments:', payStatus.map(s => `${s.status}: ${s._count}`).join(', '));

  const maintStatus = await prisma.maintenanceTicket.groupBy({ by: ['status'], _count: true });
  console.log('Maintenance:', maintStatus.map(s => `${s.status}: ${s._count}`).join(', '));

  const notifStatus = await prisma.notification.groupBy({ by: ['status'], _count: true });
  console.log('Notifications:', notifStatus.map(s => `${s.status}: ${s._count}`).join(', '));

  const totalPayments = await prisma.paymentTransaction.aggregate({
    _sum: { amount: true },
    where: { status: 'CONFIRMED' },
  });
  console.log(`Total collected: ฿${Number(totalPayments._sum.amount || 0).toLocaleString()}`);

  const overdueCount = await prisma.invoice.count({ where: { status: 'OVERDUE' } });
  console.log(`Overdue invoices: ${overdueCount}`);

  await prisma.$disconnect();
}

simulate().catch(e => { console.error(e); process.exit(1); });