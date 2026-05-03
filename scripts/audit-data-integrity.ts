/**
 * Data Integrity Audit Script
 *
 * Comprehensive invariant checker for the Apartment ERP system.
 * Run: npm run audit:data-integrity
 * Auto-fix: npm run audit:data-integrity -- --fix
 * JSON output: npm run audit:data-integrity -- --format json
 *
 * Checks performed:
 *  1. PAID invoices without sufficient CONFIRMED payments
 *  2. PAID invoices with null paidAt
 *  3. OVERDUE invoices with future dueDate
 *  4. OCCUPIED rooms without ACTIVE contract
 *  5. Duplicate invoices per RoomBilling (unique constraint violation)
 *  6. (removed — hasActiveContract field removed from schema)
 *  7. Orphan RoomTenant records (tenant or room no longer exists)
 *  8. Invoice with cancelledAt set but status != CANCELLED
 *  9. Contract with ACTIVE status but deletedAt != null
 * 10. Invoice statusComputed mismatch with effective status
 */

import { PrismaClient } from '@prisma/client';
import { getEffectiveInvoiceStatus } from '../src/modules/invoices/status';

const prisma = new PrismaClient();

// ── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = !args.includes('--fix');
const format = args.includes('--format') ? 'json' : 'text';
const verbose = args.includes('--verbose');

// ── Result Types ────────────────────────────────────────────────────────────

interface AuditIssue {
  category: string;
  severity: 'ERROR' | 'WARN';
  count: number;
  details: Array<{ id: string; roomNo?: string; description: string }>;
}

interface AuditResults {
  passed: boolean;
  checkedAt: string;
  totalIssues: number;
  issues: AuditIssue[];
  fixedCount: number;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.error('=== DATA INTEGRITY AUDIT ===\n');

  if (dryRun) console.error('MODE: DRY RUN (use --fix to auto-correct)\n');

  const results: AuditResults = {
    passed: true,
    checkedAt: new Date().toISOString(),
    totalIssues: 0,
    issues: [],
    fixedCount: 0,
  };

  await checkPaidWithoutSufficientPayment(results);
  await checkPaidWithNullPaidAt(results);
  await checkOverdueWithFutureDueDate(results);
  await checkOccupiedWithoutActiveContract(results);
  await checkDuplicateInvoicesPerRoomBilling(results);
  // Check 6 removed — hasActiveContract field removed from schema (FM-11)
  await checkOrphanRoomTenants(results);
  await checkCancelledAtMismatch(results);
  await checkContractActiveWithDeletedAt(results);
  await checkStatusComputedMismatch(results);

  results.totalIssues = results.issues.reduce((sum, i) => sum + i.count, 0);
  results.passed = results.issues.filter(i => i.severity === 'ERROR').length === 0;

  // Output
  if (format === 'json') {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printTextReport(results);
  }

  await prisma.$disconnect();
  process.exit(results.passed ? 0 : 1);
}

function printTextReport(results: AuditResults) {
  const symbol = (ok: boolean) => ok ? '✅' : '❌';

  console.log(`Checked at: ${results.checkedAt}`);
  console.log(`Total issues: ${results.totalIssues}`);
  console.log(`Status: ${symbol(results.passed)} ${results.passed ? 'ALL CHECKS PASSED' : 'ISSUES FOUND'}\n`);

  for (const issue of results.issues) {
    const icon = issue.severity === 'ERROR' ? '❌' : '⚠️';
    console.log(`${icon} [${issue.category}] — ${issue.count} issue(s)`);
    if (verbose || issue.count <= 20) {
      for (const detail of issue.details) {
        const room = detail.roomNo ? ` (room ${detail.roomNo})` : '';
        console.log(`    - ${detail.id}${room}: ${detail.description}`);
      }
    } else {
      console.log(`    (run with --verbose for details)`);
    }
    console.log();
  }
}

// ── Check 1: PAID without sufficient payment ─────────────────────────────────

