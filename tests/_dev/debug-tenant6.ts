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

  const result = await page.evaluate(async (url: string) => {
    // Check cookies
    const cookies = document.cookie;

    // Create tenant - simple text response check
    const tenantRes = await fetch(url + '/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ firstName: 'T6', lastName: 'T6', phone: '0699999005', email: 't6@e.com' })
    });
    const tenantText = await tenantRes.text();

    // Also try a simple GET to check auth
    const roomsRes = await fetch(url + '/api/rooms?roomStatus=VACANT&pageSize=2', {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const roomsText = await roomsRes.text();

    return {
      cookies,
      tenantResStatus: tenantRes.status,
      tenantText: tenantText.slice(0, 300),
      roomsResStatus: roomsRes.status,
      roomsText: roomsText.slice(0, 300),
    };
  }, BASE_URL);

  console.log('Result:', JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch(console.error);
