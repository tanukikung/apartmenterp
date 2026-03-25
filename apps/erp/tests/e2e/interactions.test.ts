import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3003';
const errors: string[] = [];

/**
 * Interactive walkthrough - click buttons, fill forms, navigate
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
    await page.goto(BASE_URL + '/login');
    const usernameInput = page.locator('input[name="username"], input[type="text"]').first();
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

    if (await usernameInput.isVisible()) {
      await usernameInput.fill('owner');
      await passwordInput.fill('Owner@12345');
      const submitButton = page.locator('button[type="submit"]').first();
      await submitButton.click();
      await page.waitForTimeout(2000);
    }
  });

  test('Dashboard - Click on Cards/Navigation', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Try clicking any visible buttons/links
    const links = page.locator('a[href*="/admin/"]');
    const count = await links.count();

    // Click first few links if any
    for (let i = 0; i < Math.min(count, 5); i++) {
      await links.nth(i).click();
      await page.waitForTimeout(500);
      await page.goBack();
      await page.waitForTimeout(500);
    }

    console.log(`Dashboard has ${count} admin links`);
  });

  test('Rooms - Navigate to Room Detail', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/rooms');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click first room link if visible
    const roomLinks = page.locator('a[href*="/admin/rooms/"]');
    const count = await roomLinks.count();

    if (count > 0) {
      await roomLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log(`Navigated to room detail from ${count} room links`);
    }
  });

  test('Tenants - Navigate to Tenant Detail', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/tenants');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const tenantLinks = page.locator('a[href*="/admin/tenants/"]');
    const count = await tenantLinks.count();

    if (count > 0) {
      await tenantLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log(`Navigated to tenant detail from ${count} tenant links`);
    }
  });

  test('Billing - Click Import Tab and Monthly Data Tab', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/billing/import');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for tabs
    const tabs = page.locator('[role="tab"], button:has-text("มาตรฐาน"), button:has-text("รายเดือน")');
    const tabCount = await tabs.count();

    console.log(`Found ${tabCount} tabs on billing import page`);

    // Try clicking tabs if found
    for (let i = 0; i < Math.min(tabCount, 3); i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(500);
    }
  });

  test('Billing - Select Year and Month', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/billing/import');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click on Monthly Data tab first
    const monthlyTab = page.locator('button:has-text("รายเดือน"), button:has-text("Monthly")');
    if (await monthlyTab.isVisible()) {
      await monthlyTab.click();
      await page.waitForTimeout(500);
    }

    // Look for year selector
    const yearSelect = page.locator('select[id*="year"], select[placeholder*="ปี"], select:has(option:has-text("2569"))');
    if (await yearSelect.isVisible()) {
      await yearSelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
      console.log('Year selected');
    }

    // Look for month selector
    const monthSelect = page.locator('select[id*="month"], select[placeholder*="เดือน"]');
    if (await monthSelect.isVisible()) {
      await monthSelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
      console.log('Month selected');
    }
  });

  test('Invoices - Click Invoice Link', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/invoices');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const invoiceLinks = page.locator('a[href*="/admin/invoices/"]').filter({ hasText: /INV|ใบแจ้ง/ });
    const count = await invoiceLinks.count();

    if (count > 0) {
      await invoiceLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log(`Navigated to invoice detail from ${count} links`);
    }
  });

  test('Payments - Upload Statement Flow', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/payments/upload-statement');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check for file input
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      console.log('File input visible on upload statement page');
    }

    // Check for submit button
    const submitBtn = page.locator('button[type="submit"], button:has-text("อัพโหลด"), button:has-text("Upload")');
    if (await submitBtn.isVisible()) {
      console.log('Submit button visible');
    }
  });

  test('Settings - Click Save Button', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings/billing-policy');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for save button
    const saveBtn = page.locator('button:has-text("บันทึก"), button:has-text("Save"), button:has-text("แก้ไข")');
    const count = await saveBtn.count();

    if (count > 0) {
      // Click edit first if visible
      const editBtn = page.locator('button:has-text("แก้ไข")').first();
      if (await editBtn.isVisible()) {
        await editBtn.click();
        await page.waitForTimeout(500);
      }

      // Then click save
      const saveButton = page.locator('button:has-text("บันทึก"), button:has-text("Save")').first();
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await page.waitForTimeout(500);
        console.log('Save button clicked');
      }
    }
  });

  test('Settings Building - Click Edit and Save', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings/building');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for edit button
    const editBtn = page.locator('button:has-text("แก้ไข"), button:has-text("Edit")');
    if (await editBtn.first().isVisible()) {
      await editBtn.first().click();
      await page.waitForTimeout(500);

      // Look for save button
      const saveBtn = page.locator('button:has-text("บันทึก"), button:has-text("Save")');
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForTimeout(500);
        console.log('Edit/Save flow completed');
      }
    }
  });

  test('System Health - Click Refresh', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/system-health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for refresh button
    const refreshBtn = page.locator('button:has-text("รีเฟรช"), button:has-text("Refresh")');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(1000);
      console.log('Refresh button clicked');
    }
  });

  test('Reports - Navigate Sub-menus', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click on revenue link
    const revenueLink = page.locator('a[href*="/reports/revenue"]');
    if (await revenueLink.isVisible()) {
      await revenueLink.click();
      await page.waitForTimeout(1000);
    }

    // Go back to reports
    await page.goto(BASE_URL + '/admin/reports');
    await page.waitForTimeout(500);

    // Click on collections
    const collectionsLink = page.locator('a[href*="/reports/collections"]');
    if (await collectionsLink.isVisible()) {
      await collectionsLink.click();
      await page.waitForTimeout(1000);
    }
  });

  test('Overdue - View Invoice Link', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/overdue');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for view invoice links
    const viewLinks = page.locator('a:has-text("ดูใบแจ้ง"), a:has-text("View Invoice")');
    const count = await viewLinks.count();

    if (count > 0) {
      await viewLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log(`Clicked view invoice from overdue page`);
    }
  });

  test('Audit Logs - Filter by Action', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/audit-logs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for filter controls
    const filterSelect = page.locator('select, input').first();
    if (await filterSelect.isVisible()) {
      console.log('Filter controls visible');
    }
  });

  test('Templates - Navigate to Template', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/templates');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const templateLinks = page.locator('a[href*="/admin/templates/"]');
    const count = await templateLinks.count();

    if (count > 0) {
      await templateLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log(`Navigated to template from ${count} links`);
    }
  });

  test('Documents - Navigate to Document', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/documents');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const docLinks = page.locator('a[href*="/admin/documents/"]').filter({ hasNotText: 'Generate' });
    const count = await docLinks.count();

    if (count > 0) {
      await docLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log(`Navigated to document from ${count} links`);
    }
  });

  test('Chat - Send a Message', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for message input
    const input = page.locator('input[type="text"], textarea');
    if (await input.isVisible()) {
      await input.fill('ทดสอบระบบ');
      await page.waitForTimeout(300);

      // Look for send button
      const sendBtn = page.locator('button:has-text("ส่ง"), button:has-text("Send")');
      if (await sendBtn.isVisible()) {
        console.log('Send button visible');
      }
    }
  });

  // Report errors
  test.afterAll(async () => {
    console.log('\n========== INTERACTION ERRORS ==========');
    if (errors.length === 0) {
      console.log('No errors during interactions!');
    } else {
      errors.forEach(err => console.log(err));
    }
  });

});
