const { PrismaClient, Prisma } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

async function test() {
  // Get first billing period
  const p = await prisma.billingPeriod.findFirst({ where: { year: 2025, month: 1 } });
  console.log('Period:', p?.id?.slice(0,8), 'status:', p?.status);

  // Step 1: Lock all DRAFT billings
  const lockResult = await prisma.roomBilling.updateMany({
    where: { billingPeriodId: p.id, status: 'DRAFT' },
    data: { status: 'LOCKED' },
  });
  console.log('Locked:', lockResult.count, 'records');

  // Update period to LOCKED
  await prisma.billingPeriod.update({
    where: { id: p.id },
    data: { status: 'LOCKED' },
  });

  // Get locked billings
  const billings = await prisma.roomBilling.findMany({
    where: { billingPeriodId: p.id, status: 'LOCKED' },
    take: 3,
  });
  console.log('Billings:', billings.map(b => b.roomNo));

  // Try direct invoice generation
  for (const billing of billings) {
    console.log('\nGenerating invoice for:', billing.roomNo);
    try {
      // Check for existing invoice
      const existing = await prisma.invoice.findUnique({
        where: { roomBillingId: billing.id },
      });
      if (existing) {
        console.log('  Already has invoice:', existing.id.slice(0,8));
        continue;
      }

      // Get the room's tenant
      const roomTenant = await prisma.roomTenant.findFirst({
        where: { roomNo: billing.roomNo, role: 'PRIMARY' },
        include: { tenant: true },
      });

      // Get billing period details
      const period = await prisma.billingPeriod.findUnique({ where: { id: billing.billingPeriodId } });

      // Get contract
      const contract = await prisma.contract.findFirst({
        where: { roomNo: billing.roomNo, status: 'ACTIVE' },
      });

      // Generate invoice using raw SQL approach
      const invoiceId = uuidv4();
      await prisma.$executeRaw`
        INSERT INTO "invoices" (
          "id", "roomNo", "billingPeriodId", "tenantId", "contractId",
          "issueDate", "dueDate", "status",
          "periodStart", "periodEnd",
          "rentAmount", "waterAmount", "electricAmount", "furnitureAmount", "otherAmount", "totalAmount",
          "roomBillingId"
        ) VALUES (
          ${invoiceId},
          ${billing.roomNo},
          ${billing.billingPeriodId},
          ${roomTenant?.tenantId ?? null},
          ${contract?.id ?? null},
          ${new Date()},
          ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)},
          ${'GENERATED'},
          ${new Date(period.year, period.month - 1, 1)},
          ${new Date(period.year, period.month, 0)},
          ${billing.rentAmount},
          ${billing.waterTotal ?? 0},
          ${billing.electricTotal ?? 0},
          ${billing.furnitureFee ?? 0},
          ${billing.otherFee ?? 0},
          ${billing.totalDue},
          ${billing.id}
        )
      `;
      console.log('  SUCCESS, invoice:', invoiceId.slice(0,8));
    } catch(e) {
      console.log('  Error:', e.code, e.message.split('\n').slice(0,2).join(' | '));
    }
  }

  const invCount = await prisma.invoice.count();
  console.log('\nTotal invoices:', invCount);

  await prisma.$disconnect();
}

test().catch(console.error);