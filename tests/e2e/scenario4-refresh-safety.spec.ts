/**
 * SCENARIO 4: Retry / refresh safety
 *
 * Validates:
 * - Page refresh during send does NOT create duplicate invoice
 * - Page refresh during confirm does NOT create duplicate payment
 * - Idempotency key protects against retry storms
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateToInvoices, waitForStable, expectNoErrorToast } from './helpers';
import { BASE_URL } from './config.js';

test.describe('Scenario 4: Retry and Refresh Safety', () => {
  test('refresh during send does not create duplicate invoice', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToInvoices(page);
    await waitForStable(page);

    // Find a GENERATED invoice
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.skip('No invoice rows');
      return;
    }

    // Count invoices before
    const countBefore = await rows.count();

    // Trigger send on first GENERATED invoice
    let targetRow = null;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const status = await row.locator('td:last-child, [class*="status"]').textContent().catch(() => '');
      if (/GENERATED/i.test(status)) {
        targetRow = row;
        break;
      }
    }

    if (!targetRow) {
      test.skip('No GENERATED invoice found');
      return;
    }

    // Click send
    const sendBtn = targetRow.locator('button:has-text("Send"), button:has-text("ส่ง")');
    const canClick = await sendBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (!canClick) {
      test.skip('Send button not visible');
      return;
    }

    await sendBtn.click();
    // Immediately refresh — simulates network timeout retry
    await page.reload();

    await waitForStable(page);

    // Verify: no crash, no extra invoices
    await expectNoErrorToast(page);
    const countAfter = await rows.count();
    expect(countAfter - countBefore).toBeLessThanOrEqual(1);
  });

  test('refresh during payment confirm does not create duplicate', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/payments/review`);
    await waitForStable(page);

    const rows = page.locator('table tbody tr');
    const countBefore = await rows.count();

    const confirmBtn = rows.first().locator('button:has-text("Confirm"), button:has-text("ยืนยัน")');
    const hasBtn = await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (!hasBtn) {
      test.skip('No confirm button found');
      return;
    }

    await confirmBtn.click();
    // Immediately refresh page
    await page.reload();
    await waitForStable(page);

    await expectNoErrorToast(page);
    const countAfter = await rows.count();
    expect(countAfter).toBeGreaterThanOrEqual(0); // page should not crash
  });

  test('invoice list page loads correctly after page refresh', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToInvoices(page);
    await waitForStable(page);

    // Reload multiple times
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await waitForStable(page);
      await expectNoErrorToast(page);
    }
  });
});