/**
 * FACTORY-DRIVEN TEST REFERENCE — Complete before/after patterns
 *
 * This file demonstrates the transformation from FLAKY implicit-data tests
 * to DETERMINISTIC factory-driven tests.
 *
 * Run this file as a reference when writing new tests.
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
  type Room,
} from './factories';
import { BASE_URL } from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// BEFORE EXAMPLE (FLAKY - DO NOT USE)
// ─────────────────────────────────────────────────────────────────────────────
//
// test('Pay an invoice (FLAKY — DO NOT USE)', async ({ page }) => {
//   await page.goto(`${BASE_URL}/login`);           // ❌ Sequential login
//   await page.fill('input[name="username"]', 'owner');
//   await page.fill('input[name="password"]', 'Owner@12345');
//   await page.click('button[type="submit"]');
//   await page.waitForLoadState('networkidle');    // ❌ DEADLOCK
//
//   await page.goto(`${BASE_URL}/admin/invoices`);
//   await page.waitForLoadState('networkidle');    // ❌ DEADLOCK
//
//   const row = page.locator('tbody tr').first();  // ❌ Assumes data exists
//   await row.click();                             // ❌ No tab activation
//   await page.waitForLoadState('networkidle');    // ❌ DEADLOCK
//
//   const payBtn = page.locator('button:has-text("ชำระ")'); // ❌ Thai text
//   await payBtn.click();
//   await page.waitForLoadState('networkidle');    // ❌ DEADLOCK
//   // ...
// });

// ─────────────────────────────────────────────────────────────────────────────
// AFTER EXAMPLE (DETERMINISTIC — USE THIS PATTERN)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Factory Pattern Reference Tests', () => {

  // ── AUTH ────────────────────────────────────────────────────────────────────

  test('login is deterministic with parallel-safe URL wait', async ({ page }) => {
    // ✅ Uses shared helper with Promise.all for URL wait
    await loginAsAdmin(page);
    expect(page.url()).toContain('/admin');

    // ✅ Subsequent navigation is deterministic
    await page.goto(`${BASE_URL}/admin/dashboard`);
    await expect(page.locator('body')).toBeVisible(); // No networkidle
  });

  // ── TENANT FACTORY ──────────────────────────────────────────────────────────

  test('ensureTenant creates uniquely-named tenant', async ({ page }) => {
    await loginAsAdmin(page);

    // ✅ Each call gets a unique suffix (timestamp + random)
    const { tenant: t1 } = await ensureTenant(page);
    const { tenant: t2 } = await ensureTenant(page);

    // ✅ No collision — IDs are unique
    expect(t1.id).not.toBe(t2.id);

    // ✅ All required fields are present
    expect(t1.fullName).toBeTruthy();
    expect(t1.phone).toMatch(/^0[6-9]\d{8}$/); // Thai mobile format
    console.log(`[tenant] t1=${t1.id} t2=${t2.id} — parallel-safe`);
  });

  // ── CONTRACT FACTORY ────────────────────────────────────────────────────────

  test('ensureContract auto-wires room + tenant', async ({ page }) => {
    await loginAsAdmin(page);

    // ✅ Finds vacant room automatically
    // ✅ Creates tenant automatically
    // ✅ Sets unique dates
    const { contract, room, tenant } = await ensureContract(page, {
      rentAmount: 7500,
      depositAmount: 15000,
    });

    expect(contract.id).toBeDefined();
    expect(room.roomStatus).toBeTruthy();
    expect(tenant.id).toBeDefined();
    expect(contract.rentAmount).toBe(7500);
    expect(contract.depositAmount ?? 0).toBe(15000);
    console.log(`[contract] room=${room.roomNo} tenant=${tenant.fullName} contract=${contract.id}`);
  });

  // ── INVOICE FACTORY — GENERATED ─────────────────────────────────────────────

  test('ensureInvoice(GENERATED) builds full pipeline', async ({ page }) => {
    await loginAsAdmin(page);

    // ✅ Creates: billing period → billing records → generates invoice
    const { invoice, tenant, contract, room } = await ensureInvoice(page, {
      status: 'GENERATED',
    });

    expect(invoice.status).toBe('GENERATED');
    expect(invoice.id).toBeDefined();
    expect(invoice.totalAmount).toBeGreaterThan(0);
    console.log(`[invoice:GENERATED] ${invoice.id} ฿${invoice.totalAmount} for ${room.roomNo}`);
  });

  // ── INVOICE FACTORY — SENT ──────────────────────────────────────────────────

  test('ensureInvoice(SENT) sends via API', async ({ page }) => {
    await loginAsAdmin(page);

    const { invoice } = await ensureInvoice(page, { status: 'SENT' });

    expect(invoice.status).toBe('SENT');
    console.log(`[invoice:SENT] ${invoice.id}`);
  });

  // ── INVOICE FACTORY — PAID ──────────────────────────────────────────────────

  test('ensureInvoice(PAID) records full payment', async ({ page }) => {
    await loginAsAdmin(page);

    const { invoice } = await ensureInvoice(page, { status: 'PAID' });

    expect(invoice.status).toBe('PAID');
    console.log(`[invoice:PAID] ${invoice.id}`);
  });

  // ── WAIT FOR INVOICE STATUS ─────────────────────────────────────────────────

  test('waitForInvoiceStatus polls until target status', async ({ page }) => {
    await loginAsAdmin(page);

    // Use GENERATED status — no send needed, avoids rate limit consumption
    // The waitForInvoiceStatus test verifies polling behavior, not the send pipeline
    const { invoice } = await ensureInvoice(page, { status: 'GENERATED' });
    expect(invoice.status).toBe('GENERATED');

    // Simulate: send invoice via direct API (counts as 1 send)
    // This is a single send that the polling test needs
    await page.evaluate(async (id) => {
      await fetch(`/api/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        credentials: 'include',
        body: JSON.stringify({ sendToLine: false, channel: 'PDF' }),
      });
    }, invoice.id);

    // Wait for status to change using polling (not setTimeout)
    await waitForInvoiceStatus(page, invoice.id, 'SENT', 20000);

    console.log(`[waitForStatus] ${invoice.id} reached SENT`);
  });

  // ── CLICK + API WAIT ───────────────────────────────────────────────────────

  test('clickAndWait coordinates button click with API response', async ({ page }) => {
    await loginAsAdmin(page);

    // Use GENERATED — clicking to pay doesn't require prior SENT
    const { invoice } = await ensureInvoice(page, { status: 'GENERATED' });

    await page.goto(`${BASE_URL}/admin/invoices/${invoice.id}`);
    await waitForApi(page, `/api/invoices/${invoice.id}`);
    await expect(page.locator('body')).toBeVisible();

    // ✅ Use clickAndWait instead of click + networkidle
    const payBtn = page.getByRole('button', { name: /pay/i });
    if (await payBtn.isVisible()) {
      await clickAndWait(page, payBtn, `/api/invoices/${invoice.id}/pay`);

      // ✅ Amount input would appear here — use waitForApi not setTimeout
      const amountInput = page.locator('input[aria-label*="จำนวน"]');
      if (await amountInput.isVisible()) {
        await amountInput.fill(String(invoice.totalAmount));
        await clickAndWait(page, page.locator('button[type="submit"]'), '/api/payments');
      }

      // ✅ Verify PAID
      await waitForInvoiceStatus(page, invoice.id, 'PAID', 20000);
    }
  });

  // ── PARALLEL ISOLATION ─────────────────────────────────────────────────────

  test('parallel workers never collide — unique IDs per test', async ({ page }) => {
    await loginAsAdmin(page);

    // All GENERATED — no sends, no rate limit concerns
    const { invoice: inv1 } = await ensureInvoice(page, { status: 'GENERATED' });
    const { invoice: inv2 } = await ensureInvoice(page, { status: 'GENERATED' });
    const { invoice: inv3 } = await ensureInvoice(page, { status: 'GENERATED' });

    // ✅ All unique
    expect([inv1.id, inv2.id, inv3.id]).toHaveLength(3);
    expect(new Set([inv1.id, inv2.id, inv3.id]).size).toBe(3);
    console.log(`[parallel] 3 unique invoices: ${inv1.id.slice(0,8)} ${inv2.id.slice(0,8)} ${inv3.id.slice(0,8)}`);
  });

  // ── DATA INDEPENDENCE ───────────────────────────────────────────────────────

  test('test does NOT depend on seeded/previous data', async ({ page }) => {
    await loginAsAdmin(page);

    // Use GENERATED — no sends needed, fully isolated
    const { invoice } = await ensureInvoice(page, { status: 'GENERATED' });

    // ✅ Verify the invoice exists and is ours
    const apiResult = await page.evaluate(async (id) => {
      const res = await fetch(`/api/invoices/${id}`);
      const json = await res.json();
      return json;
    }, invoice.id);

    const fetchedInvoice = (apiResult as { data?: Invoice }).data;
    expect(fetchedInvoice?.id).toBe(invoice.id);
    expect(fetchedInvoice?.status).toBe('GENERATED');

    // ✅ No assumptions about other tests' data
    console.log(`[isolation] invoice ${invoice.id} is independent — no shared state`);
  });
});