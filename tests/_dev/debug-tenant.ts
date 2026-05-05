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

  // Create a tenant
  const tenantResult = await page.evaluate(async (url: string) => {
    const body = { firstName: 'Test', lastName: 'User', phone: '0699999000', email: 'testuser@e.com' };
    const res = await fetch(url + '/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    const json = await res.json();
    return { status: res.status, ok: res.ok, body: JSON.stringify(json, null, 2) };
  }, BASE_URL);
  console.log('Created tenant:', tenantResult.status, tenantResult.body);

  await browser.close();
}
main().catch(console.error);
