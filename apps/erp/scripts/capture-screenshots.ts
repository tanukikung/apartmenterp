/**
 * Screenshot Capture — Apartment ERP
 * Run: cd apps/erp && npx tsx scripts/capture-screenshots.ts
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join('D:', 'apartment_erp', 'screenshots');
const BASE_URL = process.env.SCREENSHOT_BASE_URL || 'http://localhost:3001';
const CREDENTIALS = {
  username: process.env.SCREENSHOT_USERNAME || 'owner',
  password: process.env.SCREENSHOT_PASSWORD || 'Owner@12345',
};

// Pages to capture
const PAGES = [
  { name: 'dashboard', url: '/admin/dashboard', width: 1400, height: 900 },
  { name: 'rooms', url: '/admin/rooms', width: 1400, height: 900 },
  { name: 'tenants', url: '/admin/tenants', width: 1400, height: 900 },
  { name: 'billing', url: '/admin/billing', width: 1400, height: 900 },
  { name: 'invoices', url: '/admin/invoices', width: 1400, height: 900 },
  { name: 'payments', url: '/admin/payments', width: 1400, height: 900 },
  { name: 'chat', url: '/admin/chat', width: 1400, height: 900 },
  { name: 'maintenance', url: '/admin/maintenance', width: 1400, height: 900 },
  { name: 'analytics', url: '/admin/analytics', width: 1400, height: 900 },
  { name: 'overdue', url: '/admin/overdue', width: 1400, height: 900 },
  { name: 'tenant-registrations', url: '/admin/tenant-registrations', width: 1400, height: 900 },
  { name: 'system-health', url: '/admin/system-health', width: 1400, height: 900 },
];

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/auth/signin`, { waitUntil: 'networkidle' });
  await page.fill('input[name="username"]', CREDENTIALS.username);
  await page.fill('input[name="password"]', CREDENTIALS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/**', { timeout: 15000 });
  console.log('  ✓ Logged in');
}

async function capturePage(browser: Browser, pageName: string, url: string, w: number, h: number): Promise<string> {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const outputPath = path.join(OUTPUT_DIR, `${pageName}.png`);

  try {
    console.log(`  Capturing ${pageName}...`);
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000); // Wait for dynamic content
    await page.screenshot({ path: outputPath, fullPage: true, timeout: 15000 });
    console.log(`  ✓ Saved: ${pageName}.png`);
  } catch (err) {
    console.log(`  ✗ Failed: ${pageName} — ${err}`);
  } finally {
    await context.close();
  }
  return outputPath;
}

async function main() {
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('🖼️  Starting screenshot capture...');
  console.log(`   Output: ${OUTPUT_DIR}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Login first
  console.log('🔐 Logging in...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[name="username"]', CREDENTIALS.username);
  await page.fill('input[name="password"]', CREDENTIALS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/dashboard**', { timeout: 20000 });
  console.log('  ✓ Logged in\n');

  // Capture each page
  const results: { name: string; path: string; success: boolean }[] = [];
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: p.width, height: p.height } });
    const pg = await ctx.newPage();
    const outputPath = path.join(OUTPUT_DIR, `${p.name}.png`);

    try {
      console.log(`  Capturing ${p.name}...`);
      await pg.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle', timeout: 30000 });
      await pg.waitForTimeout(2500);
      await pg.screenshot({ path: outputPath, fullPage: true, timeout: 15000 });
      results.push({ name: p.name, path: outputPath, success: true });
      console.log(`  ✓ ${p.name}.png`);
    } catch (err: any) {
      console.log(`  ✗ ${p.name}: ${err.message}`);
      results.push({ name: p.name, path: outputPath, success: false });
    }
    await ctx.close();
  }

  await browser.close();

  console.log('\n✅ Screenshot capture complete!');
  console.log(`   ${results.filter((r) => r.success).length}/${results.length} pages captured`);
  for (const r of results) {
    console.log(`   ${r.success ? '✓' : '✗'} ${r.name}`);
  }

  // Save screenshot manifest
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(results, null, 2)
  );
  console.log(`\n📁 Screenshots saved to: ${OUTPUT_DIR}`);
}

main().catch(console.error);
