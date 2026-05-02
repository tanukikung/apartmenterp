/**
 * Sync Invoice Status — Daily Cron Job
 *
 * Run: npx tsx scripts/sync-invoice-status.ts
 * Or via npm: npm run sync:invoice-status
 *
 * This script:
 * 1. Computes the effective status for every invoice using getEffectiveInvoiceStatus()
 * 2. Updates the persisted statusComputed column
 * 3. Fixes any data integrity issues (e.g., OVERDUE with future dueDate)
 * 4. Logs all corrections made
 *
 * This is NOT a migration script — it is safe to run repeatedly.
 * It is idempotent: running it multiple times produces the same result.
 */

import { PrismaClient } from '@prisma/client';
import { getEffectiveInvoiceStatus } from '../src/modules/invoices/status';

const prisma = new PrismaClient();

interface InvoiceRow {
  id: string;
  status: string;
  dueDate: Date;
  paidAt: Date | null;
  statusComputed: string | null;
}

interface SyncResult {
  total: number;
  corrections: number;
  errors: number;
  byStatus: Record<string, number>;
  correctionsByType: Record<string, number>;
}

async function main() {
  const start = Date.now();
  console.log('=== SYNC INVOICE STATUS ===\n');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  if (dryRun) console.log('DRY RUN — no changes will be written\n');

  const result = await syncInvoiceStatuses(dryRun, verbose);

  console.log(`\n=== RESULTS (${Date.now() - start}ms) ===`);
  console.log(`Total invoices processed: ${result.total}`);
  console.log(`Corrections made: ${result.corrections}`);
  console.log(`Errors: ${result.errors}`);
  console.log('\nBy effective status:');
  for (const [status, count] of Object.entries(result.byStatus).sort()) {
    console.log(`  ${status}: ${count}`);
  }
  if (result.corrections > 0) {
    console.log('\nCorrections by type:');
    for (const [type, count] of Object.entries(result.correctionsByType).sort()) {
      console.log(`  ${type}: ${count}`);
    }
  }

  await prisma.$disconnect();
  process.exit(result.errors > 0 ? 1 : 0);
}

async function syncInvoiceStatuses(dryRun: boolean, verbose: boolean): Promise<SyncResult> {
  const result: SyncResult = {
    total: 0,
    corrections: 0,
    errors: 0,
    byStatus: {},
    correctionsByType: {},
  };

  // Process in batches to avoid loading all invoices into memory
  const BATCH_SIZE = 500;
  let cursor: string | undefined = undefined;

  while (true) {
    const invoices: InvoiceRow[] = await prisma.$queryRaw<InvoiceRow[]>`
      SELECT id, status, "dueDate", "paidAt", "statusComputed"
      FROM invoices
      WHERE id > ${cursor ?? ''}
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    `;

    if (invoices.length === 0) break;

    for (const invoice of invoices) {
      cursor = invoice.id;
      result.total++;

      const effectiveStatus = getEffectiveInvoiceStatus({
        storedStatus: invoice.status,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
      });

      // Track status distribution
      result.byStatus[effectiveStatus] = (result.byStatus[effectiveStatus] ?? 0) + 1;

      // Check if persisted column needs update
      const needsCorrection =
        effectiveStatus !== invoice.status ||
        invoice.statusComputed !== effectiveStatus;

      if (needsCorrection) {
        const correctionType = `${invoice.status} → ${effectiveStatus}`;
        result.correctionsByType[correctionType] = (result.correctionsByType[correctionType] ?? 0) + 1;

        if (verbose) {
          console.log(
            `  [${correctionType}] ${invoice.id} room=${invoice.statusComputed ?? '(null)'}→${effectiveStatus}`
          );
        }

        if (!dryRun) {
          try {
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: {
                status: effectiveStatus as any,
                statusComputed: effectiveStatus,
              },
            });
          } catch (err) {
            console.error(`  ERROR updating ${invoice.id}: ${err}`);
            result.errors++;
          }
        }

        result.corrections++;
      }
    }

    if (invoices.length < BATCH_SIZE) break;
  }

  return result;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});