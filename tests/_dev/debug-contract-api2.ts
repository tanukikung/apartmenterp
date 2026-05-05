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
      body: JSON.stringify({ firstName: 'T8', lastName: 'T8', phone: '0699999007', email: 't8@e.com' })
    });
    const tenantText = await tenantRes.text();
    let tenantId;
    try {
      const j = JSON.parse(tenantText);
      tenantId = j?.data?.data?.id;
    } catch(e) {
      return { step: 'tenant', error: tenantText.slice(0, 200) };
    }
    if (!tenantId) return { step: 'tenant', error: 'no id in response', text: tenantText.slice(0, 200) };

    // Step 2: Find a room
    const roomsRes = await fetch(url + '/api/rooms?roomStatus=VACANT&pageSize=3', {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const roomsText = await roomsRes.text();
    let roomNo;
    try {
      const j = JSON.parse(roomsText);
      const rooms = j?.data?.data ?? j?.data ?? [];
      roomNo = rooms[0]?.roomNo;
    } catch(e) {
      return { step: 'rooms', error: roomsText.slice(0, 200) };
    }
    if (!roomNo) return { step: 'rooms', error: 'no room found', text: roomsText.slice(0, 200) };

    const startDate = '2026-05-05';
    const endDate = '2027-05-05';

    // Step 3: Assign tenant
    const assignRes = await fetch(`${url}/api/rooms/${encodeURIComponent(roomNo)}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ tenantId, role: 'PRIMARY', moveInDate: startDate })
    });
    const assignText = await assignRes.text();

    // Step 4: Create contract
    const contractRes = await fetch(url + '/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, Referer: url + '/' },
      credentials: 'include',
      body: JSON.stringify({ roomId: roomNo, primaryTenantId: tenantId, startDate, endDate, rentAmount: 5000, depositAmount: 10000 })
    });
    const contractText = await contractRes.text();
    let contractId;
    try {
      const j = JSON.parse(contractText);
      contractId = j?.data?.data?.id;
    } catch(e) {
      return { step: 'contract', error: contractText.slice(0, 200), assignStatus: assignRes.status, assignText: assignText.slice(0, 100) };
    }

    // Step 5: Query contracts for this room
    const listRes = await fetch(`${url}/api/contracts?roomId=${encodeURIComponent(roomNo)}&status=ACTIVE&pageSize=5`, {
      headers: { Origin: url, Referer: url + '/' },
      credentials: 'include'
    });
    const listText = await listRes.text();
    let contracts;
    try {
      const j = JSON.parse(listText);
      contracts = j?.data?.data ?? j?.data ?? [];
    } catch(e) {
      return { step: 'list', error: listText.slice(0, 200), contractId };
    }

    return {
      tenantId,
      roomNo,
      contractId,
      assignStatus: assignRes.status,
      contractStatus: contractRes.status,
      contractListStatus: listRes.status,
      activeContractsCount: contracts.filter((c: any) => c.status === 'ACTIVE').length,
      allContractsCount: contracts.length,
      contractListText: listText.slice(0, 300)
    };
  }, BASE_URL);

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch(console.error);
