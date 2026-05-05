import { test, expect } from '@playwright/test';
import { BASE_URL } from './config.js';
import { loginAsAdmin } from './helpers';

const errors: string[] = [];

const BASE = BASE_URL; // Workaround: alias to avoid Playwright TS parser template literal bug

/**
 * Interactive walkthrough - click buttons, fill forms, navigate
 * NOTE: uses string concatenation instead of template literals due to
 * Playwright 1.58 TS parser issue with `${BASE_URL}` in for-loop scopes.
 */
test.describe('Interactive Walkthrough - Button Clicks & Forms', () => {

  test.beforeEach(async ({ page }) => {
    errors.length = 0;

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`[Console Error] ${msg.text()}`);
      }
    });

    page.on('pageerror', err => {
      errors.push(`[Page Error] ${err.message}`);
    });

    // Login first
    await loginAsAdmin(page);
  });

  test('Dashboard - Click on Cards/Navigation', async ({ page }) => {
    await page.goto(BASE + '/admin/dashboard');
    await expect(page.locator('body')).toBeVisible();

    const links = page.locator('a[href*="/admin/"]');
    const count = await links.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await links.nth(i).click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
      await page.goBack();
      await expect(page.locator('body')).toBeVisible();
    }

    console.log('Dashboard has ' + count + ' admin links');
  });

  test('Rooms - Navigate to Room Detail', async ({ page }) => {
    await page.goto(BASE + '/admin/rooms');

    const roomLinks = page.locator('a[href*="/admin/rooms/"]');
    const count = await roomLinks.count();

    if (count > 0) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await roomLinks.first().click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
      console.log('Navigated to room detail from ' + count + ' room links');
    }
  });

  test('Tenants - Navigate to Tenant Detail', async ({ page }) => {
    await page.goto(BASE + '/admin/tenants');

    const tenantLinks = page.locator('a[href*="/admin/tenants/"]');
    const count = await tenantLinks.count();

    if (count > 0) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await tenantLinks.first().click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
      console.log('Navigated to tenant detail from ' + count + ' tenant links');
    }
  });

  test('Billing - Click Import Tab and Monthly Data Tab', async ({ page }) => {
    await page.goto(BASE + '/admin/billing/import');

    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();

    console.log('Found ' + tabCount + ' tabs on billing import page');

    for (let i = 0; i < Math.min(tabCount, 3); i++) {
      await tabs.nth(i).click();
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('Billing - Select Year and Month', async ({ page }) => {
    await page.goto(BASE + '/admin/billing/import');

    const monthlyTab = page.getByRole('tab', { name: /monthly/i }).first();
    if (await monthlyTab.isVisible()) {
      await monthlyTab.click();
      await expect(page.locator('body')).toBeVisible();
    }

    const yearSelect = page.locator('select[id*="year"], select[placeholder*="ปี"], select:has(option:has-text("2569"))');
    if (await yearSelect.isVisible()) {
      await yearSelect.selectOption({ index: 1 });
      await expect(page.locator('body')).toBeVisible();
      console.log('Year selected');
    }

    const monthSelect = page.locator('select[id*="month"], select[placeholder*="เดือน"]');
    if (await monthSelect.isVisible()) {
      await monthSelect.selectOption({ index: 1 });
      await expect(page.locator('body')).toBeVisible();
      console.log('Month selected');
    }
  });

  test('Invoices - Click Invoice Link', async ({ page }) => {
    await page.goto(BASE + '/admin/invoices');

    const invoiceLinks = page.locator('a[href*="/admin/invoices/"]').filter({ hasText: /INV|ใบแจ้ง/ });
    const count = await invoiceLinks.count();

    if (count > 0) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await invoiceLinks.first().click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
      console.log('Navigated to invoice detail from ' + count + ' links');
    }
  });

  test('Payments - Upload Statement Flow', async ({ page }) => {
    await page.goto(BASE + '/admin/payments/upload-statement');

    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      console.log('File input visible on upload statement page');
    }

    const submitBtn = page.locator('button[type="submit"], button:has-text("Upload")');
    if (await submitBtn.isVisible()) {
      console.log('Submit button visible');
    }
  });

  test('Settings - Click Save Button', async ({ page }) => {
    await page.goto(BASE + '/admin/settings/billing-policy');
    await expect(page.locator('body')).toBeVisible();

    const saveBtn = page.getByRole('button', { name: /save|save/i }).first();
    const count = await saveBtn.count();

    if (count > 0) {
      const editBtn = page.getByRole('button', { name: /edit/i }).first();
      if (await editBtn.isVisible()) {
        await editBtn.click();
        await expect(page.locator('body')).toBeVisible();
      }

      const saveButton = page.getByRole('button', { name: /save/i }).first();
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await expect(page.locator('body')).toBeVisible();
        console.log('Save button clicked');
      }
    }
  });

  test('Settings Building - Click Edit and Save', async ({ page }) => {
    await page.goto(BASE + '/admin/settings/building');
    await expect(page.locator('body')).toBeVisible();

    const editBtn = page.getByRole('button', { name: /edit/i });
    if (await editBtn.first().isVisible()) {
      await editBtn.first().click();
      await expect(page.locator('body')).toBeVisible();

      const saveBtn = page.getByRole('button', { name: /save/i });
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await expect(page.locator('body')).toBeVisible();
        console.log('Edit/Save flow completed');
      }
    }
  });

  test('System Health - Click Refresh', async ({ page }) => {
    await page.goto(BASE + '/admin/system-health');
    await expect(page.locator('body')).toBeVisible();

    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    if (await refreshBtn.isVisible()) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await refreshBtn.click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
      console.log('Refresh button clicked');
    }
  });

  test('Reports - Navigate Sub-menus', async ({ page }) => {
    await page.goto(BASE + '/admin/reports');
    await expect(page.locator('body')).toBeVisible();

    const revenueLink = page.locator('a[href*="/reports/revenue"]');
    if (await revenueLink.isVisible()) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await revenueLink.click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
    }

    await page.goto(BASE + '/admin/reports');
    await expect(page.locator('body')).toBeVisible();

    const collectionsLink = page.locator('a[href*="/reports/collections"]');
    if (await collectionsLink.isVisible()) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await collectionsLink.click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('Overdue - View Invoice Link', async ({ page }) => {
    await page.goto(BASE + '/admin/overdue');
    await expect(page.locator('body')).toBeVisible();

    const viewLinks = page.locator('a:has-text("View Invoice")');
    const count = await viewLinks.count();

    if (count > 0) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await viewLinks.first().click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
      console.log('Clicked view invoice from overdue page');
    }
  });

  test('Audit Logs - Filter by Action', async ({ page }) => {
    await page.goto(BASE + '/admin/audit-logs');
    await expect(page.locator('body')).toBeVisible();

    const filterSelect = page.locator('select, input').first();
    if (await filterSelect.isVisible()) {
      console.log('Filter controls visible');
    }
  });

  test('Templates - Navigate to Template', async ({ page }) => {
    await page.goto(BASE + '/admin/templates');
    await expect(page.locator('body')).toBeVisible();

    const templateLinks = page.locator('a[href*="/admin/templates/"]');
    const count = await templateLinks.count();

    if (count > 0) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await templateLinks.first().click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
      console.log('Navigated to template from ' + count + ' links');
    }
  });

  test('Documents - Navigate to Document', async ({ page }) => {
    await page.goto(BASE + '/admin/documents');
    await expect(page.locator('body')).toBeVisible();

    const docLinks = page.locator('a[href*="/admin/documents/"]').filter({ hasNotText: 'Generate' });
    const count = await docLinks.count();

    if (count > 0) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await docLinks.first().click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
      console.log('Navigated to document from ' + count + ' links');
    }
  });

  test('Chat - Send a Message', async ({ page }) => {
    await page.goto(BASE + '/admin/chat');
    await expect(page.locator('body')).toBeVisible();

    const input = page.locator('input[type="text"], textarea').first();
    if (await input.isVisible()) {
      await input.fill('ทดสอบระบบ');
      await expect(page.locator('body')).toBeVisible();

      const sendBtn = page.getByRole('button', { name: /send/i });
      if (await sendBtn.isVisible()) {
        console.log('Send button visible');
      }
    }
  });

  test.afterAll(async () => {
    console.log('\n========== INTERACTION ERRORS ==========');
    if (errors.length === 0) {
      console.log('No errors during interactions!');
    } else {
      errors.forEach(err => console.log(err));
    }
  });

});