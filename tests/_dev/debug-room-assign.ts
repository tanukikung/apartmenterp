/**
 * Diagnostic: test the /api/rooms/:id/tenants endpoint via Playwright page context.
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

  // Create tenant
  const tenantResult = await page.evaluate(async ({ url, body, origin }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Referer: origin + '/' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, ok: res.ok, data: json };
  }, { url: `${BASE_URL}/api/tenants`, body: { firstName: 'T1', lastName: 'T1', phone: '0612345678', email: 't1@t.com' }, origin: BASE_URL });

  console.log('Tenant:', JSON.stringify(tenantResult));
  if (!tenantResult.ok) { await browser.close(); return; }
  const tenantId = tenantResult.data?.data?.id;

  // Find a vacant room
  const roomResult = await page.evaluate(async ({ url, origin }) => {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Origin: origin, Referer: origin + '/' },
      credentials: 'include',
    });
    const json = await res.json();
    return { status: res.status, ok: res.ok, data: json };
  }, { url: `${BASE_URL}/api/rooms?roomStatus=VACANT&pageSize=3`, origin: BASE_URL });

  const rooms = roomResult.data?.data?.data ?? roomResult.data?.data ?? [];
  const room = rooms[0];
  console.log('Room:', JSON.stringify(room));
  if (!room) { await browser.close(); return; }

  // Try assign via /api/rooms/[roomNo]/tenants
  const assignResult = await page.evaluate(async ({ url, body, origin }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Referer: origin + '/' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, ok: res.ok, data: json };
  }, { url: `${BASE_URL}/api/rooms/${encodeURIComponent(room.roomNo)}/tenants`, body: { tenantId, role: 'PRIMARY', moveInDate: '2026-05-05' }, origin: BASE_URL });

  console.log('Assign via roomNo path:', JSON.stringify(assignResult));

  // Try assign via /api/rooms/[id]/tenants (with internal id)
  const assignResult2 = await page.evaluate(async ({ url, body, origin }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Referer: origin + '/' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, ok: res.ok, data: json };
  }, { url: `${BASE_URL}/api/rooms/${room.roomNo}/tenants`, body: { tenantId, role: 'PRIMARY', moveInDate: '2026-05-05' }, origin: BASE_URL });

  console.log('Assign via raw roomNo path:', JSON.stringify(assignResult2));

  await browser.close();
}

main().catch(console.error);
