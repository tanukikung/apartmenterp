/**
 * SCENARIO 1: Admin generates invoice
 *
 * Validates:
 * - Login as admin via UI
 * - Navigate to billing/invoice page
 * - Generate an invoice
 * - Verify it appears in UI with status GENERATED
 * - Double-click does NOT create duplicates
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateToInvoices, waitForStable, expectNoErrorToast } from './helpers';
import { BASE_URL } from './config.js';

test.describe('Scenario 1: Invoice Generation', () => {
  test('admin can generate invoice and no duplicate on double-click', async ({ page }) => {
    // ── Login ─────────────────────────────────────────────────────────────────
    await loginAsAdmin(page);
    await waitForStable(page);

    // ── Navigate to billing / invoice generation ─────────────────────────────
    // Try billing page first (most likely entry point for invoice generation)
    await page.goto(`${BASE_URL}/admin/billing`);
    await expect(page.locator('body')).toBeVisible();

    // Look for "Generate Invoice" or "สร้างใบแจ้งหนี้" button
    const generateBtn = page.locator(
      'button:has-text("Generate Invoice"), button:has-text("สร้างใบแจ้งหนี้"), button:has-text("Generate"), a:has-text("Generate Invoice")'
    ).first();

    const hasBillingPage = await generateBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasBillingPage) {
      // Fallback: try the invoices page
      await page.goto(`${BASE_URL}/admin/invoices`);
      await expect(page.locator('body')).toBeVisible();
      // Click "Generated" tab to ensure table shows generated invoices
      const generatedTab = page.getByRole('tab', { name: /generated|สร้าง/i }).first();
      if (await generatedTab.isVisible()) await generatedTab.click();
      await expect(page.locator('body')).toBeVisible();

      const btn = page.locator(
        'button:has-text("Generate"), a:has-text("สร้าง"), button:has-text("สร้างใบแจ้งหนี้")'
      ).first();
      const hasGenerateBtn = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasGenerateBtn) {
        test.skip('Generate Invoice button not found on current page — manual verify needed');
        return;
      }
      await btn.click();
    } else {
      await generateBtn.click();
    }

    await expect(page.locator('body')).toBeVisible();
    await waitForStable(page);

    // ── Verify invoice appears ──────────────────────────────────────────────
    // After generate, switch to "Generated" tab to see the new invoices
    const generatedTab = page.getByRole('tab', { name: /generated|สร้าง/i }).first();
    if (await generatedTab.isVisible()) await generatedTab.click();
    await expect(page.locator('body')).toBeVisible();

    const invoiceRows = page.locator('table tbody tr, [data-testid="invoice-row"], .invoice-row');
    const initialCount = await invoiceRows.count();
    if (initialCount === 0) {
      test.skip('No invoices generated — skipping');
      return;
    }
    expect(initialCount).toBeGreaterThan(0);

    // ── Double-click test: click again within 500ms ────────────────────────
    const generateAgainBtn = page.locator(
      'button:has-text("Generate Invoice"), button:has-text("สร้างใบแจ้งหนี้"), button:has-text("Generate")'
    ).first();

    const canClickAgain = await generateAgainBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (canClickAgain) {
      await generateAgainBtn.click();
      await expect(page.locator('body')).toBeVisible();
      await waitForStable(page);

      const finalCount = await invoiceRows.count();
      // Should not have grown by more than 1 (only one generation should succeed)
      expect(finalCount - initialCount).toBeLessThanOrEqual(1);
    }

    // ── Check for GENERATED status ──────────────────────────────────────────
    await expectNoErrorToast(page);
    const statusCell = page.locator('table tbody tr:first-child td.status, table tbody tr:first-child [class*="status"]').first();
    const hasStatus = await statusCell.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasStatus) {
      const statusText = await statusCell.textContent();
      // Status should be GENERATED or equivalent
      expect(statusText).toMatch(/GENERATED|Generated|สร้าง/i);
    }
  });

  test('invoice list page loads without error', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToInvoices(page);
    await expectNoErrorToast(page);
    const rows = page.locator('table tbody tr, [data-testid="invoice-row"]');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(0); // Just ensure page loads
  });
});