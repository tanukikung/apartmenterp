import { type Page } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';

export async function loginAsAdmin(page: Page): Promise<void> {
  // Clear any existing auth state first
  await page.context().clearCookies();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

  // Wait for login form to be ready
  await page.waitForSelector('input[name="username"]', { state: 'visible', timeout: 15000 });
  await page.fill('input[name="username"]', 'owner');
  await page.fill('input[name="password"]', 'Owner@12345');
  await page.click('button[type="submit"]');

  // Wait for redirect to admin
  try {
    await page.waitForURL('**/admin/**', { timeout: 20000 });
  } catch {
    const url = page.url();
    // If stuck at login, try direct navigation
    if (url.includes('/login') || url.includes('/api/auth')) {
      await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    }
    if (!page.url().includes('/admin')) {
      throw new Error(`Login failed: still at ${page.url()}`);
    }
  }
}

export async function loginAsStaff(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="username"]', 'staff');
  await page.fill('input[name="password"]', 'Staff@12345');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {
    return page.waitForTimeout(2000);
  });
}

export async function waitForStable(page: Page, timeout = 3000): Promise<void> {
  await page.waitForTimeout(timeout);
}

export async function expectNoErrorToast(page: Page): Promise<void> {
  const errorLocator = page.locator('[data-testid="error-toast"], .text-red-400, [aria-label="error"]');
  const count = await errorLocator.count();
  if (count > 0) {
    const text = await errorLocator.first().innerText().catch(() => '');
    throw new Error(`Unexpected error toast: ${text}`);
  }
}

export async function navigateToInvoices(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/admin/invoices`);
  await page.waitForTimeout(2000);
}

export async function uploadBankStatement(
  page: Page,
  buffer: Uint8Array,
  filename = 'bank_statement.xlsx',
  timeoutMs = 90000,
): Promise<{ totalEntries: number; imported: number; matched: number; unmatched: number }> {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const arrayBuffer = await blob.arrayBuffer();
  const file = new File([arrayBuffer], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  // Write xlsx to temp file and use absolute path (most reliable for Playwright)
  const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
  const tmpFile = `${tmpDir}/${filename}`;
  const { writeFileSync } = require('fs');
  writeFileSync(tmpFile, Buffer.from(buffer));

  // Navigate and wait
  await page.goto(`${BASE_URL}/admin/payments/upload-statement`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  // Set file on input
  const fileInput = page.locator('input[type="file"]');
  const inputCount = await fileInput.count();
  if (inputCount === 0) {
    const url = page.url();
    const h1 = await page.locator('h1').first().innerText().catch(() => 'none');
    throw new Error(`No input[type=file] found. URL=${url}, h1=${h1}`);
  }
  await fileInput.setInputFiles(tmpFile);

  // Click upload
  await page.locator('button:has-text("Upload & Process")').click();

  // Wait for result card (UI polls internally up to 60s)
  try {
    await page.waitForSelector('text=อัปโหลดสำเร็จ', { timeout: timeoutMs });
  } catch {
    const url = page.url();
    const errorText = await page.locator('[class*=alert], [class*=error], [role=alert]').allInnerTexts().catch(() => []);
    const bodySnippet = await page.locator('body').innerText().catch(() => '');
    const screenshot = await page.screenshot().catch(() => null);
    throw new Error(
      `Upload timed out after ${timeoutMs}ms. URL=${url}. Errors=${JSON.stringify(errorText)}. Body snippet=${bodySnippet.slice(0, 300)}`
    );
  }

  // Read result tiles — each tile: <div.bg-surface> → <p.label> + <p.text-2xl.value>
  // Use Playwright's locator to find the label text, go up to tile, then read value
  await page.waitForTimeout(500);
  const totalText = await page.locator('text=รายการทั้งหมด').locator('..').locator('p.text-2xl').innerText().catch(() => '0');
  const importedText = await page.locator('text=นำเข้าแล้ว').locator('..').locator('p.text-2xl').innerText().catch(() => '0');
  const matchedText = await page.locator('text=จับคู่อัตโนมัติ').locator('..').locator('p.text-2xl').innerText().catch(() => '0');
  const unmatchedText = await page.locator('text=ต้องตรวจสอบ').locator('..').locator('p.text-2xl').innerText().catch(() => '0');
  console.log('[DEBUG tile texts]', { totalText, importedText, matchedText, unmatchedText });

  return {
    totalEntries: parseInt(totalText, 10),
    imported: parseInt(importedText, 10),
    matched: parseInt(matchedText, 10),
    unmatched: parseInt(unmatchedText, 10),
  };
}

export async function navigateToPaymentReview(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/admin/payments/review`);
  await page.waitForTimeout(2000);
}
