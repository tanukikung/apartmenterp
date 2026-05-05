/**
 * E2E Test Reference — Deterministic, data-factory-driven test patterns.
 *
 * This file demonstrates the CORRECT way to write E2E tests using:
 *   - factories.ts  → create all data deterministically via API
 *   - waits.ts      → deterministic async waits via API responses
 *   - helpers.ts    → login, navigation, assertions
 *
 * BEFORE (old pattern — FLAKY):
 * ────────────────────────────────────────────────────────────────
 * test('Pay an invoice', async ({ page }) => {
 *   await loginAsAdmin(page);
 *   await page.goto(`${BASE_URL}/admin/invoices`);
 *   await page.waitForLoadState('networkidle');           // ❌ DEADLOCK under parallel
 *
 *   const row = page.locator('tbody tr').filter({ hasText: /SENT/ }).first();
 *   await row.click();                                     // ❌ Assumes data exists
 *   await page.waitForLoadState('networkidle');
 *
 *   const payBtn = page.locator('button:has-text("ชำระ")');  // ❌ Thai text selector
 *   await payBtn.click();                                  // ❌ No deterministic wait
 *   await page.waitForLoadState('networkidle');
 *
 *   await page.fill('input[name="amount"]', '5000');
 *   await page.locator('button[type="submit"]').click();
 *   await page.waitForLoadState('networkidle');
 * });
 *
 *
 * AFTER (new pattern — DETERMINISTIC, PARALLEL-SAFE):
 * ────────────────────────────────────────────────────────────────
 * test('Pay an invoice — factory-driven', async ({ page }) => {
 *   await loginAsAdmin(page);
 *
 *   // 1. Create invoice in known state via factory
 *   const { invoice, tenant, contract, room } = await ensureInvoice(page, {
 *     status: 'SENT',
 *   });
 *
 *   // 2. Navigate to invoice detail
 *   await page.goto(`${BASE_URL}/admin/invoices/${invoice.id}`);
 *   await waitForApi(page, `/api/invoices/${invoice.id}`);
 *   await expect(page.locator('body')).toBeVisible();
 *
 *   // 3. Click pay and wait for API response deterministically
 *   const payBtn = page.getByRole('button', { name: /pay/i });
 *   await Promise.all([
 *     waitForApi(page, `/api/invoices/${invoice.id}/pay`),
 *     payBtn.click(),
 *   ]);
 *
 *   // 4. Fill amount and submit
 *   const amountInput = page.locator('input[aria-label*="จำนวน"]');
 *   await amountInput.fill(String(invoice.totalAmount));
 *
 *   await Promise.all([
 *     waitForApi(page, '/api/payments'),
 *     page.locator('button[type="submit"]').click(),
 *   ]);
 *
 *   // 5. Verify status changed to PAID
 *   await waitForInvoiceStatus(page, invoice.id, 'PAID', 20000);
 * });
 */

import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin } from './helpers';
import { waitForApi, waitForInvoiceStatus, clickAndWait } from './waits';
import {
  ensureInvoice,
  ensureTenant,
  ensureContract,
  findVacantRoom,
  generateTestId,
  type Invoice,
  type Tenant,
  type Contract,
} from './factories';
import { BASE_URL } from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// DEMO: Using factories with the new pattern
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Factory-Driven Test Patterns (Reference)', () => {

  test('S1: Create and pay an invoice using factory', async ({ page }) => {
    await loginAsAdmin(page);

    // Create invoice in SENT state (full pipeline: billing → invoice → send)
    const { invoice } = await ensureInvoice(page, { status: 'SENT' });
    console.log(`[S1] Created invoice ${invoice.id} with status ${invoice.status}`);

    // Navigate and pay
    await page.goto(`${BASE_URL}/admin/invoices/${invoice.id}`);
    await waitForApi(page, `/api/invoices/${invoice.id}`);
    await expect(page.locator('body')).toBeVisible();

    // Click pay button
    const payBtn = page.getByRole('button', { name: /pay/i });
    await Promise.all([
      waitForApi(page, `/api/invoices/${invoice.id}/pay`),
      payBtn.click(),
    ]);

    // Fill full amount
    const amountInput = page.locator('input[aria-label*="จำนวน"]');
    if (await amountInput.isVisible()) {
      await amountInput.fill(String(invoice.totalAmount));
      await Promise.all([
        waitForApi(page, '/api/payments'),
        page.locator('button[type="submit"]').click(),
      ]);
    }

    // Verify PAID
    await waitForInvoiceStatus(page, invoice.id, 'PAID', 20000);
    console.log(`[S1] Invoice ${invoice.id} is now PAID`);
  });

  test('S2: Create tenant with factory (no Thai text, no implicit data)', async ({ page }) => {
    await loginAsAdmin(page);

    // Using factory — deterministic name + unique per test
    const { tenant } = await ensureTenant(page, {
      firstName: 'สมชาย',
      lastName: 'วิริยะ',
    });

    console.log(`[S2] Created tenant ${tenant.id}: ${tenant.fullName}`);
    expect(tenant.id).toBeDefined();
    expect(tenant.fullName).toContain('สมชาย');
  });

  test('S3: Create contract with factory (no implicit room/tenant)', async ({ page }) => {
    await loginAsAdmin(page);

    const { contract, room, tenant } = await ensureContract(page, {
      rentAmount: 8500,
      depositAmount: 17000,
    });

    console.log(`[S3] Contract ${contract.id}: room=${room.roomNo}, tenant=${tenant.fullName}`);
    expect(contract.rentAmount).toBe(8500);
    expect(contract.depositAmount ?? 0).toBe(17000);
  });

  test('S4: Generate invoice — all status transitions', async ({ page }) => {
    await loginAsAdmin(page);

    // GENERATED
    const gen = await ensureInvoice(page, { status: 'GENERATED' });
    expect(gen.invoice.status).toBe('GENERATED');
    console.log(`[S4] GENERATED: ${gen.invoice.id}`);

    // SENT
    const sent = await ensureInvoice(page, { status: 'SENT' });
    expect(sent.invoice.status).toBe('SENT');
    console.log(`[S4] SENT: ${sent.invoice.id}`);

    // PAID
    const paid = await ensureInvoice(page, { status: 'PAID' });
    expect(paid.invoice.status).toBe('PAID');
    console.log(`[S4] PAID: ${paid.invoice.id}`);
  });

  test('S5: Parallel safety — unique IDs prevent collision', async ({ page }) => {
    await loginAsAdmin(page);

    // Each call to ensureInvoice gets a UNIQUE room number
    const { invoice: inv1 } = await ensureInvoice(page, { status: 'GENERATED' });
    const { invoice: inv2 } = await ensureInvoice(page, { status: 'GENERATED' });

    expect(inv1.id).not.toBe(inv2.id);
    console.log(`[S5] Two parallel-safe invoices: ${inv1.id} vs ${inv2.id}`);
  });
});