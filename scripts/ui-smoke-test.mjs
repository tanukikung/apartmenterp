// Headless browser smoke test - login + visit every admin page + capture console errors
// Usage: node scripts/ui-smoke-test.mjs
import { chromium } from 'playwright';

const BASE = 'http://localhost:3001';
const PAGES = [
  '/admin/dashboard', '/admin/analytics', '/admin/audit-logs',
  '/admin/billing', '/admin/billing/batches', '/admin/billing/import', '/admin/billing/wizard',
  '/admin/broadcast', '/admin/chat', '/admin/contracts', '/admin/deliveries',
  '/admin/documents', '/admin/documents/generate', '/admin/expenses', '/admin/floors',
  '/admin/invoices', '/admin/late-fees', '/admin/maintenance', '/admin/message-templates',
  '/admin/moveouts', '/admin/overdue', '/admin/payments', '/admin/payments/review',
  '/admin/payments/review-match', '/admin/payments/upload-statement',
  '/admin/reports', '/admin/reports/audit', '/admin/reports/collections',
  '/admin/reports/documents', '/admin/reports/occupancy', '/admin/reports/profit-loss',
  '/admin/reports/revenue', '/admin/rooms', '/admin/settings',
  '/admin/settings/automation', '/admin/settings/bank-accounts',
  '/admin/settings/billing-policy', '/admin/settings/building',
  '/admin/settings/integrations', '/admin/settings/reminders',
  '/admin/settings/roles', '/admin/settings/rooms', '/admin/settings/users',
  '/admin/system', '/admin/system-health', '/admin/system-jobs',
  '/admin/templates', '/admin/tenant-registrations', '/admin/tenants', '/admin/users',
];

const results = [];
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Login
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[name="username"], input[type="text"]', 'owner').catch(() => {});
await page.fill('input[name="password"], input[type="password"]', 'Owner@12345');
await Promise.all([
  page.waitForURL(/\/admin/, { timeout: 15000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
console.log('login ok, url=', page.url());

for (const p of PAGES) {
  const errs = [];
  const failed = [];
  const h = (msg) => { if (msg.type() === 'error') errs.push(msg.text().slice(0, 200)); };
  const r = (req) => { if (req.failure()) failed.push(`${req.method()} ${req.url()}: ${req.failure().errorText}`); };
  const resp = (res) => {
    const u = res.url();
    if (u.includes('/api/') && res.status() >= 500) {
      failed.push(`${res.status()} ${u}`);
    }
  };
  page.on('console', h);
  page.on('requestfailed', r);
  page.on('response', resp);
  try {
    const r = await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle', timeout: 20000 });
    // wait a bit for late xhrs
    await page.waitForTimeout(800);
    results.push({ path: p, status: r?.status() ?? 0, consoleErrors: errs, apiFailures: failed });
  } catch (e) {
    results.push({ path: p, status: 0, consoleErrors: errs, apiFailures: failed, gotoError: String(e.message || e).slice(0, 200) });
  }
  page.off('console', h);
  page.off('requestfailed', r);
  page.off('response', resp);
}
await browser.close();

const bad = results.filter(r => r.status >= 400 || r.consoleErrors.length || r.apiFailures.length || r.gotoError);
console.log(`\n=== SUMMARY: ${results.length} pages, ${bad.length} with issues ===`);
for (const b of bad) console.log(JSON.stringify(b, null, 2));
if (!bad.length) console.log('ALL CLEAN');
