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

  // Create tenant and assign to room, all in one page.evaluate to ensure same JS context
  const result = await page.evaluate(async (url: string) => {
    // Create tenant
    const tenantRes = await fetch(url + '/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ firstName: 'T4', lastName: 'T4', phone: '0699999003', email: 't4@e.com' })
    });
    console.log('Tenant res status:', tenantRes.status);
    let tenantId;
    try {
      const tenantJson = await tenantRes.json();
      console.log('Tenant json:', JSON.stringify(tenantJson));
      tenantId = tenantJson?.data?.data?.id;
    } catch (e) {
      return { error: 'Tenant json parse failed', err: String(e) };
    }

    // Get VACANT rooms
    const roomsRes = await fetch(url + '/api/rooms?roomStatus=VACANT&pageSize=3', {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const roomsJson = await roomsRes.json();
    const rooms = roomsJson?.data?.data ?? roomsJson?.data ?? [];
    const roomNo = rooms[0]?.roomNo;

    if (!tenantId || !roomNo) {
      return { error: 'Missing tenantId or roomNo', tenantId, roomNo };
    }

    // Try to assign
    const encodedRoomNo = encodeURIComponent(roomNo);
    const assignRes = await fetch(`${url}/api/rooms/${encodedRoomNo}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ tenantId, role: 'PRIMARY', moveInDate: '2026-05-05' })
    });
    const assignJson = await assignRes.json();
    return {
      tenantId,
      roomNo,
      encodedRoomNo,
      assignStatus: assignRes.status,
      assignError: assignJson.error?.message
    };
  }, BASE_URL);

  console.log('Result:', JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch(console.error);
