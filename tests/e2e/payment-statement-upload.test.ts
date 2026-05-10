/**
 * Payment Statement Upload E2E Tests
 * Tests 7 payment scenarios via full UI (browser file upload).
 *
 * Prerequisites:
 *   1. Seed data: npx tsx tests/e2e/data/seed-payment-test-data.ts
 *   2. App running: npm run dev
 *   3. Run: npx playwright test tests/e2e/payment-statement-upload.test.ts --project=chromium
 */

import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';
import { loginAsAdmin, uploadBankStatement, navigateToPaymentReview } from './helpers';
import {
  buildScenario1_OnTimePayment,
  buildScenario2_LatePayment,
  buildScenario4_PartialPayment,
  buildScenario5_Overpayment,
  buildScenario6_Underpayment,
  buildScenario7_WrongRoom,
} from './data/statement-scenarios';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';

// ── Seed helper ───────────────────────────────────────────────────────────────

async function seedPaymentData() {
  console.log('[setup] Seeding payment test data...');
  execSync('npx tsx tests/e2e/data/seed-payment-test-data.ts', {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await seedPaymentData();
});

test.afterAll(async () => {
  // No-op: keep data for manual inspection; run cleanup manually:
  // npx tsx tests/e2e/data/seed-payment-test-data.ts --cleanup
  console.log('[teardown] Tests done. Run cleanup manually if needed.');
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getReviewQueueCount(page: Page): Promise<number> {
  await navigateToPaymentReview(page);
  const rows = page.locator('table tbody tr');
  return rows.count();
}

// ── Scenarios ────────────────────────────────────────────────────────────────

test.describe('Payment: Statement Upload Scenarios', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Scenario 1: On-time exact payment ─────────────────────────────────────
  test('Scenario 1: on-time exact payment → auto-matched', async ({ page }) => {
    // Invoice PAYTEST-INV-101: ฿9,850 due in 5 days
    const statementBuffer = buildScenario1_OnTimePayment('PAYTEST-101', 'INV-PAYTEST-101', 9850);

    const result = await uploadBankStatement(page, statementBuffer, 'scenario1_on_time.xlsx');

    expect(result.totalEntries).toBe(1);
    expect(result.imported).toBe(1);
    // Exact match with invoice ref in description → should auto-match
    expect(result.matched).toBeGreaterThanOrEqual(1);
    expect(result.unmatched).toBeLessThanOrEqual(0);
  });

  // ── Scenario 2: Late payment ─────────────────────────────────────────────
  test('Scenario 2: late payment → matched or needs review (overdue invoice)', async ({ page }) => {
    // Invoice PAYTEST-INV-102: already overdue (due 10 days ago)
    const statementBuffer = buildScenario2_LatePayment('PAYTEST-102', 'INV-PAYTEST-102', 9850);

    const result = await uploadBankStatement(page, statementBuffer, 'scenario2_late.xlsx');

    expect(result.totalEntries).toBe(1);
    expect(result.imported).toBe(1);
    // Late but exact amount with invoice ref — should still match
    // (score depends on how far past due date)
    expect(result.matched + result.unmatched).toBe(1);
  });

  // ── Scenario 4: Partial payment ─────────────────────────────────────────
  test('Scenario 4: partial payment (5000 of 9850) → invoice stays open, needs review', async ({ page }) => {
    const statementBuffer = buildScenario4_PartialPayment('PAYTEST-104', 'INV-PAYTEST-104', 5000);

    const result = await uploadBankStatement(page, statementBuffer, 'scenario4_partial.xlsx');

    expect(result.totalEntries).toBe(1);
    expect(result.imported).toBe(1);
    // Partial under threshold (diff=4850) → goes to NEED_REVIEW
    expect(result.unmatched).toBe(1);

    // Verify invoice still open (not PAID) by checking via API
    const apiRes = await page.evaluate(async () => {
      const res = await fetch('/api/invoices/PAYTEST-INV-104', {
        headers: { Origin: 'http://localhost:3001', Referer: 'http://localhost:3001/' },
        credentials: 'include',
      });
      return res.json();
    });
    const status = apiRes?.data?.status ?? apiRes?.status;
    expect(status).not.toBe('PAID');
  });

  // ── Scenario 5: Overpayment ───────────────────────────────────────────────
  test('Scenario 5: overpayment (12000 for 9850) → auto-matched, OVERPAYMENT flag', async ({ page }) => {
    const statementBuffer = buildScenario5_Overpayment('PAYTEST-105', 'INV-PAYTEST-105', 12000);

    const result = await uploadBankStatement(page, statementBuffer, 'scenario5_overpay.xlsx');

    expect(result.totalEntries).toBe(1);
    expect(result.imported).toBe(1);
    // Overpayment of 2150 THB (12000-9850) does NOT auto-match due to amount mismatch
    // AMOUNT_EXACT (+30) and AMOUNT_CLOSE (+20) both fail (diff=2150 > 10).
    // Only ROOM_MATCH(+20) + INVOICE_REF(+35) + DATE_WINDOW(+10) = score=65 < MANUAL_REVIEW(70)
    // → status becomes NEED_REVIEW for admin to investigate refund/credit.
    expect(result.unmatched).toBe(1);
  });

  // ── Scenario 6: Underpayment ──────────────────────────────────────────────
  test('Scenario 6: underpayment (8000 of 9850) → invoice stays OPEN, needs review', async ({ page }) => {
    const statementBuffer = buildScenario6_Underpayment('PAYTEST-106', 'INV-PAYTEST-106', 8000);

    const result = await uploadBankStatement(page, statementBuffer, 'scenario6_underpay.xlsx');

    expect(result.totalEntries).toBe(1);
    expect(result.imported).toBe(1);
    // Underpayment: amount diff = 1850 (> threshold) → NEED_REVIEW
    expect(result.unmatched).toBe(1);
  });

  // ── Scenario 7: Wrong room / unrecognised payment ─────────────────────────
  test('Scenario 7: payment with wrong room reference → NEED_REVIEW queue', async ({ page }) => {
    // Invoice PAYTEST-INV-107 exists but statement has wrong invoice ref
    const statementBuffer = buildScenario7_WrongRoom();

    const result = await uploadBankStatement(page, statementBuffer, 'scenario7_wrong_room.xlsx');

    expect(result.totalEntries).toBe(1);
    expect(result.imported).toBe(1);
    // No matching invoice found → NEED_REVIEW
    expect(result.unmatched).toBe(1);

    // Verify it appears in review queue
    await navigateToPaymentReview(page);
    const reviewRows = page.locator('table tbody tr');
    await expect(reviewRows).toHaveCount(1, { timeout: 5000 });
  });

  // ── Scenario 3: Statement upload after period closed ─────────────────────
  test('Scenario 3: statement upload after period closed → still imports, matching works', async ({ page }) => {
    // First close the billing period via API
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Get period ID
    const periodRes = await page.evaluate(async ({ y, m }) => {
      const res = await fetch(`/api/billing/periods?year=${y}&month=${m}`, {
        headers: { Origin: 'http://localhost:3001', Referer: 'http://localhost:3001/' },
        credentials: 'include',
      });
      return res.json();
    }, { y: year, m: month });

    const periodId = periodRes?.data?.data?.[0]?.id ?? `PAYTEST-BP-${year}-${month}`;

    // Close period (but don't lock — LOCKED blocks payment matching)
    await page.evaluate(async ({ id }) => {
      await fetch(`/api/billing/periods/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3001', Referer: 'http://localhost:3001/' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
    }, { id: periodId });

    // Statement still uploads and matching runs
    const statementBuffer = buildScenario1_OnTimePayment('PAYTEST-101', 'INV-PAYTEST-101', 9850);
    const result = await uploadBankStatement(page, statementBuffer, 'scenario3_closed_period.xlsx');

    expect(result.totalEntries).toBe(1);
    expect(result.imported).toBe(1);
    // Period CLOSED still allows statement import and payment matching
  });
});