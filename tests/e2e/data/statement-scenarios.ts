/**
 * Mock Bank Statement Builder
 * Builds XLSX bank statement buffers for each payment scenario.
 */
import * as XLSX from 'xlsx';

export interface BankStatementEntry {
  date: Date;
  amount: number;
  description: string;
  reference?: string;
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function buildStatementXlsx(entries: BankStatementEntry[]): Uint8Array {
  // Headers: Date | Amount | Description | Reference
  const rows = entries.map(e => [
    formatDate(e.date),
    e.amount,
    e.description,
    e.reference ?? '',
  ]);

  const data = [
    ['Date', 'Amount', 'Description', 'Reference'],
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Statement');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(buf);
}

// ── Scenario helpers ──────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export function makeEntry(
  date: Date | number,
  amount: number,
  description: string,
  reference?: string
): BankStatementEntry {
  const d = typeof date === 'number' ? daysAgo(date) : date;
  return { date: d, amount, description, reference };
}

/** Scenario 1: Exact on-time payment — room 101 pays 9850 */
export function buildScenario1_OnTimePayment(roomNo: string, invoiceNumber: string, amount: number): Uint8Array {
  return buildStatementXlsx([
    makeEntry(daysAgo(1), amount, `ค่าห้อง ${roomNo} ${invoiceNumber}`, `${invoiceNumber}`),
  ]);
}

/** Scenario 2: Late payment — room 102 pays 9850, 10 days after due date */
export function buildScenario2_LatePayment(roomNo: string, invoiceNumber: string, amount: number): Uint8Array {
  return buildStatementXlsx([
    makeEntry(daysAgo(0), amount, `ชำระค่าห้อง ${roomNo} ล่าช้า`, `${invoiceNumber}`),
  ]);
}

/** Scenario 3: Statement upload after period is closed */
export function buildScenario3_ClosedPeriod(entries: BankStatementEntry[]): Uint8Array {
  return buildStatementXlsx(entries);
}

/** Scenario 4: Partial payment — room 104 pays only 5000 of 9850 */
export function buildScenario4_PartialPayment(roomNo: string, invoiceNumber: string, partialAmount: number): Uint8Array {
  return buildStatementXlsx([
    makeEntry(daysAgo(1), partialAmount, `ค่าห้อง ${roomNo} บางส่วน`, `${invoiceNumber}`),
  ]);
}

/** Scenario 5: Overpayment — room 105 pays 12000 for a 9850 invoice */
export function buildScenario5_Overpayment(roomNo: string, invoiceNumber: string, paidAmount: number): Uint8Array {
  return buildStatementXlsx([
    makeEntry(daysAgo(1), paidAmount, `ค่าห้อง ${roomNo}`, `${invoiceNumber}`),
  ]);
}

/** Scenario 6: Underpayment — room pays 8000 for a 9850 invoice */
export function buildScenario6_Underpayment(roomNo: string, invoiceNumber: string, paidAmount: number): Uint8Array {
  return buildStatementXlsx([
    makeEntry(daysAgo(1), paidAmount, `ชำระ ${roomNo}`, `${invoiceNumber}`),
  ]);
}

/** Scenario 7: Payment with wrong room reference — no matching invoice */
export function buildScenario7_WrongRoom(): Uint8Array {
  return buildStatementXlsx([
    makeEntry(daysAgo(1), 9850, 'ชำระค่าห้อง 999-9-99999', 'INV-WRONG-999'),
  ]);
}

/** Mixed statement — multiple payments including partials and wrong refs (for scenario 3) */
export function buildScenario3_MixedStatement(
  entries: Array<{ roomNo: string; invoiceNumber: string; amount: number; description?: string }>
): Uint8Array {
  return buildStatementXlsx(
    entries.map(e =>
      makeEntry(daysAgo(1), e.amount, e.description ?? `ค่าห้อง ${e.roomNo}`, e.invoiceNumber)
    )
  );
}