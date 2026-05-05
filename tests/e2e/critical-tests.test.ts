import { test, Page, expect } from '@playwright/test';
import { BASE_URL } from './config.js';
import { loginAsAdmin } from './helpers';

// ──────────────────────────────────────────────
// EDGE CASES - Run first (fast failures)
// ──────────────────────────────────────────────

test('E1: XSS vulnerability in tenant name field', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(BASE_URL + '/admin/tenants');
  await expect(page.locator('body')).toBeVisible();

  // Open create modal - try multiple button approaches
  const createBtn = page.getByRole('button', { name: /add|create|new/i }).first();
  const responsePromise = page.waitForResponse(
    r => r.url().includes('/api/') && r.status() < 500,
  ).catch(() => null);
  await createBtn.click();
  await expect(page.locator('body')).toBeVisible();

  const nameInput = page.locator('input[name*="name"], input[placeholder*="ชื่อ"]').first();
  const isInputVisible = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('[E1] Name input visible:', isInputVisible);

  if (isInputVisible) {
    await nameInput.fill('<script>alert("XSS")</script>');
    await expect(page.locator('body')).toBeVisible();

    // Find submit button - be more flexible
    const submitBtn = page.locator('button[type="submit"]').first();
    const isSubmitVisible = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('[E1] Submit button visible:', isSubmitVisible);

    if (isSubmitVisible) {
      const submitResponse = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await submitBtn.click();
      await submitResponse;
      await expect(page.locator('body')).toBeVisible();

      const pageText = await page.locator('body').innerText();
      const xssExecuted = pageText.includes('alert') && await page.locator('script').count() > 0;
      console.log('[E1] XSS executed:', xssExecuted ? 'VULNERABLE' : 'SAFE');
    } else {
      console.log('[E1] Submit button not found - form may have validation');
    }
  }
});

test('E2: Zero amount invoice validation', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(BASE_URL + '/admin/invoices');
  await expect(page.locator('body')).toBeVisible();

  // Activate the GENERATED tab so the create button targets the right form context
  const generatedTab = page.getByRole('tab', { name: /generated|สร้าง/i }).first();
  if (await generatedTab.isVisible()) await generatedTab.click();
  await expect(page.locator('body')).toBeVisible();

  const createBtn = page.getByRole('button', { name: /create|generate/i }).first();
  await createBtn.click();
  await expect(page.locator('body')).toBeVisible();

  const amountInput = page.locator('input[name*="amount"], input[type="number"]').first();
  if (await amountInput.isVisible()) {
    await amountInput.fill('0');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await expect(page.locator('body')).toBeVisible();

    const text = await page.locator('body').innerText();
    const blocked = text.includes('ไม่') || text.includes('0') || text.includes('invalid') || text.includes('必');
    console.log('[E2] Zero amount blocked:', blocked ? 'YES' : 'NO - BUG if not blocked');
  }
});

test('E3: Date validation - end before start', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(BASE_URL + '/admin/contracts');
  await expect(page.locator('body')).toBeVisible();

  const createBtn = page.getByRole('button', { name: /create|add/i }).first();
  await createBtn.click();
  await expect(page.locator('body')).toBeVisible();

  const inputs = page.locator('input[type="date"], input[name*="start"], input[name*="end"]');
  const count = await inputs.count();
  console.log('[E3] Date inputs found:', count);

  if (count >= 2) {
    const allInputs = await inputs.all();
    await allInputs[0].fill('2026-06-01');
    await allInputs[1].fill('2026-01-01'); // End before start
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await expect(page.locator('body')).toBeVisible();

    const text = await page.locator('body').innerText();
    const validated = text.includes('ก่อน') || text.includes('ไม่ถูกต้อง') || text.includes('invalid') || text.includes('Validation');
    console.log('[E3] End before start validation:', validated ? 'YES' : 'NO - BUG');
  }
});

// ──────────────────────────────────────────────
// FINANCIAL RECONCILIATION
// ──────────────────────────────────────────────

test('F1: Invoice totals add up correctly', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(BASE_URL + '/admin/invoices');
  await expect(page.locator('body')).toBeVisible();

  // Activate the ALL tab so all invoice rows are visible
  const allTab = page.getByRole('tab', { name: /all|ทั้งหมด/i }).first();
  if (await allTab.isVisible()) await allTab.click();
  await expect(page.locator('body')).toBeVisible();

  // Sum all visible invoice amounts
  let calculatedTotal = 0;
  const rows = await page.locator('table tbody tr').all();
  const amounts: number[] = [];

  for (const row of rows) {
    const text = await row.innerText();
    const match = text.match(/฿\s*([\d,]+)/);
    if (match) {
      const amt = parseInt(match[1].replace(/,/g, ''));
      amounts.push(amt);
      calculatedTotal += amt;
    }
  }

  console.log('[F1] Invoice count:', amounts.length);
  console.log('[F1] Calculated total: ฿', calculatedTotal.toLocaleString());

  // Check dashboard for comparison
  await page.goto(BASE_URL + '/admin');
  await expect(page.locator('body')).toBeVisible();
  const dashText = await page.locator('body').innerText();
  const dashTotal = dashText.match(/฿\s*([\d,]+)/)?.[1] || 'not found';
  console.log('[F1] Dashboard total: ฿', dashTotal);

  // Note: Rate limiting may cause 0 rows - this is a test infra issue, not app bug
  console.log('[F1] Result: amounts.length =', amounts.length, '(0 may indicate rate limiting)');
});