async function checkPaidWithoutSufficientPayment(results: AuditResults) {
  const issues: AuditIssue = {
    category: 'PAID_WITHOUT_SUFFICIENT_PAYMENT',
    severity: 'ERROR',
    count: 0,
    details: [],
  };

  const paidInvoices = await prisma.$queryRaw<Array<{ id: string; roomNo: string; totalAmount: string; lateFeeAmount: string }>>`
    SELECT i.id, i."roomNo", i."totalAmount"::text, COALESCE(i."lateFeeAmount"::text, '0') as "lateFeeAmount"
    FROM invoices i
    WHERE i.status = 'PAID'
  `;

  for (const inv of paidInvoices) {
    const totals = await prisma.payment.aggregate({
      where: { matchedInvoiceId: inv.id, status: 'CONFIRMED' },
      _sum: { amount: true },
    });
    const totalPaid = Number(totals._sum.amount ?? 0);
    const totalOwed = Number(inv.totalAmount) + Number(inv.lateFeeAmount);
    if (totalPaid < totalOwed - 0.01) { // small float tolerance
      issues.details.push({
        id: inv.id,
        roomNo: inv.roomNo,
        description: `paid ฿${totalPaid.toFixed(2)} but owed ฿${totalOwed.toFixed(2)}`,
      });
      issues.count++;

      if (!dryRun) {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { status: 'OVERDUE' as any, paidAt: null },
        });
      }
    }
  }

  if (issues.count > 0) {
    results.issues.push(issues);
    if (!dryRun) results.fixedCount += issues.count;
  }
}

// ── Check 2: PAID with null paidAt ───────────────────────────────────────────

async function checkPaidWithNullPaidAt(results: AuditResults) {
  const issues: AuditIssue = {
    category: 'PAID_WITH_NULL_PAID_AT',
    severity: 'ERROR',
    count: 0,
    details: [],
  };

  const bad = await prisma.$queryRaw<Array<{ id: string; roomNo: string }>>`
    SELECT id, "roomNo" FROM invoices
    WHERE status = 'PAID' AND "paidAt" IS NULL
  `;

  for (const row of bad) {
    issues.details.push({
      id: row.id,
      roomNo: row.roomNo,
      description: 'status=PAID but paidAt is null',
    });
    issues.count++;

    if (!dryRun) {
      await prisma.invoice.update({
        where: { id: row.id },
        data: { status: 'OVERDUE' as any, paidAt: null },
      });
    }
  }

  if (issues.count > 0) {
    results.issues.push(issues);
    if (!dryRun) results.fixedCount += issues.count;
  }
}

// ── Check 3: OVERDUE with future dueDate ──────────────────────────────────────

