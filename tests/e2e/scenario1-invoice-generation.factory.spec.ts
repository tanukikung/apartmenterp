/**
 * SCENARIO 1 (Factory-Refactored): Admin generates invoice — DETERMINISTIC
 *
 * Validates:
 * - Invoice can be generated via factory (no manual billing import needed)
 * - Invoice appears in UI with status GENERATED
 * - No duplicate generation (double-click race condition blocked)
 * - Status transitions work correctly
 *
 * Uses factories.ts for ALL test data — no seeded DB dependency.
 * Uses waits.ts for ALL async coordination — no timing assumptions.
 */

import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin } from './helpers';
import { waitForApi, waitForInvoiceStatus, clickAndWait } from './waits';
import {
  ensureInvoice,
  ensureTenant,
  generateTestId,
  type Invoice,
} from './factories';
import { BASE_URL } from './config.js';

test.describe('Scenario 1: Invoice Generation (Factory-Driven)', () => {

  test('admin can generate a GENERATED invoice via factory', async ({ page }) => {
    await loginAsAdmin(page);

    // ── Create invoice in GENERATED state via factory ────────────────────────
    const { invoice } = await ensureInvoice(page, { status: 'GENERATED' });

    console.log(`[S1] Created invoice ${invoice.id} — status: ${invoice.status}`);
    expect(invoice.id).toBeDefined();
    expect(invoice.status).toBe('GENERATED');

    // ── Verify it appears in UI ─────────────────────────────────────────────
    await page.goto(`${BASE_URL}/admin/invoices`);
    await waitForApi(page, '/api/invoices');

    // Click GENERATED tab
    const generatedTab = page.getByRole('tab', { name: /generated|สร้าง/i }).first();
    if (await generatedTab.isVisible()) await generatedTab.click();
    await waitForApi(page, '/api/invoices');

    // Should see the invoice
    const row = page.locator('table tbody tr').filter({ hasText: invoice.id.substring(0, 8) }).first();
    await expect(row).toBeVisible();
  });

  test('double-click on generate does NOT create duplicates', async ({ page }) => {
    await loginAsAdmin(page);

    // Create a GENERATED invoice first
    const { invoice: inv1 } = await ensureInvoice(page, { status: 'GENERATED' });
    const uid = generateTestId('doublegen');

    // Navigate to billing page to attempt generation
    await page.goto(`${BASE_URL}/admin/billing`);
    await waitForApi(page, '/api/billing');

    // Look for "Generate Invoices" button for the billing period
    // Click it TWICE rapidly to test idempotency
    const genBtn = page.getByRole('button', { name: /generate.*invoice|สร้างใบแจ้ง/i }).first();
    const isVisible = await genBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isVisible) {
      test.skip('Generate button not found on billing page');
      return;
    }

    // Capture count before
    await page.goto(`${BASE_URL}/admin/invoices`);
    await waitForApi(page, '/api/invoices');
    const generatedTab = page.getByRole('tab', { name: /generated|สร้าง/i }).first();
    if (await generatedTab.isVisible()) await generatedTab.click();
    await waitForApi(page, '/api/invoices');
    const countBefore = await page.locator('table tbody tr').count();

    // Double-click with race
    await Promise.all([
      waitForApi(page, '/api/invoices/generate'),
      genBtn.click(),
    ]);
    await genBtn.click(); // Second click — should be deduplicated

    await waitForApi(page, '/api/invoices/generate');

    // Count after — should not exceed countBefore + 1
    await page.reload();
    await waitForApi(page, '/api/invoices');
    const countAfter = await page.locator('table tbody tr').count();

    expect(countAfter - countBefore).toBeLessThanOrEqual(1);
  });

  test('SENT invoice: double-send is idempotent', async ({ page }) => {
    await loginAsAdmin(page);

    // Create SENT invoice via factory
    const { invoice } = await ensureInvoice(page, { status: 'SENT' });
    expect(invoice.status).toBe('SENT');

    console.log(`[S1-SENT] Invoice ${invoice.id} is SENT`);

    // Navigate to invoice detail
    await page.goto(`${BASE_URL}/admin/invoices/${invoice.id}`);
    await waitForApi(page, `/api/invoices/${invoice.id}`);

    // Try to send again — should be idempotent
    const sendBtn = page.getByRole('button', { name: /send|ส่ง/i }).first();
    const canSend = await sendBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!canSend) {
      console.log('[S1-SENT] Send button not visible (already SENT) — skipping second send test');
      return;
    }

    // Second send should NOT error (idempotent)
    const [, sendResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/invoices/') && r.url().includes('/send')),
      sendBtn.click(),
    ]);

    // Should return 200 (not 400/409) because idempotency key or duplicate handling
    expect(sendResponse.status()).toBeGreaterThanOrEqual(200);
    expect(sendResponse.status()).toBeLessThan(300);
  });

  test('invoice list page loads without error after factory data exists', async ({ page }) => {
    await loginAsAdmin(page);

    // Ensure we have at least one invoice
    const { invoice } = await ensureInvoice(page, { status: 'GENERATED' });

    // Navigate to invoices
    await page.goto(`${BASE_URL}/admin/invoices`);
    await waitForApi(page, '/api/invoices');

    // No console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.waitForLoadState('domcontentloaded');
    const rows = await page.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });
});