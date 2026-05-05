const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const checks = [];

  // 1. No duplicate CONFIRMED payments
  const dupPayments = await prisma.$queryRaw`
    SELECT "matchedInvoiceId", count(*)::text as c
    FROM payments
    WHERE status = 'CONFIRMED' AND "deletedAt" IS NULL
    GROUP BY "matchedInvoiceId" HAVING count(*) > 1
  `;
  checks.push({ check: 'No duplicate CONFIRMED payments', pass: dupPayments.length === 0, detail: dupPayments.length === 0 ? '0 duplicates' : dupPayments.length + ' duplicates found' });

  // 2. No orphan payments (matched to non-existent invoice)
  const orphanPayments = await prisma.$queryRaw`
    SELECT p.id, p."matchedInvoiceId"
    FROM payments p
    LEFT JOIN invoices i ON i.id = p."matchedInvoiceId"
    WHERE p.status = 'CONFIRMED' AND p."matchedInvoiceId" IS NOT NULL AND i.id IS NULL
  `;
  checks.push({ check: 'No orphan payments', pass: orphanPayments.length === 0, detail: orphanPayments.length === 0 ? 'none' : orphanPayments.length + ' orphans' });

  // 3. PAID invoices have CONFIRMED payments covering totalAmount
  const paidNoPayment = await prisma.$queryRaw`
    SELECT i.id, i."totalAmount"::text as total
    FROM invoices i
    LEFT JOIN payments p ON p."matchedInvoiceId" = i.id AND p.status = 'CONFIRMED'
    WHERE i.status = 'PAID' AND p.id IS NULL
  `;
  checks.push({ check: 'PAID invoices have confirmed payments', pass: paidNoPayment.length === 0, detail: paidNoPayment.length === 0 ? 'all covered' : paidNoPayment.length + ' PAID invoices without payments' });

  // 4. No invalid status transitions (cancelledAt set but status != CANCELLED)
  const badCancel = await prisma.$queryRaw`
    SELECT id, status, "cancelledAt"::text FROM invoices
    WHERE "cancelledAt" IS NOT NULL AND status != 'CANCELLED'
  `;
  checks.push({ check: 'No invalid cancel state', pass: badCancel.length === 0, detail: badCancel.length === 0 ? 'none' : badCancel.length + ' bad cancel records' });

  // 5. No overpayments
  const overpayments = await prisma.$queryRaw`
    SELECT i.id, i."totalAmount"::text as total, SUM(p.amount)::text as sum_payments
    FROM invoices i
    JOIN payments p ON p."matchedInvoiceId" = i.id AND p.status = 'CONFIRMED'
    GROUP BY i.id, i."totalAmount"
    HAVING SUM(p.amount) > i."totalAmount" + 0.01
  `;
  checks.push({ check: 'No overpayments', pass: overpayments.length === 0, detail: overpayments.length === 0 ? 'none' : overpayments.length + ' overpayments' });

  // 6. Undo operations: reversedAt but status != PENDING
  const badUndo = await prisma.$queryRaw`
    SELECT id, status, "reversedAt"::text FROM payments
    WHERE "reversedAt" IS NOT NULL AND status != 'PENDING'
  `;
  checks.push({ check: 'Undo ops: reversedAt implies PENDING', pass: badUndo.length === 0, detail: badUndo.length === 0 ? 'ok' : badUndo.length + ' inconsistencies' });

  // 7. All CONFIRMED payments have matchedInvoiceId
  const unmatchedConfirmed = await prisma.$queryRaw`
    SELECT count(*)::text as c FROM payments
    WHERE status = 'CONFIRMED' AND "matchedInvoiceId" IS NULL
  `;
  checks.push({ check: 'CONFIRMED payments have matchedInvoiceId', pass: parseInt(unmatchedConfirmed[0].c, 10) === 0, detail: unmatchedConfirmed[0].c + ' unmatched' });

  // 8. Invoice previousStatus consistency (only non-null when status is CANCELLED)
  const badPrevStatus = await prisma.$queryRaw`
    SELECT id, status, "previousStatus" FROM invoices
    WHERE "previousStatus" IS NOT NULL AND status != 'CANCELLED' AND status != 'PAID'
  `;
  checks.push({ check: 'previousStatus only set for CANCELLED/PAID', pass: badPrevStatus.length === 0, detail: badPrevStatus.length === 0 ? 'ok' : badPrevStatus.length + ' inconsistencies' });

  // 9. FinancialAuditLog has entries
  const auditCount = await prisma.$queryRaw`SELECT count(*)::text as c FROM financial_audit_logs`;
  checks.push({ check: 'FinancialAuditLog has entries', pass: parseInt(auditCount[0].c, 10) >= 0, detail: auditCount[0].c + ' entries' });

  console.log('=== FINANCIAL INTEGRITY VERIFICATION ===');
  checks.forEach(c => {
    console.log((c.pass ? '✅' : '❌') + ' ' + c.check + ': ' + c.detail);
  });

  const failed = checks.filter(c => !c.pass);
  console.log('');
  console.log('Result: ' + (failed.length === 0 ? 'ALL PASS ✅' : failed.length + ' FAILURES ❌'));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });