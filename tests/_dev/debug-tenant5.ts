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
    // Step 1: Create tenant
    const tenantRes = await fetch(url + '/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ firstName: 'T5', lastName: 'T5', phone: '0699999004', email: 't5@e.com' })
    });
    const tenantText = await tenantRes.text();
    let tenantId;
    let tenantJson;
    try {
      tenantJson = JSON.parse(tenantText);
      tenantId = tenantJson?.data?.data?.id;
    } catch (e) {
      return { error: 'tenant parse failed', text: tenantText.slice(0, 200), tenantResStatus: tenantRes.status };
    }

    // Step 2: Get VACANT rooms
    const roomsRes = await fetch(url + '/api/rooms?roomStatus=VACANT&pageSize=3', {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const roomsText = await roomsRes.text();
    let roomNo;
    try {
      const roomsJson = JSON.parse(roomsText);
      const rooms = roomsJson?.data?.data ?? roomsJson?.data ?? [];
      roomNo = rooms[0]?.roomNo;
      if (!roomNo) return { error: 'No rooms found in response', roomsJson, tenantId };
    } catch (e) {
      return { error: 'rooms parse failed', text: roomsText.slice(0, 200), tenantResStatus: tenantRes.status, tenantJson };
    }

    if (!tenantId || !roomNo) {
      return { error: 'Missing tenantId or roomNo', tenantId, roomNo };
    }

    // Step 3: Assign tenant to room
    const encodedRoomNo = encodeURIComponent(roomNo);
    const assignRes = await fetch(`${url}/api/rooms/${encodedRoomNo}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ tenantId, role: 'PRIMARY', moveInDate: '2026-05-05' })
    });
    const assignText = await assignRes.text();
    let assignResult;
    try {
      assignResult = JSON.parse(assignText);
    } catch (e) {
      assignResult = { error: 'assign parse failed', text: assignText.slice(0, 100) };
    }

    return {
      tenantId,
      roomNo,
      encodedRoomNo,
      assignStatus: assignRes.status,
      assignResult
    };
  }, BASE_URL);

  console.log('Result:', JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch(console.error);
