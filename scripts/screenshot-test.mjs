import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const BASE = 'http://localhost:3001';
const br = await chromium.launch({ headless: true });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await p.fill('input[type="text"], input[name="username"]', 'owner').catch(async()=>{ await p.locator('input').nth(0).fill('owner'); });
await p.fill('input[type="password"]', 'Owner@12345');
await Promise.all([p.waitForURL(/\/admin/, {timeout:15000}).catch(()=>{}), p.click('button[type="submit"]')]);

const pages = [
  ['/admin/dashboard', 'dashboard'],
  ['/admin/floors', 'floors'],
  ['/admin/billing', 'billing'],
  ['/admin/invoices', 'invoices'],
  ['/admin/payments', 'payments'],
  ['/admin/expenses', 'expenses'],
  ['/admin/contracts', 'contracts'],
  ['/admin/rooms', 'rooms'],
  ['/admin/tenants', 'tenants'],
  ['/admin/settings/building', 'settings-building'],
  ['/admin/settings/billing-policy', 'settings-billing-policy'],
  ['/admin/settings/bank-accounts', 'settings-bank-accounts'],
  ['/admin/analytics', 'analytics'],
  ['/admin/audit-logs', 'audit-logs'],
  ['/admin/maintenance', 'maintenance'],
  ['/admin/reports', 'reports'],
  ['/admin/system-health', 'system-health'],
];

for (const [path, name] of pages) {
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(()=>{});
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `/tmp/ss_${name}.png`, fullPage: false });
  console.log(`✅ screenshot: ${name}`);
}
await br.close();
console.log('done — screenshots in /tmp/ss_*.png');
