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
      body: JSON.stringify({ firstName: 'TT2', lastName: 'TT2', phone: '0699999001', email: 'tt2@e.com' })
    });
    const json = await res.json();
    return json.data?.data?.id;
  }, BASE_URL);
  console.log('Tenant ID:', tenantResult);
  if (!tenantResult) { await browser.close(); return; }

  // Get first VACANT room
  const roomsResult = await page.evaluate(async (url: string) => {
    const res = await fetch(url + '/api/rooms?roomStatus=VACANT&pageSize=3', {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const json = await res.json();
    return (json.data?.data ?? json.data ?? []).map((r: any) => r.roomNo);
  }, BASE_URL);
  console.log('Rooms:', roomsResult);

  if (roomsResult.length > 0) {
    const roomNo = roomsResult[0];
    const encodedRoomNo = encodeURIComponent(roomNo);
    console.log('Attempting assign to room:', roomNo, '| encoded:', encodedRoomNo);

    const result = await page.evaluate(async ({ url, rn, tid }: { url: string; rn: string; tid: string }) => {
      const encoded = encodeURIComponent(rn);
      console.log('Fetching URL:', `${url}/api/rooms/${encoded}/tenants`);
      const res = await fetch(`${url}/api/rooms/${encoded}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
        credentials: 'include',
        body: JSON.stringify({ tenantId: tid, role: 'PRIMARY', moveInDate: '2026-05-05' })
      });
      const json = await res.json();
      console.log('Response status:', res.status, 'json:', JSON.stringify(json));
      return { status: res.status, error: json.error?.message };
    }, { url: BASE_URL, rn: roomNo, tid: tenantResult });
    console.log('Assign result:', JSON.stringify(result));
  }

  await browser.close();
}
main().catch(console.error);
