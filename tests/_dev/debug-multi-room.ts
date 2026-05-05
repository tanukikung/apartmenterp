import { chromium } from '@playwright/test';
const BASE_URL = 'http://localhost:3001';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log(`[${msg.type()}]:`, msg.text()));

  await page.goto(BASE_URL + '/login');
  await page.fill('input[name="username"]', 'owner');
  await page.fill('input[name="password"]', 'Owner@12345');
  await Promise.all([page.waitForResponse(r => r.url().includes('/api/auth/login')), page.click('button[type="submit"]')]);
  await page.waitForLoadState('domcontentloaded');

  // Find 3 vacant rooms
  const roomsResult = await page.evaluate(async (url: string) => {
    const res = await fetch(url + '/api/rooms?roomStatus=VACANT&pageSize=10', {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const json = await res.json();
    return { status: res.status, rooms: (json.data?.data ?? json.data ?? []).map((r: any) => ({ roomNo: r.roomNo, roomStatus: r.roomStatus })) };
  }, BASE_URL);
  console.log('VACANT rooms:', JSON.stringify(roomsResult));

  // Create a tenant
  const tenantResult = await page.evaluate(async (url: string) => {
    const res = await fetch(url + '/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ firstName: 'Test', lastName: 'User', phone: '0699999000', email: 'testuser@e.com' })
    });
    const json = await res.json();
    return { status: res.status, tenantId: json.data?.data?.id };
  }, BASE_URL);
  console.log('Created tenant:', JSON.stringify(tenantResult));
  if (!tenantResult.tenantId) { await browser.close(); return; }

  // Try to assign to first 3 VACANT rooms in sequence
  for (const roomInfo of roomsResult.rooms.slice(0, 3)) {
    const roomNo = roomInfo.roomNo;
    console.log(`\nTrying assign to room ${roomNo}...`);
    const assignResult = await page.evaluate(async ({ url, rn, tid }: { url: string; rn: string; tid: string }) => {
      const encoded = encodeURIComponent(rn);
      const res = await fetch(`${url}/api/rooms/${encoded}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
        credentials: 'include',
        body: JSON.stringify({ tenantId: tid, role: 'PRIMARY', moveInDate: '2026-05-05' })
      });
      const json = await res.json();
      return { status: res.status, error: json.error?.message || json.error };
    }, { url: BASE_URL, rn: roomNo, tid: tenantResult.tenantId });
    console.log(`  Result for ${roomNo}:`, JSON.stringify(assignResult));
  }

  await browser.close();
}
main().catch(console.error);
