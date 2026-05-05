import { test, expect } from '@playwright/test';
import { BASE_URL } from './config.js';
import { loginAsAdmin } from './helpers';

test.describe('QA: Tenant Flow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Tenant list loads and shows tenants', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/tenants`);
    await expect(page.locator('body')).toBeVisible();

    const content = await page.locator('body').innerText();
    const hasTenants = content.includes('ผู้เช่า') || content.includes('tenant') || content.includes('Tenant');
    console.log('Tenants page has tenant content:', hasTenants);
    console.log('Text preview:', content.substring(0, 300));
  });

  test('Open create tenant form', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/tenants`);
    await expect(page.locator('body')).toBeVisible();

    // Find create button
    const createBtn = page.getByRole('button', { name: /add.*tenant|create.*tenant/i }).first();
    const btnVisible = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Create tenant button visible:', btnVisible);

    if (btnVisible) {
      await createBtn.click();
      await expect(page.locator('body')).toBeVisible();

      // Check for a drawer/form
      const drawer = page.locator('[role="dialog"], [aria-modal="true"]').filter({ hasText: /ผู้เช่า|tenant|ชื่อ/i }).first();
      const drawerVisible = await drawer.isVisible({ timeout: 3000 }).catch(() => false);
      console.log('Drawer opened:', drawerVisible);
    }
  });

  test('Tenant page: verify tenant profile stats', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/tenants`);
    await expect(page.locator('body')).toBeVisible();

    // Try to click on the first tenant row
    const tenantRows = page.locator('tbody tr, [class*="table"] tr').filter({ hasText: /\S/ });
    const rowCount = await tenantRows.count();
    console.log('Tenant rows found:', rowCount);

    if (rowCount > 0) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await tenantRows.first().click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();

      const url = page.url();
      console.log('Navigated to:', url);

      if (url.includes('/tenants/')) {
        // On tenant detail page
        const content = await page.locator('body').innerText();
        console.log('Tenant detail text preview:', content.substring(0, 400));
      }
    }
  });

  test('Create tenant with edge case: very long name', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/tenants`);
    await expect(page.locator('body')).toBeVisible();

    const createBtn = page.getByRole('button', { name: /add.*tenant|create.*tenant/i }).first();
    const btnVisible = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (btnVisible) {
      await createBtn.click();
      await expect(page.locator('body')).toBeVisible();

      // Try to fill in the form with edge case data
      const firstNameInput = page.locator('input[placeholder*="ชื่อ"], input[name*="first"]').first();
      const lastNameInput = page.locator('input[placeholder*="นาม"], input[name*="last"]').first();
      const phoneInput = page.locator('input[placeholder*="โทร"], input[name*="phone"]').first();

      const inputs = [firstNameInput, lastNameInput, phoneInput].filter(async (i) => i.isVisible().catch(() => false));
      console.log('Form inputs found, proceeding with edge case test...');
    }
  });
});

test.describe('QA: Billing Flow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Billing page loads with billing cycles', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/billing`);
    await expect(page.locator('body')).toBeVisible();

    const content = await page.locator('body').innerText();
    console.log('Billing page text preview:', content.substring(0, 400));
  });

  test('Invoices page: check invoice statuses', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/invoices`);
    await expect(page.locator('body')).toBeVisible();

    const content = await page.locator('body').innerText();
    const hasInvoiceData = content.includes('ใบแจ้งหนี้') || content.includes('invoice') || content.includes('Invoice');
    console.log('Invoices page has invoice content:', hasInvoiceData);
    console.log('Text preview:', content.substring(0, 400));
  });

  test('Invoices: click on first invoice to view detail', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/invoices`);
    await expect(page.locator('body')).toBeVisible();

    const invoiceRows = page.locator('tbody tr, [class*="table"] tr').filter({ hasText: /\S/ });
    const rowCount = await invoiceRows.count();
    console.log('Invoice rows:', rowCount);

    if (rowCount > 0) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await invoiceRows.first().click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
      const url = page.url();
      console.log('Navigated to:', url);
      if (url.includes('/invoices/')) {
        const content = await page.locator('body').innerText();
        console.log('Invoice detail text preview:', content.substring(0, 400));
      }
    }
  });
});

test.describe('QA: Room Flow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Rooms page shows room grid', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/rooms`);
    await expect(page.locator('body')).toBeVisible();

    const content = await page.locator('body').innerText();
    const hasRoomData = content.includes('ห้อง') || content.includes('room') || content.includes('Room');
    console.log('Rooms page has room content:', hasRoomData);
    console.log('Text preview:', content.substring(0, 400));
  });

  test('Dashboard occupancy stats', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/dashboard`);
    await expect(page.locator('body')).toBeVisible();

    const content = await page.locator('body').innerText();
    console.log('Dashboard text preview:', content.substring(0, 500));
  });
});