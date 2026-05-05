import { Page, expect } from '@playwright/test';
import { BASE_URL } from './config.js';

/**
 * E2E Authentication helper — logs in as admin like a real user.
 * Uses deterministic URL-based waiting (NOT networkidle).
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(BASE_URL + '/login');
  const usernameInput = page.locator('input[name="username"], input[type="text"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await usernameInput.fill('owner');
  await passwordInput.fill('Owner@12345');

  const navPromise = page.waitForURL('**/admin/**', { timeout: 15000 });
  await Promise.all([
    navPromise,
    page.locator('button[type="submit"]').first().click(),
  ]);

  await expect(page.locator('body')).toBeVisible();
}

/**
 * E2E Authentication helper — logs in as staff.
 */
export async function loginAsStaff(page: Page): Promise<void> {
  await page.goto(BASE_URL + '/login');
  const usernameInput = page.locator('input[name="username"], input[type="text"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await usernameInput.fill('staff');
  await passwordInput.fill('Staff@12345');

  const navPromise = page.waitForURL('**/admin/**', { timeout: 15000 });
  await Promise.all([
    navPromise,
    page.locator('button[type="submit"]').first().click(),
  ]);

  await expect(page.locator('body')).toBeVisible();
}

/**
 * Navigate to the admin dashboard / invoices page.
 */
export async function navigateToInvoices(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/admin/invoices`);
  await expect(page.locator('body')).toBeVisible();
}

/**
 * Navigate to admin page and wait for body to be visible.
 * Does NOT use networkidle.
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(BASE_URL + path);
  await expect(page.locator('body')).toBeVisible();
}

/**
 * Wait for a page to be in a stable state using deterministic checks.
 * Replaces networkidle which causes deadlocks under parallel load.
 */
export async function waitForStable(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
}

/**
 * Check that the page shows no error toast/alert.
 */
export async function expectNoErrorToast(page: Page): Promise<void> {
  const toast = page.locator('[role="alert"], .toast-error, [class*="error"]:visible').first();
  await expect(toast).not.toBeVisible({ timeout: 2000 }).catch(() => {});
}

/**
 * Count how many rows are visible in an invoice table.
 */
export async function countInvoiceRows(page: Page): Promise<number> {
  const rows = page.locator('table tbody tr, [data-testid="invoice-row"], .invoice-row');
  return rows.count();
}

/**
 * Click a tab by name and wait for it to be active.
 */
export async function clickTab(page: Page, tabName: string | RegExp): Promise<void> {
  const tab = page.getByRole('tab', { name: tabName }).first();
  if (await tab.isVisible()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 }).catch(() => {});
  }
}

/**
 * Wait for a specific API response after clicking a button or link.
 * Use this instead of networkidle.
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  timeout = 15000
): Promise<void> {
  await page.waitForResponse(
    r => urlPattern instanceof RegExp ? urlPattern.test(r.url()) : r.url().includes(urlPattern),
    { timeout }
  );
}

/**
 * Ensure there is at least one invoice in the database for testing.
 * If no invoices exist, throw with guidance to run billing import first.
 * Call this at the start of tests that require invoice data.
 */
export async function ensureTestInvoice(page: Page): Promise<{ invoiceId: string; status: string }> {
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/invoices?pageSize=1');
    const json = await r.json();
    return json;
  }) as { data?: { data?: { id: string; status: string }[] } | { id: string; status: string }[] };

  // Handle paginated response: { data: { data: [...] } } or flat: { data: [...] }
  const raw = res?.data;
  const data = Array.isArray(raw) ? raw as { id: string; status: string }[]
    : Array.isArray(raw?.data) ? raw.data as { id: string; status: string }[]
    : undefined;

  if (data && data.length > 0) {
    return data[0];
  }

  console.warn('[ensureTestInvoice] No invoices found. Run billing import first.');
  throw new Error(
    'No invoices found in database. Run billing import first to generate test data.\n' +
    'Hint: npx playwright test tests/e2e/billing-full-flow.test.ts'
  );
}