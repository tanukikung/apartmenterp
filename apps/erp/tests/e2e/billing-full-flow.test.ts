/**
 * Fresh-DB Release-Gate E2E Test — @playwright/test
 *
 * Full billing cycle through the real browser:
 *  1. Login as existing admin → Reset DB to clean state
 *  2. Create first owner via /sign-up (DB is empty after reset)
 *  3. Login as the new owner
 *  4. Upload Excel template via /admin/billing/import
 *  5. Preview batch
 *  6. Commit batch → RoomBilling records created
 *  7. Generate invoice for room 3201 via authenticated API
 *  8. Record payment ฿10,000 via authenticated API
 *  9. Verify invoice total = ฿10,000 and status = PAID
 * 10. Verify /api/analytics/revenue shows ฿10,000 for current month
 *
 * CSRF: Origin-header validation. Browser automatically sends correct Origin.
 *
 * Prerequisites:
 *   - Dev server must be running on APP_BASE_URL (or localhost:3000)
 *   - DB must have at least one ADMIN user (for initial login + reset)
 *   - apartment_excel_template.xlsx must exist in apps/erp/
 *
 * Run:
 *   cd apps/erp
 *   npx playwright test tests/e2e/billing-full-flow.test.ts --config tests/e2e/playwright.config.ts
 */

import { test, expect, type Page } from '@playwright/test';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
// Seed admin credentials — available after `npm run seed` or first-run setup
const SEED_ADMIN_USER = 'owner';
const SEED_ADMIN_PASS = 'Owner@12345';
// New owner credentials for the release test
const TEST_ADMIN_USER = 'releasetest';
const TEST_ADMIN_PASS = 'ReleaseTest@12345';
const TEST_ADMIN_DISPLAY = 'Release Test';
const TEST_ROOM = '3201';
const PAYMENT_AMOUNT = 10_000;

// ─── Authenticated fetch helpers ─────────────────────────────────────────────

/**
 * POST to the app API from within the browser context.
 * credentials: 'include' sends the session cookie.
 * Origin header is set automatically by the browser for same-origin fetches.
 */
async function apiPost(page: Page, path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return page.evaluate(
    // eslint-disable-next-line no-template-curly-in-string
    async ({ url, b, origin }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': origin, 'Referer': origin + '/' },
        credentials: 'include',
        body: JSON.stringify(b),
      });
      const json = await res.json();
      return { ok: res.ok, status: res.status, data: json as Record<string, unknown> };
    },
    { url: `${BASE_URL}${path}`, b: body, origin: BASE_URL }
  );
}

async function apiGet(page: Page, path: string): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return page.evaluate(
    async ({ url, origin }) => {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Origin': origin, 'Referer': origin + '/' },
        credentials: 'include',
      });
      const json = await res.json();
      return { ok: res.ok, status: res.status, data: json as Record<string, unknown> };
    },
    { url: `${BASE_URL}${path}`, origin: BASE_URL }
  );
}

// ─── Login helper ─────────────────────────────────────────────────────────────

