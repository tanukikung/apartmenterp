import { PrismaClient } from '@prisma/client';
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

  console.log('Invoices and payments managed through billing system');

  console.log('\n✅ Sample data added successfully!');
  console.log(`Summary: ${createdTenants.length} tenants, ${contractCount} contracts ready`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