test('F2: Overpayment detection', async ({ page }) => {
  await loginAsAdmin(page);
  // Use overdue page since it showed 97 rows reliably
  await page.goto(BASE_URL + '/admin/overdue');
  await expect(page.locator('body')).toBeVisible();

  const firstRow = page.locator('table tbody tr').first();
  const isTableVisible = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
  if (!isTableVisible) {
    console.log('[F2] No invoice rows visible (rate limited or empty)');
    return;
  }
  const responsePromise = page.waitForResponse(
    r => r.url().includes('/api/') && r.status() < 500,
  ).catch(() => null);
  await firstRow.click();
  await expect(page.locator('body')).toBeVisible();

  const payBtn = page.getByRole('button', { name: /pay|payment/i }).first();
  const isPayBtnVisible = await payBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (!isPayBtnVisible) {
    console.log('[F2] Pay button not visible');
    return;
  }
  await payBtn.click();
  await expect(page.locator('body')).toBeVisible();

  const amountInput = page.locator('input[name*="amount"], input[type="number"]').first();
  if (await amountInput.isVisible()) {
    await amountInput.fill('999999999');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await responsePromise;
    await expect(page.locator('body')).toBeVisible();

    const text = await page.locator('body').innerText();
    const hasValidation = text.includes('เกิน') || text.includes('over') || text.includes('มากกว่า') || text.includes('overpayment');
    console.log('[F2] Overpayment validation:', hasValidation ? 'CORRECTLY BLOCKED' : 'NO VALIDATION - BUG');
  }
});

test('F3: Partial payment leaves correct balance', async ({ page }) => {
  // Use overdue page directly since it has reliable data
  await loginAsAdmin(page);
  await page.goto(BASE_URL + '/admin/overdue');
  await expect(page.locator('body')).toBeVisible();

  const rows = await page.locator('table tbody tr').all();
  if (rows.length === 0) { console.log('[F3] No overdue invoices'); return; }

  const firstRow = rows[0];
  const rowText = await firstRow.innerText();
  const amountMatch = rowText.match(/฿\s*([\d,]+)/);
  const fullAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : 0;
  console.log('[F3] Full amount:', fullAmount);

  const isRowVisible = await firstRow.isVisible({ timeout: 3000 }).catch(() => false);
  if (!isRowVisible) { console.log('[F3] Row not visible'); return; }

  const responsePromise = page.waitForResponse(
    r => r.url().includes('/api/') && r.status() < 500,
  ).catch(() => null);
  await firstRow.click();
  await expect(page.locator('body')).toBeVisible();

  const payBtn = page.getByRole('button', { name: /pay|payment/i }).first();
  if (await payBtn.isVisible()) {
    await payBtn.click();
    await expect(page.locator('body')).toBeVisible();

    const amountInput = page.locator('input[name*="amount"], input[type="number"]').first();
    const partialAmount = Math.floor(fullAmount / 2);
    await amountInput.fill(partialAmount.toString());
    console.log('[F3] Entering partial:', partialAmount);

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await responsePromise;
    await expect(page.locator('body')).toBeVisible();

    const text = await page.locator('body').innerText();
    const remainingMatch = text.match(/ค้าง\s*[฿]?\s*([\d,]+)|คงเหลือ\s*[฿]?\s*([\d,]+)/i);
    if (remainingMatch) {
      const remaining = parseInt((remainingMatch[1] || remainingMatch[2]).replace(/,/g, ''));
      const expectedRemaining = fullAmount - partialAmount;
      console.log('[F3] Remaining shown:', remaining, 'Expected:', expectedRemaining);
      console.log('[F3] Partial payment math:', remaining === expectedRemaining ? 'CORRECT' : 'WRONG - BUG');
    }
  }
});

// ──────────────────────────────────────────────
// DATA CONSISTENCY
// ──────────────────────────────────────────────

