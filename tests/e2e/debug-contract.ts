/**
 * Quick diagnostic to figure out why ensureContract fails.
 */
import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:3001';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Login
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="username"]', 'owner');
  await page.fill('input[name="password"]', 'Owner@12345');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/login')),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState('domcontentloaded');
  console.log('Logged in:', page.url());

  // Step 1: Create tenant
  const tenantPayload = {
    firstName: 'TestTenant',
    lastName: 'Debug',
    phone: '0612345678',
    email: 'debug@test.local',
  };

  const tenantResult = await page.evaluate(async ({ url, body }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3001', Referer: 'http://localhost:3001/' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, ok: res.ok, data: json };
  }, { url: `${BASE_URL}/api/tenants`, body: tenantPayload });

  console.log('Tenant result:', JSON.stringify(tenantResult, null, 2));

  if (!tenantResult.ok) {
    console.log('Tenant creation FAILED, cannot test contract further');
    await browser.close();
    return;
  }

  const tenantId = tenantResult.data?.data?.id;
  console.log('Tenant ID:', tenantId);

  // Step 2: Find a vacant room
  const roomResult = await page.evaluate(async ({ url }) => {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Origin: 'http://localhost:3001', Referer: 'http://localhost:3001/' },
      credentials: 'include',
    });
    const json = await res.json();
    return { status: res.status, ok: res.ok, data: json };
  }, { url: `${BASE_URL}/api/rooms?roomStatus=VACANT&pageSize=5` });

  console.log('Rooms result status:', roomResult.status);
  const rooms = roomResult.data?.data?.data ?? roomResult.data?.data ?? [];
  console.log('Vacant rooms:', JSON.stringify(rooms.slice(0, 2), null, 2));

  if (!rooms.length) {
    console.log('NO VACANT ROOMS — this is why ensureContract fails');
    await browser.close();
    return;
  }

  const room = rooms[0];
  console.log('Using room:', room.roomNo, room.id);

  // Step 3: Try to create contract
  const contractPayload = {
    roomId: room.id,
    primaryTenantId: tenantId,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
    rentAmount: 5000,
    depositAmount: 10000,
  };

  const contractResult = await page.evaluate(async ({ url, body }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3001', Referer: 'http://localhost:3001/' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, ok: res.ok, data: json };
  }, { url: `${BASE_URL}/api/contracts`, body: contractPayload });

  console.log('Contract result:', JSON.stringify(contractResult, null, 2));

  await browser.close();
}

main().catch(console.error);