async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', password);
  await page.click('[type="submit"]');
  await page.waitForURL(`${BASE_URL}/admin/dashboard`, { timeout: 20_000 });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Fresh-DB Release-Gate E2E', () => {

  test('Step 1: Login as admin and reset database to clean state', async ({ page }) => {
    // Login with existing seed admin (available in seeded DB)
    await loginAs(page, SEED_ADMIN_USER, SEED_ADMIN_PASS);

    // Reset DB — CSRF-exempt (setup wizard route) but requires ADMIN role
    const resetRes = await page.evaluate(async () => {
      const r = await fetch('/api/admin/setup/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
          'Referer': `${BASE_URL}/admin/`,
        },
        credentials: 'include',
        body: JSON.stringify({ backup: false }),
      });
      const json = await r.json();
      return { status: r.status, ok: r.ok, body: json };
    });

    console.log('[STEP 1] Reset response:', JSON.stringify(resetRes).slice(0, 200));
    expect(resetRes.ok).toBe(true);
    expect(resetRes.status).toBeLessThan(300);
  });

  test('Step 2: Create first owner account (DB is now empty)', async ({ page }) => {
    await page.goto(`${BASE_URL}/sign-up`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="displayName"]', TEST_ADMIN_DISPLAY);
    await page.fill('input[name="username"]', TEST_ADMIN_USER);
    await page.fill('input[name="email"]', 'release@test.com');
    await page.fill('input[name="password"]', TEST_ADMIN_PASS);
    await page.fill('input[name="confirmPassword"]', TEST_ADMIN_PASS);

    await page.click('[type="submit"]');
    // First user → auto-redirect to dashboard
    await page.waitForURL(`${BASE_URL}/admin/dashboard`, { timeout: 20_000 });

    console.log('[STEP 2] Owner created, at:', page.url());
    expect(page.url()).toContain('/admin/dashboard');
  });

  test('Step 3: Login as the new owner', async ({ page }) => {
    await loginAs(page, TEST_ADMIN_USER, TEST_ADMIN_PASS);
    console.log('[STEP 3] Logged in as test owner, at:', page.url());
    expect(page.url()).toContain('/admin/dashboard');
  });

  test('Step 4 & 5: Upload Excel template and preview import batch', async ({ page }) => {
    await loginAs(page, TEST_ADMIN_USER, TEST_ADMIN_PASS);

    await page.goto(`${BASE_URL}/admin/billing/import`);
    await page.waitForLoadState('networkidle');

    // Upload the apartment Excel template
    const excelPath = `${process.cwd()}/apartment_excel_template.xlsx`;
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
    await page.locator('input[type="file"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(excelPath);
    await page.waitForTimeout(1_500);

    // Preview batch
    await page.locator('button:has-text("Preview Batch")').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3_000); // React async render

    const bodyText = await page.textContent('body');
    const hasPreview = (bodyText ?? '').includes('Batch ID') || (bodyText ?? '').includes('rooms');
    console.log('[STEP 5] Preview visible:', hasPreview);
    console.log('[STEP 5] Page snippet:', (bodyText ?? '').slice(0, 300));

    // Template has 239 rooms across 8 floors
    expect(hasPreview).toBe(true);
  });

  test('Step 6: Commit import batch → creates RoomBilling records', async ({ page }) => {
    await loginAs(page, TEST_ADMIN_USER, TEST_ADMIN_PASS);

    await page.goto(`${BASE_URL}/admin/billing/import`);
    await page.waitForLoadState('networkidle');

    const excelPath = `${process.cwd()}/apartment_excel_template.xlsx`;
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
    await page.locator('input[type="file"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(excelPath);
    await page.waitForTimeout(1_500);

    await page.locator('button:has-text("Preview Batch")').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3_000);

    // Try Commit
    const commitBtn = page.locator('button:has-text("Commit Batch"), button:has-text("Commit")').first();
    const isDisabled = await commitBtn.isDisabled().catch(() => true);

    if (!isDisabled) {
      await commitBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3_000);
    } else {
      const body = await page.textContent('body');
      const reason = body?.match(/(\d+)\s*(warning|error|invalid)/i)?.[0];
      console.log('[STEP 6] Commit disabled:', reason ?? 'unknown reason');
    }

    // Verify billing records exist via API
    const billingRes = await apiGet(page, '/api/billing?pageSize=5');
    console.log('[STEP 6] Billing API status:', billingRes.status);
    expect(billingRes.ok).toBe(true);

    const billingRecords = (billingRes.data?.data as unknown[]) ?? [];
    console.log('[STEP 6] Billing records count:', billingRecords.length);
    expect(billingRecords.length).toBeGreaterThan(0);
  });

  test('Step 7: Generate invoice for room 3201 via authenticated API', async ({ page }) => {
    await loginAs(page, TEST_ADMIN_USER, TEST_ADMIN_PASS);

    // Find billing record for room 3201
    const billingRes = await apiGet(page, '/api/billing?roomNo=3201&pageSize=1');
    console.log('[STEP 7] Billing response:', JSON.stringify(billingRes.data).slice(0, 300));
    expect(billingRes.ok).toBe(true);

    interface BillingRecord { id: string; roomNo: string; status: string; totalDue: number | string }
    const rawData = billingRes.data?.data as { data?: BillingRecord[] } | BillingRecord[] | undefined;
    const records: BillingRecord[] = Array.isArray(rawData) ? rawData : (rawData?.data ?? []);
    const roomBilling = records.find((r) => r.roomNo === TEST_ROOM);
    expect(roomBilling).toBeDefined();
    console.log('[STEP 7] Billing record for room', TEST_ROOM, ':', (roomBilling as BillingRecord).id);

    // Generate invoice
    const genRes = await apiPost(page, '/api/invoices/generate', {
      billingRecordId: (roomBilling as BillingRecord).id,
    });
    console.log('[STEP 7] Generate status:', genRes.status, '| success:', genRes.data?.success);
    expect(genRes.ok).toBe(true);
    expect(genRes.data.success).toBe(true);

    interface Invoice { id: string; totalAmount: number | string; status: string }
    const invoice = genRes.data.data as Invoice;
    console.log('[STEP 7] Invoice:', invoice.id, '| totalAmount:', invoice.totalAmount, '| status:', invoice.status);

    // Store invoice ID in page context for step 8
    await page.evaluate((id: string) => { (window as unknown as Record<string, unknown>).__testInvoiceId = id; }, invoice.id);
  });

  test('Step 8: Record payment ฿10,000 for the invoice', async ({ page }) => {
    await loginAs(page, TEST_ADMIN_USER, TEST_ADMIN_PASS);

    // Retrieve invoice ID from step 7 (stored in page context)
    let invoiceId: string | undefined;
    try {
      invoiceId = await page.evaluate(() => (window as unknown as Record<string, unknown>).__testInvoiceId as string | undefined);
    } catch { /* not found */ }

    // Fallback: re-fetch invoice for room 3201
    if (!invoiceId) {
      const invRes = await apiGet(page, '/api/invoices?roomNo=3201&pageSize=5');
      interface InvoiceRec { id: string; room?: { roomNumber: string } }
      const invData = invRes.data?.data as { data?: InvoiceRec[] } | InvoiceRec[] | undefined;
      const invs: InvoiceRec[] = Array.isArray(invData) ? invData : (invData?.data ?? []);
      invoiceId = invs.find((i) => i.room?.roomNumber === TEST_ROOM)?.id;
    }

    expect(invoiceId).toBeDefined();
    console.log('[STEP 8] Invoice ID:', invoiceId);

    const payRes = await apiPost(page, '/api/payments', {
      invoiceId,
      amount: PAYMENT_AMOUNT,
      method: 'CASH',
      referenceNumber: 'E2E-TEST-001',
    });
    console.log('[STEP 8] Payment status:', payRes.status, '| success:', payRes.data?.success);
    console.log('[STEP 8] Payment response:', JSON.stringify(payRes.data).slice(0, 300));
    expect(payRes.ok).toBe(true);
    expect(payRes.data.success).toBe(true);
  });

  test('Step 9: Verify invoice total = ฿10,000 and status = PAID', async ({ page }) => {
    await loginAs(page, TEST_ADMIN_USER, TEST_ADMIN_PASS);

    const invRes = await apiGet(page, '/api/invoices?roomNo=3201&pageSize=5');
    expect(invRes.ok).toBe(true);

    interface InvoiceRec { id: string; totalAmount: number | string; status: string; room?: { roomNumber: string } }
    const invData = invRes.data?.data as { data?: InvoiceRec[] } | InvoiceRec[] | undefined;
    const invs: InvoiceRec[] = Array.isArray(invData) ? invData : (invData?.data ?? []);
    const target = invs.find((i) => i.room?.roomNumber === TEST_ROOM);

    expect(target).toBeDefined();
    const totalAmount = Number((target as InvoiceRec).totalAmount);
    console.log('[STEP 9] Invoice totalAmount for room', TEST_ROOM, ':', totalAmount);
    expect(totalAmount).toBe(PAYMENT_AMOUNT);

    const status = (target as InvoiceRec).status;
    console.log('[STEP 9] Invoice status:', status);
    expect(status).toBe('PAID');
  });

  test('Step 10: Verify /api/analytics/revenue shows ฿10,000 for current month', async ({ page }) => {
    await loginAs(page, TEST_ADMIN_USER, TEST_ADMIN_PASS);

    const revenueRes = await apiGet(page, '/api/analytics/revenue');
    console.log('[STEP 10] Revenue response:', JSON.stringify(revenueRes.data).slice(0, 400));
    expect(revenueRes.ok).toBe(true);
    expect(revenueRes.data.success).toBe(true);

    interface RevenuePoint { year: number; month: number; total: number }
    const revenueData = revenueRes.data.data as RevenuePoint[];
    expect(Array.isArray(revenueData)).toBe(true);

    const now = new Date();
    const currentMonthRevenue = revenueData.find(
      (r: RevenuePoint) => r.year === now.getFullYear() && r.month === now.getMonth() + 1
    );

    console.log('[STEP 10] Current month revenue:', currentMonthRevenue);
    expect(currentMonthRevenue?.total).toBe(PAYMENT_AMOUNT);
  });

});
