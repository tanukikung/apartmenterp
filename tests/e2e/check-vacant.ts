import { chromium } from '@playwright/test';
const BASE_URL = 'http://localhost:3001';
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE_URL + '/login');
  await page.fill('input[name="username"]', 'owner');
  await page.fill('input[name="password"]', 'Owner@12345');
  await Promise.all([page.waitForResponse(r => r.url().includes('/api/auth/login')), page.click('button[type="submit"]')]);
  await page.waitForLoadState('domcontentloaded');

  const result = await page.evaluate(async (url: string) => {
    const res = await fetch(url + '/api/rooms?roomStatus=VACANT&pageSize=10', {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const json = await res.json();
    return {
      status: res.status,
      count: (json.data?.data ?? json.data ?? []).length,
      rooms: (json.data?.data ?? json.data ?? []).map((r: any) => r.roomNo)
    };
  }, BASE_URL);
  console.log(JSON.stringify(result));
  await browser.close();
}
main().catch(console.error);
