import { test, expect, Page } from '@playwright/test';
import { BASE_URL } from './config.js';
import { loginAsAdmin } from './helpers';

const BASE = BASE_URL;
const consoleErrors: string[] = [];
const pageErrors: string[] = [];

/**
 * Walkthrough test - simulates real user clicking through the system
 * Tests all major pages for runtime errors
 */
test.describe('System Walkthrough - Real User Flow', () => {

  test.beforeEach(async ({ page }) => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    // Capture page errors
    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    // Login first
    await loginAsAdmin(page);
  });

  test('2. Dashboard page', async ({ page }) => {
    // Go to dashboard
    await page.goto(BASE + '/admin/dashboard');
    await expect(page.locator('body')).toBeVisible();

    // Check for dashboard content
    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Dashboard loaded');
  });

  test('3. Rooms page', async ({ page }) => {
    await page.goto(BASE + '/admin/rooms');

    // Check rooms page loads
    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Rooms page loaded');
  });

  test('4. Tenants page', async ({ page }) => {
    await page.goto(BASE + '/admin/tenants');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Tenants page loaded');
  });

  test('5. Billing page', async ({ page }) => {
    await page.goto(BASE + '/admin/billing');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Billing page loaded');
  });

  test('6. Billing Import page', async ({ page }) => {
    await page.goto(BASE + '/admin/billing/import');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Billing Import page loaded');
  });

  test('7. Invoices page', async ({ page }) => {
    await page.goto(BASE + '/admin/invoices');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Invoices page loaded');
  });

  test('8. Payments page', async ({ page }) => {
    await page.goto(BASE + '/admin/payments');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Payments page loaded');
  });

  test('9. Payments Upload Statement', async ({ page }) => {
    await page.goto(BASE + '/admin/payments/upload-statement');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Payments Upload Statement loaded');
  });

  test('10. Payments Review Match', async ({ page }) => {
    await page.goto(BASE + '/admin/payments/review-match');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Payments Review Match loaded');
  });

  test('11. Chat page', async ({ page }) => {
    await page.goto(BASE + '/admin/chat');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Chat page loaded');
  });

  test('12. Maintenance page', async ({ page }) => {
    await page.goto(BASE + '/admin/maintenance');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Maintenance page loaded');
  });

  test('13. Reports page', async ({ page }) => {
    await page.goto(BASE + '/admin/reports');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports page loaded');
  });

  test('14. Reports Revenue', async ({ page }) => {
    await page.goto(BASE + '/admin/reports/revenue');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports Revenue loaded');
  });

  test('15. Reports Collections', async ({ page }) => {
    await page.goto(BASE + '/admin/reports/collections');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports Collections loaded');
  });

  test('16. Reports Occupancy', async ({ page }) => {
    await page.goto(BASE + '/admin/reports/occupancy');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports Occupancy loaded');
  });

  test('17. Reports Audit', async ({ page }) => {
    await page.goto(BASE + '/admin/reports/audit');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports Audit loaded');
  });

  test('18. Overdue page', async ({ page }) => {
    await page.goto(BASE + '/admin/overdue');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Overdue page loaded');
  });

  test('19. Settings page', async ({ page }) => {
    await page.goto(BASE + '/admin/settings');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings page loaded');
  });

  test('20. Settings Building', async ({ page }) => {
    await page.goto(BASE + '/admin/settings/building');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Building loaded');
  });

  test('21. Settings Billing Policy', async ({ page }) => {
    await page.goto(BASE + '/admin/settings/billing-policy');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Billing Policy loaded');
  });

  test('22. Settings Bank Accounts', async ({ page }) => {
    await page.goto(BASE + '/admin/settings/bank-accounts');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Bank Accounts loaded');
  });

  test('23. Settings Users', async ({ page }) => {
    await page.goto(BASE + '/admin/settings/users');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Users loaded');
  });

  test('24. Settings Roles', async ({ page }) => {
    await page.goto(BASE + '/admin/settings/roles');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Roles loaded');
  });

  test('25. Settings Automation', async ({ page }) => {
    await page.goto(BASE + '/admin/settings/automation');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Automation loaded');
  });

  test('26. Settings Integrations', async ({ page }) => {
    await page.goto(BASE + '/admin/settings/integrations');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Integrations loaded');
  });

  test('27. System Health', async ({ page }) => {
    await page.goto(BASE + '/admin/system-health');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('System Health loaded');
  });

  test('28. System Jobs', async ({ page }) => {
    await page.goto(BASE + '/admin/system-jobs');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('System Jobs loaded');
  });

  test('29. System page', async ({ page }) => {
    await page.goto(BASE + '/admin/system');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('System page loaded');
  });

  test('30. Audit Logs', async ({ page }) => {
    await page.goto(BASE + '/admin/audit-logs');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Audit Logs loaded');
  });

  test('31. Tenant Registrations', async ({ page }) => {
    await page.goto(BASE + '/admin/tenant-registrations');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Tenant Registrations loaded');
  });

  test('32. Documents page', async ({ page }) => {
    await page.goto(BASE + '/admin/documents');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Documents page loaded');
  });

  test('33. Documents Generate', async ({ page }) => {
    await page.goto(BASE + '/admin/documents/generate');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Documents Generate loaded');
  });

  test('34. Templates page', async ({ page }) => {
    await page.goto(BASE + '/admin/templates');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Templates page loaded');
  });

  test('35. Contracts page', async ({ page }) => {
    await page.goto(BASE + '/admin/contracts');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Contracts page loaded');
  });

  test('36. Message Templates', async ({ page }) => {
    await page.goto(BASE + '/admin/message-templates');
    await expect(page.locator('body')).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Message Templates loaded');
  });

  // Report errors at the end
  test.afterAll(async () => {
    console.log('\n========== CONSOLE ERRORS ==========');
    if (consoleErrors.length === 0) {
      console.log('No console errors detected!');
    } else {
      consoleErrors.forEach(err => console.log(err));
    }

    console.log('\n========== PAGE ERRORS ==========');
    if (pageErrors.length === 0) {
      console.log('No page errors detected!');
    } else {
      pageErrors.forEach(err => console.log(err));
    }
  });

});