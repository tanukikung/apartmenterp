/**
 * Screenshot capture for Presentation
 * Captures key pages from Apartment ERP for use in presentation
 */

const { chromium } = require('playwright');

const BASE = 'http://localhost:3001';
const OUT  = 'D:/tmp/screenshots';

// Pages to capture: [name, url, waitFor]
const PAGES = [
  // Public / Auth
  { name: '01-login',       url: '/admin/login',            wait: '.login, form',     login: true },

  // Admin pages
  { name: '02-dashboard',   url: '/admin/dashboard',        wait: '.kpi, [class*=kpi]', login: true },
  { name: '03-rooms',       url: '/admin/rooms',             wait: '.table, table',    login: true },
  { name: '04-tenants',     url: '/admin/tenants',          wait: '.table, table',    login: true },
  { name: '05-contracts',   url: '/admin/contracts',        wait: '.table, table',    login: true },
  { name: '06-billing',     url: '/admin/billing',          wait: '.table, .billing', login: true },
  { name: '07-invoices',    url: '/admin/invoices',         wait: '.table, table',    login: true },
  { name: '08-payments',    url: '/admin/payments',         wait: '.table, table',    login: true },
  { name: '09-moveouts',    url: '/admin/moveouts',         wait: '.table, table',    login: true },
  { name: '10-maintenance', url: '/admin/maintenance',      wait: '.table, table',    login: true },
  { name: '11-messaging',   url: '/admin/messaging',         wait: '.table, chat',     login: true },
  { name: '12-reports',     url: '/admin/reports/collections', wait: '.chart, canvas', login: true },
  { name: '13-settings',    url: '/admin/settings',          wait: '.settings',        login: true },
  { name: '14-system',      url: '/admin/system-health',    wait: '.health, .status', login: true },
];

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,  // retina screenshots
  });

  // Login first
  const page = await context.newPage();
  console.log('Logging in...');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });

  // Fill login form
  const usernameInput = await page.$('input[name="username"], input[type="text"]');
  if (usernameInput) {
    await usernameInput.fill('owner');
    const pw = await page.$('input[type="password"]');
    if (pw) await pw.fill('Owner@12345');
    const btn = await page.$('button[type="submit"], button');
    if (btn) await btn.click();
    await page.waitForTimeout(2000);
    console.log('Login submitted');
  } else {
    console.log('No login form found, checking if already logged in...');
  }

  // Make sure logged in
  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);

  // Capture each page
  for (const p of PAGES) {
    try {
      console.log(`Capturing: ${p.name}`);
      await page.goto(`${BASE}${p.url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500); // wait for animations

      await page.screenshot({
        path: `${OUT}/${p.name}.png`,
        fullPage: false,
      });
      console.log(`  ✓ saved: ${p.name}.png`);
    } catch (e) {
      console.log(`  ✗ failed: ${e.message}`);
    }
  }

  await browser.close();
  console.log('\nAll screenshots captured!');
}

capture().catch(e => { console.error('Fatal:', e.message); process.exit(1); });