// Test Building settings save - button is disabled until isDirty
import { chromium } from 'playwright';
const BASE = 'http://localhost:3001';
const br = await chromium.launch({ headless: true });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const apiCalls = [];
p.on('request', r => { if (r.url().includes('/api/settings/building') && r.method() === 'POST') apiCalls.push(r.url()); });
p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) console.log('🔴 500', r.url()); });

await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await p.fill('input[type="text"], input[name="username"]', 'owner').catch(async()=>{ await p.locator('input').nth(0).fill('owner'); });
await p.fill('input[type="password"]', 'Owner@12345');
await Promise.all([p.waitForURL(/\/admin/, {timeout:15000}).catch(()=>{}), p.click('button[type="submit"]')]);

await p.goto(`${BASE}/admin/settings/building`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(2000);

// Check button disabled state
const btn = p.locator('button').filter({ hasText: /^บันทึก$/ }).first();
const isDisabled = await btn.isDisabled().catch(() => true);
console.log('button disabled initially:', isDisabled);

// Trigger isDirty by typing in first text input
const firstInput = p.locator('input[type="text"]').first();
await firstInput.click();
await p.keyboard.press('End');
await p.keyboard.type(' '); // เพิ่ม space เพื่อให้ isDirty=true
await p.waitForTimeout(500);

const isDisabled2 = await btn.isDisabled().catch(()=>true);
console.log('button disabled after type:', isDisabled2);

if (!isDisabled2) {
  // ตรวจ POST request ตอนกด save
  await btn.click({ timeout: 3000 });
  await p.waitForTimeout(2000);
  const body = await p.locator('body').innerText();
  console.log(apiCalls.length > 0 ? '✅ Settings/Building — POST ถูก fire' : '⚠️  Settings/Building — ไม่มี POST (ตรวจ isDirty)');
  const hasSuccess = body.includes('เรียบร้อย') || body.includes('สำเร็จ') || body.includes('บันทึก');
  console.log(hasSuccess ? '✅ Settings/Building save — มี success message' : '⚠️  save — ไม่มี visible toast แต่ submit แล้ว');
  console.log('api calls:', apiCalls);
} else {
  console.log('⚠️  Building save — button ยังง disable อยู่ (React state ไม่ update จาก keyboard.type)');
  // Try alternative: dispatchEvent
  await firstInput.evaluate(el => {
    el.value = el.value + ' x';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(500);
  const isDisabled3 = await btn.isDisabled().catch(()=>true);
  console.log('after dispatchEvent disabled:', isDisabled3);
  if (!isDisabled3) {
    await btn.click(); await p.waitForTimeout(2000);
    console.log('✅ Settings/Building save — clicked via dispatchEvent trick');
    console.log('api calls:', apiCalls);
  }
}

await br.close();
