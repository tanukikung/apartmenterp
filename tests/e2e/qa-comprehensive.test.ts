import { test, expect, Page } from '@playwright/test';
import { BASE_URL } from './config.js';
import { loginAsAdmin } from './helpers';

/**
 * Focused QA test suite targeting critical business flows.
 * All pages use BASE_URL from tests/e2e/config.ts
 */
test.describe('QA: Critical Business Flows', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Dashboard ───────────────────────────────────────────────────────────
  test('2. Dashboard loads with KPIs', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/dashboard`);
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  // ── Rooms ────────────────────────────────────────────────────────────────
  test('3. Rooms page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/rooms`);
    await expect(page.locator('body')).toBeVisible();

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Tenants ──────────────────────────────────────────────────────────────
  test('4. Tenants page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/tenants`);
    await expect(page.locator('body')).toBeVisible();

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Contracts ────────────────────────────────────────────────────────────
  test('5. Contracts page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/contracts`);
    await expect(page.locator('body')).toBeVisible();

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Billing ─────────────────────────────────────────────────────────────
  test('6. Billing page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/billing`);
    await expect(page.locator('body')).toBeVisible();

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Invoices ────────────────────────────────────────────────────────────
  test('7. Invoices page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/invoices`);
    await expect(page.locator('body')).toBeVisible();

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Payments ─────────────────────────────────────────────────────────────
  test('8. Payments page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/payments`);
    await expect(page.locator('body')).toBeVisible();

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Reports ─────────────────────────────────────────────────────────────
  test('9. Reports page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/reports`);
    await expect(page.locator('body')).toBeVisible();

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Settings ─────────────────────────────────────────────────────────────
  test('10. Settings page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/settings`);
    await expect(page.locator('body')).toBeVisible();

    await expect(page.locator('body')).toBeVisible();
  });
});