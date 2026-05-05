import { chromium } from '@playwright/test';
const BASE_URL = 'http://localhost:3001';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BASE_URL + '/login');
  await page.fill('input[name="username"]', 'owner');
  await page.fill('input[name="password"]', 'Owner@12345');
  await Promise.all([page.waitForResponse(r => r.url().includes('/api/auth/login')), page.click('button[type="submit"]')]);
  await page.waitForLoadState('domcontentloaded');

  // Get tenant ID
  const tenantResult = await page.evaluate(async (url: string) => {
    const res = await fetch(url + '/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ firstName: 'TT3', lastName: 'TT3', phone: '0699999002', email: 'tt3@e.com' })
    });
    const json = await res.json();
    console.log('Full tenant response:', JSON.stringify(json, null, 2));
    return json;
  }, BASE_URL);
  console.log('Tenant result:', JSON.stringify(tenantResult, null, 2));

  await browser.close();
}
main().catch(console.error);
