import { test, expect, type Page } from '@playwright/test';
import { BASE_URL } from './config';
import { loginAsAdmin } from './helpers';

// Core business pages - these are the most critical
const CORE_PAGES = [
  '/admin/rooms',
  '/admin/tenants',
  '/admin/contracts',
  '/admin/billing',
  '/admin/invoices',
  '/admin/payments',
  '/admin/maintenance',
];

test.describe('Core Business Pages — Load & Interactive', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  for (const pagePath of CORE_PAGES) {
    test(`${pagePath} loads`, async ({ page }) => {
      const res = await page.goto(`${BASE_URL}${pagePath}`);
      if (res && res.status() >= 500) {
        throw new Error(`${pagePath} HTTP ${res.status()}`);
      }
      await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
    });

    test(`${pagePath} has interactive buttons`, async ({ page }) => {
      await page.goto(`${BASE_URL}${pagePath}`);
      const buttons = page.locator('button');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
    });
  }
});
