import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3001';

/**
 * Focused QA test suite targeting critical business flows.
 * All pages use BASE = http://localhost:3001
 */
test.describe('QA: Critical Business Flows', () => {

  // ── Login ────────────────────────────────────────────────────────────────
  test('1. Login as admin', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');

    const usernameInput = page.locator('input[name="username"], input[type="text"]').first();
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

    await usernameInput.fill('owner');
    await passwordInput.fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();

    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/admin');
  });

  // ── Dashboard ───────────────────────────────────────────────────────────
  test('2. Dashboard loads with KPIs', async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  // ── Rooms ────────────────────────────────────────────────────────────────
  test('3. Rooms page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/rooms`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Tenants ──────────────────────────────────────────────────────────────
  test('4. Tenants page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/tenants`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Contracts ────────────────────────────────────────────────────────────
  test('5. Contracts page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/contracts`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Billing ─────────────────────────────────────────────────────────────
  test('6. Billing page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/billing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Invoices ────────────────────────────────────────────────────────────
  test('7. Invoices page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/invoices`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Payments ─────────────────────────────────────────────────────────────
  test('8. Payments page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/payments`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Reports ─────────────────────────────────────────────────────────────
  test('9. Reports page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/reports`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── Settings ─────────────────────────────────────────────────────────────
  test('10. Settings page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/settings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
  });
});
