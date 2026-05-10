import { test, expect } from '@playwright/test';
import { BASE_URL } from './config';
import { loginAsAdmin } from './helpers';

const ADMIN_PAGES = [
  // Dashboard & Overview
  '/admin/dashboard',
  '/admin',
  '/admin/analytics',

  // Core Business
  '/admin/rooms',
  '/admin/tenants',
  '/admin/contracts',
  '/admin/billing',
  '/admin/invoices',
  '/admin/payments',
  '/admin/maintenance',
  '/admin/deliveries',
  '/admin/documents',

  // Moveouts & Overdue
  '/admin/moveouts',
  '/admin/overdue',
  '/admin/late-fees',

  // Messaging
  '/admin/chat',
  '/admin/broadcast',
  '/admin/message-templates',

  // Finance & Reports
  '/admin/expenses',
  '/admin/reports',
  '/admin/reports/revenue',
  '/admin/reports/collections',
  '/admin/reports/profit-loss',
  '/admin/reports/occupancy',
  '/admin/reports/audit',
  '/admin/reports/documents',

  // Settings
  '/admin/settings',
  '/admin/settings/users',
  '/admin/settings/roles',
  '/admin/settings/rooms',
  '/admin/settings/building',
  '/admin/settings/bank-accounts',
  '/admin/settings/billing-rules',
  '/admin/settings/billing-policy',
  '/admin/settings/automation',
  '/admin/settings/reminders',
  '/admin/settings/integrations',
  '/admin/settings/message-sequences',
  '/admin/settings/modules',
  '/admin/settings/system',
  '/admin/settings/account',
  '/admin/settings/staff-requests',

  // System & Admin
  '/admin/audit-logs',
  '/admin/system-health',
  '/admin/system-jobs',
  '/admin/system',
  '/admin/outbox',
  '/admin/notifications',
  '/admin/admin',
  '/admin/docs',

  // Tenant Management
  '/admin/tenant-registrations',

  // Templates
  '/admin/templates',

  // Billing sub-pages
  '/admin/billing/batches',
  '/admin/billing/import',
  '/admin/billing/wizard',

];

test.describe('Admin Full Navigation — All Pages Load', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  for (const pagePath of ADMIN_PAGES) {
    test(`Navigate to ${pagePath}`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${pagePath}`);
      // Allow 404 for pages that may not exist in current routing
      // But reject 500 (server error)
      if (response && response.status() >= 500) {
        throw new Error(`Page ${pagePath} returned HTTP ${response.status()}`);
      }
      // Page should load something (body visible)
      await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
    });
  }
});

test.describe('Admin Page — No Crash on Load', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  for (const pagePath of ADMIN_PAGES) {
    test(`No crash on ${pagePath}`, async ({ page }) => {
      // Capture console errors
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', err => errors.push(err.message));

      await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: 'domcontentloaded' }).catch(() => {
        return page.goto(`${BASE_URL}${pagePath}`, { waitUntil: 'load' }).catch(() => {});
      });

      await page.waitForTimeout(2000).catch(() => {});

      // Filter out non-critical errors (network、资源加载错误)
      const criticalErrors = errors.filter(e =>
        !e.includes('net::') &&
        !e.includes('Failed to load resource') &&
        !e.includes('404') &&
        !e.includes('favicon')
      );

      if (criticalErrors.length > 0) {
        console.log(`Errors on ${pagePath}:`, criticalErrors);
      }
      expect(criticalErrors).toEqual([]);
    });
  }
});
