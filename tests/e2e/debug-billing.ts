/**
 * Debug what the /api/billing endpoint actually returns for fake vs real roomNo.
 */
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

  // Try create billing record with FAKE room
  const result = await page.evaluate(async (url: string) => {
    const fakeRoom = 'ROOM-test-fake';
    const res = await fetch(url + '/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ roomNo: fakeRoom, year: 2026, month: 5 })
    });
    const json = await res.json();
    return {
      url: res.url,
      status: res.status,
      body: JSON.stringify(json, null, 2)
    };
  }, BASE_URL);

  console.log('Result for fake room:', JSON.stringify(result, null, 2));

  // Try create billing record with REAL room
  const result2 = await page.evaluate(async (url: string) => {
    const res = await fetch(url + '/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ roomNo: '798/1', year: 2026, month: 5 })
    });
    const json = await res.json();
    return {
      url: res.url,
      status: res.status,
      body: JSON.stringify(json, null, 2)
    };
  }, BASE_URL);

  console.log('Result for real room:', JSON.stringify(result2, null, 2));

  await browser.close();
}
main().catch(console.error);
