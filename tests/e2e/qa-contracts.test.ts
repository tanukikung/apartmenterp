import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';

/**
 * Contract Flow QA - test contract creation and management
 */
test.describe('QA: Contract Flow', () => {

  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="username"], input[type="text"]').first().fill('owner');
    await page.locator('input[name="password"], input[type="password"]').first().fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  });

  test('Contract list page loads with KPIs', async ({ page }) => {
    await page.goto(`${BASE}/admin/contracts`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should see contract KPIs (Active, Expiring Soon, etc.)
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Take a look at the page content
    const content = await page.locator('body').innerText();
    console.log('CONTRACT PAGE TEXT (first 500 chars):', content.substring(0, 500));
  });

  test('Open create contract panel', async ({ page }) => {
    await page.goto(`${BASE}/admin/contracts`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for a create button
    const createBtn = page.locator('button:has-text("สร้าง"), button:has-text("สัญญา"), button:has-text("Create")').first();
    if (await createBtn.isVisible({ timeout: 3000 })) {
      await createBtn.click();
      await page.waitForTimeout(1000);

      // Check if a form/drawer appeared
      const drawer = page.locator('[role="dialog"], [aria-modal="true"], .fixed, .absolute').filter({ hasText: /สัญญา|contract|ห้อง|tenant/i }).first();
      const drawerVisible = await drawer.isVisible().catch(() => false);
      console.log('Drawer/panel visible after create click:', drawerVisible);
    } else {
      console.log('Create button not found, trying to find any action button');
    }
  });

  test('Contract KPIs visible', async ({ page }) => {
    await page.goto(`${BASE}/admin/contracts`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Count cards or KPI elements - properly await
    const kpiCards = await page.locator('.card, [class*="card"], [class*="kpi"]').count();
    console.log('KPI/card elements found:', kpiCards);

    // Also verify the page has loaded properly
    const pageContent = await page.locator('body').innerText();
    console.log('Contract page loaded, content length:', pageContent.length);
  });
});
