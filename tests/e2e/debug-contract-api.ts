/**
 * Debug: does the contract created by ensureContract appear in the contracts API?
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

  const result = await page.evaluate(async (url: string) => {
    // Create tenant
    const tenantRes = await fetch(url + '/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ firstName: 'T7', lastName: 'T7', phone: '0699999006', email: 't7@e.com' })
    });
    const tenantJson = await tenantRes.json();
    const tenantId = tenantJson?.data?.data?.id;
    if (!tenantId) return { error: 'No tenant ID' };

    // Get a vacant room
    const roomsRes = await fetch(url + '/api/rooms?roomStatus=VACANT&pageSize=3', {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const roomsJson = await roomsRes.json();
    const rooms = roomsJson?.data?.data ?? roomsJson?.data ?? [];
    const room = rooms.find((r: any) => r.roomNo === '798/3') ?? rooms[0];
    if (!room) return { error: 'No room found' };
    const roomNo = room.roomNo;
    const startDate = '2026-05-05';
    const endDate = '2027-05-05';

    // Assign tenant
    const assignRes = await fetch(`${url}/api/rooms/${encodeURIComponent(roomNo)}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ tenantId, role: 'PRIMARY', moveInDate: startDate })
    });
    const assignJson = await assignRes.json();
    if (!assignRes.ok) return { error: 'Assign failed', assignJson };

    // Create contract
    const contractRes = await fetch(url + '/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ roomId: roomNo, primaryTenantId: tenantId, startDate, endDate, rentAmount: 5000, depositAmount: 10000 })
    });
    const contractJson = await contractRes.json();
    const contractId = contractJson?.data?.data?.id;

    // Query the contracts API for this room
    const listRes = await fetch(`${url}/api/contracts?roomId=${encodeURIComponent(roomNo)}&status=ACTIVE&pageSize=5`, {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const listJson = await listRes.json();
    const contracts = listJson?.data?.data ?? listJson?.data ?? [];
    const activeContracts = contracts.filter((c: any) => c.status === 'ACTIVE');

    // Also try without status filter
    const listRes2 = await fetch(`${url}/api/contracts?roomId=${encodeURIComponent(roomNo)}&pageSize=5`, {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const listJson2 = await listRes2.json();
    const allContracts = listJson2?.data?.data ?? listJson2?.data ?? [];

    return {
      tenantId,
      roomNo,
      contractId,
      assignStatus: assignRes.status,
      contractStatus: contractRes.status,
      activeContractsForRoom: activeContracts.map((c: any) => ({ id: c.id, status: c.status, roomNo: c.roomNo })),
      allContractsForRoom: allContracts.map((c: any) => ({ id: c.id, status: c.status, roomNo: c.roomNo })),
    };
  }, BASE_URL);

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch(console.error);