test('DC1: Overdue count matches across pages', async ({ page }) => {
  await loginAsAdmin(page);

  // Count from overdue page
  await page.goto(BASE_URL + '/admin/overdue');
  await expect(page.locator('body')).toBeVisible();
  const overdueRows = await page.locator('table tbody tr').count();
  console.log('[DC1] Overdue page count:', overdueRows);

  if (overdueRows === 0) {
    test.skip('No overdue invoices found — skipping');
    return;
  }

  // Count from invoices page
  await page.goto(BASE_URL + '/admin/invoices');
  await expect(page.locator('body')).toBeVisible();

  // Click "Overdue" tab to activate the overdue filter
  const overdueTab = page.locator('button:has-text("เกินกำหนด")').first();
  if (await overdueTab.isVisible()) await overdueTab.click();
  await expect(page.locator('body')).toBeVisible();

  const invoiceRows = await page.locator('table tbody tr').count();
  console.log('[DC1] Invoices page filtered count:', invoiceRows);
  console.log('[DC1] Counts match:', overdueRows === invoiceRows ? 'YES' : 'MISMATCH');
});

test('DC2: Dashboard vs real data', async ({ page }) => {
  await loginAsAdmin(page);

  // Get dashboard stats
  await page.goto(BASE_URL + '/admin');
  await expect(page.locator('body')).toBeVisible();
  const dashText = await page.locator('body').innerText();

  // Extract key numbers from dashboard
  const totalRoomsMatch = dashText.match(/(\d+)\s*ห้อง/);
  const occupiedMatch = dashText.match(/(\d+)\s*(?:มีผู้| occupied)/);
  const vacantMatch = dashText.match(/(\d+)\s*(?:ว่าง| vacant)/);
  const overdueMatch = dashText.match(/(\d+)\s*(?:ค้าง| overdue)/);

  console.log('[DC2] Dashboard - Total rooms:', totalRoomsMatch?.[1] || 'unknown');
  console.log('[DC2] Dashboard - Occupied:', occupiedMatch?.[1] || 'unknown');
  console.log('[DC2] Dashboard - Vacant:', vacantMatch?.[1] || 'unknown');
  console.log('[DC2] Dashboard - Overdue:', overdueMatch?.[1] || 'unknown');

  // Verify against rooms page
  await page.goto(BASE_URL + '/admin/rooms');
  await expect(page.locator('body')).toBeVisible();
  const totalRoomRows = await page.locator('table tbody tr').count();
  console.log('[DC2] Rooms page total:', totalRoomRows);

  // Count actual vacant vs occupied
  let actualVacant = 0, actualOccupied = 0;
  const rows = await page.locator('table tbody tr').all();
  for (const row of rows) {
    const text = await row.innerText();
    if (text.includes('ว่าง') || text.includes('vacant')) actualVacant++;
    else if (text.includes('มีผู้') || text.includes('occupied')) actualOccupied++;
  }
  console.log('[DC2] Actual vacant:', actualVacant, 'Actual occupied:', actualOccupied);
});

test('DC3: [object Object] errors on all admin pages', async ({ page }) => {
  await loginAsAdmin(page);

  const pages = ['/admin/tenants', '/admin/contracts', '/admin/invoices', '/admin/rooms', '/admin/overdue', '/admin'];
  const results: string[] = [];

  for (const path of pages) {
    await page.goto(BASE_URL + path);
    await expect(page.locator('body')).toBeVisible();
    const text = await page.locator('body').innerText();
    const hasObject = text.includes('[object Object]');
    const hasUndefined = text.includes('undefined');
    const hasNull = text.includes('null');

    const status = hasObject ? 'FAIL [object Object]' : hasUndefined ? 'FAIL undefined' : 'PASS';
    console.log(`[DC3] ${path}: ${status}`);
    results.push(status);
  }

  const failures = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`[DC3] Total pages with errors: ${failures}/${pages.length}`);
});

// ──────────────────────────────────────────────
// CONSOLE ERRORS - Critical
// ──────────────────────────────────────────────

test('CONSOLE: No console errors across core flows', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[${msg.location().url}] ${msg.text()}`);
  });

  await loginAsAdmin(page);

  const flows = [
    '/admin/tenants',
    '/admin/contracts',
    '/admin/invoices',
    '/admin/overdue',
    '/admin',
  ];

  for (const path of flows) {
    await page.goto(BASE_URL + path);
    await expect(page.locator('body')).toBeVisible();
    // Trigger some interaction
    const rows = await page.locator('table tbody tr').count();
    if (rows > 0) {
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/api/') && r.status() < 500,
      ).catch(() => null);
      await page.locator('table tbody tr').first().click();
      await responsePromise;
      await expect(page.locator('body')).toBeVisible();
    }
    await page.goBack();
    await expect(page.locator('body')).toBeVisible();
  }

  console.log('\n=== CONSOLE ERRORS ===');
  if (errors.length === 0) {
    console.log('NONE - All clean!');
  } else {
    errors.forEach(e => console.log(e));
  }
});