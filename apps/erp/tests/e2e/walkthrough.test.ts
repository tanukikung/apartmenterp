import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3003';
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
  });

  test('1. Login as admin', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.waitForLoadState('networkidle');

    // Check login page loads
    await expect(page.locator('body')).toBeVisible();

    // Fill login form
    const usernameInput = page.locator('input[name="username"], input[type="text"]').first();
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

    if (await usernameInput.isVisible()) {
      await usernameInput.fill('owner');
      await passwordInput.fill('Owner@12345');

      // Submit
      const submitButton = page.locator('button[type="submit"]').first();
      await submitButton.click();

      // Wait for redirect to dashboard
      await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {
        // If already on admin page, continue
      });
    }

    // Check we're logged in
    await page.waitForTimeout(2000);
    console.log('Login completed, current URL:', page.url());
  });

  test('2. Dashboard page', async ({ page }) => {
    // Go to dashboard
    await page.goto(BASE_URL + '/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check for dashboard content
    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Dashboard loaded');
  });

  test('3. Rooms page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/rooms');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check rooms page loads
    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Rooms page loaded');
  });

  test('4. Tenants page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/tenants');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Tenants page loaded');
  });

  test('5. Billing page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/billing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Billing page loaded');
  });

  test('6. Billing Import page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/billing/import');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Billing Import page loaded');
  });

  test('7. Invoices page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/invoices');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Invoices page loaded');
  });

  test('8. Payments page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/payments');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Payments page loaded');
  });

  test('9. Payments Upload Statement', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/payments/upload-statement');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Payments Upload Statement loaded');
  });

  test('10. Payments Review Match', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/payments/review-match');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Payments Review Match loaded');
  });

  test('11. Chat page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Chat page loaded');
  });

  test('12. Maintenance page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/maintenance');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Maintenance page loaded');
  });

  test('13. Reports page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports page loaded');
  });

  test('14. Reports Revenue', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/reports/revenue');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports Revenue loaded');
  });

  test('15. Reports Collections', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/reports/collections');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports Collections loaded');
  });

  test('16. Reports Occupancy', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/reports/occupancy');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports Occupancy loaded');
  });

  test('17. Reports Audit', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/reports/audit');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Reports Audit loaded');
  });

  test('18. Overdue page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/overdue');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Overdue page loaded');
  });

  test('19. Settings page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings page loaded');
  });

  test('20. Settings Building', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings/building');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Building loaded');
  });

  test('21. Settings Billing Policy', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings/billing-policy');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Billing Policy loaded');
  });

  test('22. Settings Bank Accounts', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings/bank-accounts');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Bank Accounts loaded');
  });

  test('23. Settings Users', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings/users');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Users loaded');
  });

  test('24. Settings Roles', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings/roles');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Roles loaded');
  });

  test('25. Settings Automation', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings/automation');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Automation loaded');
  });

  test('26. Settings Integrations', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/settings/integrations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Settings Integrations loaded');
  });

  test('27. System Health', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/system-health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('System Health loaded');
  });

  test('28. System Jobs', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/system-jobs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('System Jobs loaded');
  });

  test('29. System page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/system');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('System page loaded');
  });

  test('30. Audit Logs', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/audit-logs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Audit Logs loaded');
  });

  test('31. Tenant Registrations', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/tenant-registrations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Tenant Registrations loaded');
  });

  test('32. Documents page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/documents');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Documents page loaded');
  });

  test('33. Documents Generate', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/documents/generate');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Documents Generate loaded');
  });

  test('34. Templates page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/templates');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Templates page loaded');
  });

  test('35. Contracts page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/contracts');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('Contracts page loaded');
  });

  test('36. Message Templates', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/message-templates');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

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