async function checkOverdueWithFutureDueDate(results: AuditResults) {
  const issues: AuditIssue = {
    category: 'OVERDUE_WITH_FUTURE_DUE_DATE',
    severity: 'ERROR',
    count: 0,
    details: [],
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bad = await prisma.$queryRaw<Array<{ id: string; roomNo: string; dueDate: Date }>>`
    SELECT id, "roomNo", "dueDate" FROM invoices
    WHERE status = 'OVERDUE' AND "dueDate" >= ${today}
  `;

  for (const row of bad) {
    issues.details.push({
      id: row.id,
      roomNo: row.roomNo,
      description: `dueDate ${row.dueDate.toISOString().split('T')[0]} is in the future`,
    });
    issues.count++;

    if (!dryRun) {
      await prisma.invoice.update({
        where: { id: row.id },
        data: { status: 'GENERATED' as any },
      });
    }
  }

  if (issues.count > 0) {
    results.issues.push(issues);
    if (!dryRun) results.fixedCount += issues.count;
  }
}

// ── Check 4: OCCUPIED without ACTIVE contract ────────────────────────────────

async function checkOccupiedWithoutActiveContract(results: AuditResults) {
  const issues: AuditIssue = {
    category: 'OCCUPIED_WITHOUT_ACTIVE_CONTRACT',
    severity: 'ERROR',
    count: 0,
    details: [],
  };

  const occupiedRooms = await prisma.$queryRaw<Array<{ roomNo: string }>>`
    SELECT "roomNo" FROM rooms WHERE "roomStatus" = 'OCCUPIED'
  `;

  for (const room of occupiedRooms) {
    const contract = await prisma.contract.findFirst({
      where: { roomNo: room.roomNo, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!contract) {
      issues.details.push({
        id: room.roomNo,
        description: 'room is OCCUPIED but no ACTIVE contract exists',
      });
      issues.count++;

      if (!dryRun) {
        await prisma.room.update({
          where: { roomNo: room.roomNo },
          data: { roomStatus: 'VACANT' as any },
        });
      }
    }
  }

  if (issues.count > 0) {
    results.issues.push(issues);
    if (!dryRun) results.fixedCount += issues.count;
  }
}

// ── Check 5: Duplicate invoices per RoomBilling ─────────────────────────────

async function checkDuplicateInvoicesPerRoomBilling(results: AuditResults) {
  const issues: AuditIssue = {
    category: 'DUPLICATE_INVOICE_PER_ROOM_BILLING',
    severity: 'ERROR',
    count: 0,
    details: [],
  };

  const dupes = await prisma.$queryRaw<Array<{ roomBillingId: string; cnt: bigint; roomNo: string }>>`
    SELECT "roomBillingId", COUNT(*) as cnt, MAX("roomNo") as "roomNo"
    FROM invoices
    GROUP BY "roomBillingId"
    HAVING COUNT(*) > 1
  `;

  for (const row of dupes) {
    issues.details.push({
      id: row.roomBillingId,
      roomNo: row.roomNo,
      description: `${Number(row.cnt)} invoices for same roomBillingId`,
    });
    issues.count++;
  }

  if (issues.count > 0) results.issues.push(issues);
}

// ── Check 7: Orphan RoomTenant records ────────────────────────────────────────

async function checkOrphanRoomTenants(results: AuditResults) {
  const issues: AuditIssue = {
    category: 'ORPHAN_ROOM_TENANT',
    severity: 'WARN',
    count: 0,
    details: [],
  };

  const orphans = await prisma.$queryRaw<Array<{ id: string; roomNo: string }>>`
    SELECT rt.id, rt."roomNo"
    FROM room_tenants rt
    WHERE NOT EXISTS (SELECT 1 FROM rooms r WHERE r."roomNo" = rt."roomNo")
       OR NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = rt."tenantId")
  `;

  for (const row of orphans) {
    issues.details.push({
      id: row.id,
      roomNo: row.roomNo,
      description: 'RoomTenant references non-existent room or tenant',
    });
    issues.count++;
  }

  if (issues.count > 0) results.issues.push(issues);
}

// ── Check 8: Invoice cancelledAt mismatch ─────────────────────────────────────

async function checkCancelledAtMismatch(results: AuditResults) {
  const issues: AuditIssue = {
    category: 'CANCELLED_AT_STATUS_MISMATCH',
    severity: 'ERROR',
    count: 0,
    details: [],
  };

  const bad = await prisma.$queryRaw<Array<{ id: string; roomNo: string; status: string }>>`
    SELECT id, "roomNo", status FROM invoices
    WHERE "cancelledAt" IS NOT NULL AND status != 'CANCELLED'
  `;

  for (const row of bad) {
    issues.details.push({
      id: row.id,
      roomNo: row.roomNo,
      description: `has cancelledAt but status=${row.status}`,
    });
    issues.count++;
  }

  if (issues.count > 0) results.issues.push(issues);
}

// ── Check 9: Contract ACTIVE with deletedAt ───────────────────────────────────

async function checkContractActiveWithDeletedAt(results: AuditResults) {
  const issues: AuditIssue = {
    category: 'CONTRACT_ACTIVE_WITH_DELETED_AT',
    severity: 'ERROR',
    count: 0,
    details: [],
  };

  const bad = await prisma.$queryRaw<Array<{ id: string; roomNo: string }>>`
    SELECT id, "roomNo" FROM contracts
    WHERE status = 'ACTIVE' AND "deletedAt" IS NOT NULL
  `;

  for (const row of bad) {
    issues.details.push({
      id: row.id,
      roomNo: row.roomNo,
      description: 'contract is ACTIVE but has deletedAt set',
    });
    issues.count++;
  }

  if (issues.count > 0) results.issues.push(issues);
}

// ── Check 10: statusComputed mismatch ────────────────────────────────────────

async function checkStatusComputedMismatch(results: AuditResults) {
  const issues: AuditIssue = {
    category: 'STATUS_COMPUTED_MISMATCH',
    severity: 'WARN',
    count: 0,
    details: [],
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sample check — compare stored vs effective for a subset of invoices
  // Full check would iterate all invoices which may be slow
  const sample = await prisma.$queryRaw<Array<{ id: string; roomNo: string; status: string; dueDate: Date; paidAt: Date | null; statusComputed: string | null }>>`
    SELECT id, "roomNo", status, "dueDate", "paidAt", "statusComputed"
    FROM invoices
    WHERE status = 'OVERDUE' AND "statusComputed" IS NOT NULL
    LIMIT 1000
  `;

  for (const inv of sample) {
    const effective = getEffectiveInvoiceStatus({
      storedStatus: inv.status,
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
    });
    if (inv.statusComputed && inv.statusComputed !== effective) {
      issues.details.push({
        id: inv.id,
        roomNo: inv.roomNo,
        description: `statusComputed=${inv.statusComputed} but effective=${effective}`,
      });
      issues.count++;
    }
  }

  if (issues.count > 0) results.issues.push(issues);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});