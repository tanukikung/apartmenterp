/**
 * Migration Script: Fix Data Integrity Issues
 *
 * Run with: npx ts-node --project tsconfig.json scripts/fix-data-integrity.ts
 *
 * Issues addressed:
 * 1. OVERDUE status set at creation time (should be derived on read)
 * 2. PAID status without sufficient payment records
 * 3. OCCUPIED rooms without active contracts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DATA INTEGRITY MIGRATION ===\n');

  await fixOverdueWithoutDueDate();
  await fixPaidWithoutPayment();
  await fixOccupiedWithoutContract();

  console.log('\n=== MIGRATION COMPLETE ===');
}

async function fixOverdueWithoutDueDate() {
  console.log('\n--- ISSUE 1: Fix OVERDUE invoices where dueDate >= today ---');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find OVERDUE invoices where dueDate is NOT in the past
  const badOverdue = await prisma.$queryRaw<{ id: string; roomNo: string; dueDate: Date; totalAmount: string }[]>`
    SELECT id, "roomNo", "dueDate", "totalAmount"::text
    FROM invoices
    WHERE status = 'OVERDUE'
      AND "dueDate" >= ${today}
  `;

  console.log(`  Found ${badOverdue.length} OVERDUE invoices with dueDate >= today`);

  if (badOverdue.length > 0) {
    for (const inv of badOverdue) {
      console.log(`    - ${inv.id} (room ${inv.roomNo}, due ${inv.dueDate.toISOString().split('T')[0]})`);
    }

    await prisma.$transaction(
      badOverdue.map((inv) =>
        prisma.invoice.update({
          where: { id: inv.id },
          data: { status: 'GENERATED' },
        })
      )
    );

    console.log(`  Fixed ${badOverdue.length} invoices — downgraded from OVERDUE to GENERATED`);
  } else {
    console.log('  No issues found');
  }

  // Summary of OVERDUE invoices
  const overdueCount = await prisma.invoice.count({ where: { status: 'OVERDUE' } });
  console.log(`  Total OVERDUE invoices in DB: ${overdueCount}`);
}

async function fixPaidWithoutPayment() {
  console.log('\n--- ISSUE 2: Fix PAID invoices without sufficient payment records ---');

  // Find PAID invoices
  const paidInvoices = await prisma.invoice.findMany({
    where: { status: 'PAID' },
    include: {
      payments: {
        where: { status: 'CONFIRMED' },
      },
    },
  });

  const issues: { id: string; roomNo: string; totalAmount: number; paidAmount: number }[] = [];

  for (const inv of paidInvoices) {
    const paidAmount = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalAmount = Number(inv.totalAmount);
    const lateFeeAmount = Number(inv.lateFeeAmount ?? 0);
    const totalOwed = totalAmount + lateFeeAmount;
    const EPSILON = Math.max(0.01, totalOwed * 0.0001);

    if (Math.abs(paidAmount - totalOwed) > EPSILON) {
      issues.push({ id: inv.id, roomNo: inv.roomNo, totalAmount: totalOwed, paidAmount });
    }
  }

  console.log(`  Found ${issues.length} PAID invoices without sufficient payment`);

  if (issues.length > 0) {
    for (const inv of issues) {
      console.log(`    - ${inv.id} (room ${inv.roomNo}): paid ฿${inv.paidAmount.toFixed(2)} but owed ฿${inv.totalAmount.toFixed(2)}`);
    }

    await prisma.$transaction(
      issues.map((inv) =>
        prisma.invoice.update({
          where: { id: inv.id },
          data: { status: 'OVERDUE', paidAt: null },
        })
      )
    );

    console.log(`  Fixed ${issues.length} invoices — downgraded from PAID to OVERDUE, paidAt cleared`);
  } else {
    console.log('  No issues found');
  }

  console.log(`  Total PAID invoices in DB: ${paidInvoices.length}`);
}

async function fixOccupiedWithoutContract() {
  console.log('\n--- ISSUE 3: Fix OCCUPIED rooms without active contract ---');

  // Find OCCUPIED rooms with no active contract
  const orphaned = await prisma.$queryRaw<{ roomNo: string }[]>`
    SELECT r."roomNo"
    FROM rooms r
    WHERE r."roomStatus" = 'OCCUPIED'
      AND NOT EXISTS (
        SELECT 1 FROM contracts c
        WHERE c."roomNo" = r."roomNo" AND c.status = 'ACTIVE'
      )
  `;

  console.log(`  Found ${orphaned.length} OCCUPIED rooms without active contract`);

  if (orphaned.length > 0) {
    for (const room of orphaned) {
      console.log(`    - room ${room.roomNo}`);
    }

    await prisma.$transaction(
      orphaned.map((room) =>
        prisma.room.update({
          where: { roomNo: room.roomNo },
          data: { roomStatus: 'VACANT' },
        })
      )
    );

    console.log(`  Fixed ${orphaned.length} rooms — set to VACANT`);
  } else {
    console.log('  No issues found');
  }

  const occupiedCount = await prisma.room.count({ where: { roomStatus: 'OCCUPIED' } });
  console.log(`  Total OCCUPIED rooms in DB: ${occupiedCount}`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
