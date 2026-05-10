import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { addMonths, subMonths } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding sample data...');

  // Get some rooms
  const rooms = await prisma.room.findMany({ take: 20 });
  const bankAccounts = await prisma.bankAccount.findMany();
  const billingRules = await prisma.billingRule.findMany();

  if (rooms.length === 0) {
    console.log('No rooms found');
    return;
  }

  // Create sample tenants
  const tenantData = [
    { firstName: 'สมชาย', lastName: 'คำวัน', phone: '0812345670', email: 'somchai@email.com' },
    { firstName: 'ปราณี', lastName: 'ดีใจ', phone: '0812345671', email: 'prani@email.com' },
    { firstName: 'นวลนัก', lastName: 'บุญชา', phone: '0812345672', email: 'nuan@email.com' },
    { firstName: 'สิรินทร์', lastName: 'จันทร์สูง', phone: '0812345673', email: 'sirint@email.com' },
    { firstName: 'จิตรา', lastName: 'สวยงาม', phone: '0812345674', email: 'chitra@email.com' },
    { firstName: 'วิชัย', lastName: 'ศรีสว่าง', phone: '0812345675', email: 'vichai@email.com' },
    { firstName: 'ดวงพร', lastName: 'ยิ่งสมบูรณ์', phone: '0812345676', email: 'duang@email.com' },
    { firstName: 'มีชัย', lastName: 'โชคดี', phone: '0812345677', email: 'meechai@email.com' },
  ];

  const createdTenants = [];
  for (const t of tenantData) {
    // Check if tenant with this email already exists
    const existing = await prisma.tenant.findFirst({
      where: { email: t.email },
    });

    let tenant;
    if (existing) {
      tenant = existing;
    } else {
      tenant = await prisma.tenant.create({
        data: t,
      });
    }
    createdTenants.push(tenant);
  }
  console.log(`Created/updated ${createdTenants.length} tenants`);

  // Create contracts for some rooms
  let contractCount = 0;
  for (let i = 0; i < Math.min(10, rooms.length); i++) {
    const tenant = createdTenants[i % createdTenants.length];
    const room = rooms[i];

    const existingContract = await prisma.contract.findFirst({
      where: {
        roomNo: room.roomNo,
        primaryTenantId: tenant.id,
        status: 'ACTIVE',
      },
    });

    if (!existingContract) {
      const startDate = subMonths(new Date(), Math.floor(Math.random() * 12));
      const endDate = addMonths(startDate, 12);

      await prisma.contract.create({
        data: {
          roomNo: room.roomNo,
          primaryTenantId: tenant.id,
          startDate,
          endDate,
          monthlyRent: room.defaultRentAmount,
          deposit: room.defaultRentAmount * 2,
        },
      });
      contractCount++;
    }
  }
  console.log(`Created ${contractCount} new contracts`);

  // Create billing periods (current and previous months)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  // Check if periods already exist
  let currentPeriod = await prisma.billingPeriod.findFirst({
    where: { year: currentYear, month: currentMonth }
  });

  if (!currentPeriod) {
    currentPeriod = await prisma.billingPeriod.create({
      data: {
        year: currentYear,
        month: currentMonth,
        status: 'OPEN',
        dueDay: 25,
        gracePeriodDays: 3
      }
    });
  }

  let previousPeriod = await prisma.billingPeriod.findFirst({
    where: { year: previousYear, month: previousMonth }
  });

  if (!previousPeriod) {
    previousPeriod = await prisma.billingPeriod.create({
      data: {
        year: previousYear,
        month: previousMonth,
        status: 'CLOSED',
        dueDay: 25,
        gracePeriodDays: 3
      }
    });
  }

  console.log('Billing periods ready for invoicing');

  // Create room billings for sample rooms
  const defaultRule = billingRules[0];
  const defaultAccount = bankAccounts[0];
  let billingCount = 0;

  for (let i = 0; i < Math.min(5, rooms.length); i++) {
    const room = rooms[i];

    // Create billing for previous month (for testing overdue invoices)
    const existingBilling = await prisma.roomBilling.findFirst({
      where: {
        roomNo: room.roomNo,
        billingPeriodId: previousPeriod.id
      }
    });

    if (!existingBilling) {
      const roomBilling = await prisma.roomBilling.create({
        data: {
          billingPeriodId: previousPeriod.id,
          roomNo: room.roomNo,
          recvAccountId: defaultAccount.id,
          ruleCode: defaultRule.code,
          rentAmount: room.defaultRentAmount,
          waterMode: 'NORMAL',
          electricMode: 'NORMAL',
          waterUnits: new Decimal(15),
          waterUsageCharge: new Decimal(300),
          electricUnits: new Decimal(250),
          electricUsageCharge: new Decimal(2500),
          totalDue: room.defaultRentAmount.plus(300).plus(2500),
          status: 'LOCKED'
        }
      });

      // Create invoice for this billing
      const dueDate = new Date(previousYear, previousMonth - 1, 25);
      await prisma.invoice.create({
        data: {
          roomBillingId: roomBilling.id,
          roomNo: room.roomNo,
          year: previousYear,
          month: previousMonth,
          status: 'GENERATED',
          totalAmount: roomBilling.totalDue,
          dueDate,
          issuedAt: new Date(previousYear, previousMonth - 1, 1),
        }
      });

      billingCount++;
    }
  }

  console.log(`Created ${billingCount} sample billings and invoices`);

  console.log('\n✅ Sample data added successfully!');
  console.log(`Summary: ${createdTenants.length} tenants, ${contractCount} contracts, ${billingCount} billings`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
