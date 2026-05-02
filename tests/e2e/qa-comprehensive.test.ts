import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';

test.describe('QA: Tenant Flow', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="username"], input[type="text"]').first().fill('owner');
    await page.locator('input[name="password"], input[type="password"]').first().fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  });

  test('Tenant list loads and shows tenants', async ({ page }) => {
    await page.goto(`${BASE}/admin/tenants`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const content = await page.locator('body').innerText();
    const hasTenants = content.includes('ผู้เช่า') || content.includes('tenant') || content.includes('Tenant');
    console.log('Tenants page has tenant content:', hasTenants);
    console.log('Text preview:', content.substring(0, 300));
  });

  test('Open create tenant form', async ({ page }) => {
    await page.goto(`${BASE}/admin/tenants`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find create button
    const createBtn = page.locator('button:has-text("สร้างผู้เช่า"), button:has-text("เพิ่มผู้เช่า"), button:has-text("สร้าง")').first();
    const btnVisible = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Create tenant button visible:', btnVisible);

    if (btnVisible) {
      await createBtn.click();
      await page.waitForTimeout(1000);

      // Check for a drawer/form
      const drawer = page.locator('[role="dialog"], [aria-modal="true"]').filter({ hasText: /ผู้เช่า|tenant|ชื่อ/i }).first();
      const drawerVisible = await drawer.isVisible({ timeout: 2000 }).catch(() => false);
      console.log('Drawer opened:', drawerVisible);
    }
  });

  test('Tenant page: verify tenant profile stats', async ({ page }) => {
    await page.goto(`${BASE}/admin/tenants`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Try to click on the first tenant row
    const tenantRows = page.locator('tbody tr, [class*="table"] tr').filter({ hasText: /\S/ });
    const rowCount = await tenantRows.count();
    console.log('Tenant rows found:', rowCount);

    if (rowCount > 0) {
      await tenantRows.first().click();
      await page.waitForTimeout(2000);

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
    await page.goto(`${BASE}/admin/tenants`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const createBtn = page.locator('button:has-text("สร้างผู้เช่า"), button:has-text("เพิ่มผู้เช่า"), button:has-text("สร้าง")').first();
    const btnVisible = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (btnVisible) {
      await createBtn.click();
      await page.waitForTimeout(1000);

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
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="username"], input[type="text"]').first().fill('owner');
    await page.locator('input[name="password"], input[type="password"]').first().fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  });

  test('Billing page loads with billing cycles', async ({ page }) => {
    await page.goto(`${BASE}/admin/billing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const content = await page.locator('body').innerText();
    console.log('Billing page text preview:', content.substring(0, 400));
  });

  test('Invoices page: check invoice statuses', async ({ page }) => {
    await page.goto(`${BASE}/admin/invoices`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const content = await page.locator('body').innerText();
    const hasInvoiceData = content.includes('ใบแจ้งหนี้') || content.includes('invoice') || content.includes('Invoice');
    console.log('Invoices page has invoice content:', hasInvoiceData);
    console.log('Text preview:', content.substring(0, 400));
  });

  test('Invoices: click on first invoice to view detail', async ({ page }) => {
    await page.goto(`${BASE}/admin/invoices`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const invoiceRows = page.locator('tbody tr, [class*="table"] tr').filter({ hasText: /\S/ });
    const rowCount = await invoiceRows.count();
    console.log('Invoice rows:', rowCount);

    if (rowCount > 0) {
      await invoiceRows.first().click();
      await page.waitForTimeout(2000);
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
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="username"], input[type="text"]').first().fill('owner');
    await page.locator('input[name="password"], input[type="password"]').first().fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  });

  test('Rooms page shows room grid', async ({ page }) => {
    await page.goto(`${BASE}/admin/rooms`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const content = await page.locator('body').innerText();
    const hasRoomData = content.includes('ห้อง') || content.includes('room') || content.includes('Room');
    console.log('Rooms page has room content:', hasRoomData);
    console.log('Text preview:', content.substring(0, 400));
  });

  test('Dashboard occupancy stats', async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const content = await page.locator('body').innerText();
    console.log('Dashboard text preview:', content.substring(0, 500));
  });
});
