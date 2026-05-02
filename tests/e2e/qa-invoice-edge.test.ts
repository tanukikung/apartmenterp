import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';

test.describe('QA: Invoice & Payment Edge Cases', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="username"], input[type="text"]').first().fill('owner');
    await page.locator('input[name="password"], input[type="password"]').first().fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  });

  test('Invoices: verify auth and list', async ({ page }) => {
    await page.goto(`${BASE}/admin/invoices`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const url = page.url();
    const content = await page.locator('body').innerText();

    console.log('Invoice page URL:', url);
    console.log('Invoice page text preview:', content.substring(0, 500));

    // Check if it shows invoice table or login
    const isLoginPage = content.includes('เข้าสู่ระบบ') || url.includes('/login');
    console.log('Showing login instead of invoices:', isLoginPage);
  });

  test('Invoice detail: download PDF button', async ({ page }) => {
    await page.goto(`${BASE}/admin/invoices`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const invoiceRows = page.locator('tbody tr').filter({ hasText: /\S/ });
    const rowCount = await invoiceRows.count();
    console.log('Invoice rows:', rowCount);

    if (rowCount > 0) {
      // Try clicking a row
      await invoiceRows.first().click();
      await page.waitForTimeout(2000);

      const url = page.url();
      console.log('After click URL:', url);

      if (url.includes('/invoices/')) {
        const content = await page.locator('body').innerText();
        console.log('Invoice detail text:', content.substring(0, 600));

        // Look for PDF download button
        const pdfBtn = page.locator('button:has-text("PDF"), button:has-text("ดาวน์โหลด"), a[href*="pdf"]').first();
        const pdfBtnVisible = await pdfBtn.isVisible({ timeout: 2000 }).catch(() => false);
        console.log('PDF download button visible:', pdfBtnVisible);
      }
    }
  });

  test('Payments: manual entry form', async ({ page }) => {
    await page.goto(`${BASE}/admin/payments`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const content = await page.locator('body').innerText();
    console.log('Payments page text preview:', content.substring(0, 400));

    // Look for manual entry tab
    const manualTab = page.locator('button:has-text(" Manual "), button:has-text("ป้อนเอง"), button:has-text("กรอก")').first();
    const manualTabVisible = await manualTab.isVisible({ timeout: 2000 }).catch(() => false);
    console.log('Manual entry tab visible:', manualTabVisible);

    if (manualTabVisible) {
      await manualTab.click();
      await page.waitForTimeout(1000);

      // Look for amount input
      const amountInput = page.locator('input[type="number"], input[placeholder*="จำนวน"]').first();
      const amountVisible = await amountInput.isVisible({ timeout: 2000 }).catch(() => false);
      console.log('Amount input in manual form visible:', amountVisible);
    }
  });

  test('Dashboard: verify overdue count', async ({ page }) => {
    await page.goto(`${BASE}/admin/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const content = await page.locator('body').innerText();

    // Extract the overdue count
    const overdueMatch = content.match(/ค้างชำระ[^\d]*(\d+)/);
    const vacantMatch = content.match(/ห้องว่าง[^\d]*(\d+)/);
    const incomeMatch = content.match(/รายได้เดือนนี้[^\d]*([\d,K฿]+)/);

    console.log('Overdue count:', overdueMatch ? overdueMatch[1] : 'not found');
    console.log('Vacant rooms:', vacantMatch ? vacantMatch[1] : 'not found');
    console.log('Monthly income:', incomeMatch ? incomeMatch[1] : 'not found');

    // Navigate to overdue page
    await page.goto(`${BASE}/admin/overdue`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const overdueContent = await page.locator('body').innerText();
    console.log('Overdue page text preview:', overdueContent.substring(0, 400));
  });
});

test.describe('QA: Contract Edge Cases', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="username"], input[type="text"]').first().fill('owner');
    await page.locator('input[name="password"], input[type="password"]').first().fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  });

  test('Create contract: invalid overlapping dates', async ({ page }) => {
    await page.goto(`${BASE}/admin/contracts`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click create button
    const createBtn = page.locator('button:has-text("สร้างสัญญาใหม่"), button:has-text("สร้างสัญญา"), button:has-text("Create")').first();
    const btnVisible = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Create contract button visible:', btnVisible);

    if (btnVisible) {
      await createBtn.click();
      await page.waitForTimeout(1000);

      const content = await page.locator('body').innerText();
      console.log('Contract form opened, looking for form fields...');

      // Try to find date inputs
      const dateInputs = page.locator('input[type="date"], input[placeholder*="วันที่"]');
      const dateCount = await dateInputs.count();
      console.log('Date inputs found:', dateCount);

      // Try to find room selector
      const roomSelect = page.locator('select, [role="combobox"], [role="listbox"]').first();
      const roomVisible = await roomSelect.isVisible({ timeout: 2000 }).catch(() => false);
      console.log('Room/tenant selector visible:', roomVisible);
    }
  });

  test('Room detail page: check occupancy', async ({ page }) => {
    // Go to first occupied room
    await page.goto(`${BASE}/admin/rooms`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find occupied room
    const occupiedRooms = page.locator('text="มีผู้เช่า"').first();
    const hasOccupied = await occupiedRooms.isVisible({ timeout: 2000 }).catch(() => false);
    console.log('Found occupied room badge:', hasOccupied);

    if (hasOccupied) {
      // Click on a room row
      const roomLinks = page.locator('a[href*="/rooms/"]').first();
      const roomLinkVisible = await roomLinks.isVisible({ timeout: 2000 }).catch(() => false);
      console.log('Room link visible:', roomLinkVisible);

      if (roomLinkVisible) {
        await roomLinks.click();
        await page.waitForTimeout(2000);
        const url = page.url();
        console.log('Room detail URL:', url);

        const content = await page.locator('body').innerText();
        console.log('Room detail text preview:', content.substring(0, 500));
      }
    }
  });
});
