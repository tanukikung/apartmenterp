/**
 * More detailed debug script for ensureContract failure.
 */
import { chromium, type BrowserContext } from '@playwright/test';

const BASE_URL = 'http://localhost:3001';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture ALL console messages
  page.on('console', msg => console.log(`[BROWSER ${msg.type()}]:`, msg.text()));

  // Login
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="username"]', 'owner');
  await page.fill('input[name="password"]', 'Owner@12345');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/login')),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState('domcontentloaded');
  console.log('Logged in, URL:', page.url());

  // Check if cookies are set
  const cookies = await context.cookies();
  console.log('Cookies after login:', cookies.map(c => c.name).join(', '));

  async function apiPostDebug(path: string, body: unknown) {
    const result = await page.evaluate(async ({ url, b, origin }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin, Referer: origin + '/' },
        credentials: 'include',
        body: JSON.stringify(b),
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, data: json, url: res.url };
    }, { url: `${BASE_URL}${path}`, b: body, origin: BASE_URL });
    return result;
  }

  async function apiGetDebug(path: string) {
    const result = await page.evaluate(async ({ url, origin }) => {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Origin: origin, Referer: origin + '/' },
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, data: json, url: res.url };
    }, { url: `${BASE_URL}${path}`, origin: BASE_URL });
    return result;
  }

  // Create tenant
  const tenantResult = await apiPostDebug('/api/tenants', {
    firstName: 'Debug', lastName: 'Contract', phone: '0612345678', email: 'debug@c.com'
  });
  console.log('Tenant:', JSON.stringify(tenantResult));
  if (!tenantResult.ok) { await browser.close(); return; }
  const tenantId = tenantResult.data?.data?.id;

  // Find vacant room
  const roomResult = await apiGetDebug('/api/rooms?roomStatus=VACANT&pageSize=3');
  const rooms = roomResult.data?.data?.data ?? roomResult.data?.data ?? [];
  const room = rooms[0];
  console.log('Vacant room:', JSON.stringify(room));
  if (!room) { await browser.close(); return; }

  const startDate = new Date().toISOString().split('T')[0];
  console.log('Start date:', startDate);
  console.log('Room roomNo:', room.roomNo, 'type:', typeof room.roomNo);

  // Try to assign tenant
  const encodedRoomNo = encodeURIComponent(room.roomNo);
  console.log('Encoded roomNo:', encodedRoomNo);
  const assignResult = await apiPostDebug(`/api/rooms/${encodedRoomNo}/tenants`, {
    tenantId, role: 'PRIMARY', moveInDate: startDate,
  });
  console.log('Assign result:', JSON.stringify(assignResult));

  await browser.close();
}

main().catch(console.error);
