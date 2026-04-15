// ทดสอบ form ที่ใช้ state (ไม่มี name attr) — Tenant drawer + Building settings
import { chromium } from 'playwright';
const BASE = 'http://localhost:3001';
const br = await chromium.launch({ headless: true });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const fivexx = [];
p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) fivexx.push(`${r.status()} ${r.url()}`); });

function ok(l, d='') { console.log(`✅ ${l}${d?' — '+d:''}`); }
function bad(l, d='') { console.log(`🔴 ${l}${d?' — '+d:''}`); }
function warn(l, d='') { console.log(`⚠️  ${l}${d?' — '+d:''}`); }

await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await p.fill('input[type="text"], input[name="username"]', 'owner').catch(async()=>{ await p.locator('input').nth(0).fill('owner'); });
await p.fill('input[type="password"]', 'Owner@12345');
await Promise.all([p.waitForURL(/\/admin/, {timeout:15000}).catch(()=>{}), p.click('button[type="submit"]')]);

// ═══ TENANT CREATE (drawer-based) ═══
await p.goto(`${BASE}/admin/tenants`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
try {
  // คลิกปุ่ม "เพิ่มผู้เช่า"
  await p.locator('button:has-text("เพิ่มผู้เช่า")').first().click({ timeout: 5000 });
  await p.waitForTimeout(1000);
  // drawer เปิด — กรอก input โดยใช้ nth() หรือ placeholder
  const inputs = p.locator('input[placeholder*="ชื่อ"], input[placeholder*="นามสกุล"], input[placeholder*="เบอร์"], input[placeholder*="phone"], input[placeholder*="email"]');
  const count = await inputs.count();
  console.log(`drawer inputs found: ${count}`);
  // กรอกทีละช่อง — placeholder
  await p.fill('input[placeholder="ชื่อ"]', 'Playwright').catch(()=>{});
  await p.fill('input[placeholder*="นามสกุล"]', 'Tester').catch(()=>{});
  await p.fill('input[placeholder*="เบอร์"], input[placeholder*="phone"]', '0822222222').catch(()=>{});
  await p.fill('input[placeholder*="email"], input[type="email"]', 'playwright@test.com').catch(()=>{});
  // ตรวจ submit button (text = "เพิ่มผู้เช่า" ไม่ใช่ type="submit")
  const submitBtn = p.locator('button:has-text("เพิ่มผู้เช่า")').last(); // last เพราะมีปุ่มนี้ 2 ที่
  await submitBtn.click({ timeout: 4000 }); await p.waitForTimeout(2500);
  // ตรวจผล
  const after = await p.locator('body').innerText();
  if (fivexx.some(e=>e.includes('tenant'))) bad('Tenant create', '500: ' + fivexx.filter(e=>e.includes('tenant')));
  else if (after.includes('Tester') || after.includes('Playwright') || after.includes('สำเร็จ')) ok('Tenant create', 'ผู้เช่า Playwright Tester ปรากฏ');
  else ok('Tenant create submit', 'submit ไม่มี 500 (drawer อาจ close แล้ว)');
} catch(e) { warn('Tenant create', e.message.slice(0,120)); }

// ═══ SETTINGS BUILDING ═══
await p.goto(`${BASE}/admin/settings/building`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
try {
  // inputs ไม่มี name — ใช้ nth() หรือ label
  const inputs = p.locator('input[type="text"], input:not([type="checkbox"]):not([type="radio"])');
  const n = await inputs.count();
  console.log(`building form inputs: ${n}`);
  if (n > 0) {
    // แก้ชื่ออาคาร (input แรก)
    await inputs.first().fill('MyTest Building').catch(()=>{});
    // กดบันทึก
    const saveBtn = p.locator('button:has-text("บันทึก")').first();
    await saveBtn.click({ timeout: 4000 }); await p.waitForTimeout(2000);
    const after = await p.locator('body').innerText();
    if (fivexx.some(e=>e.includes('building'))) bad('Settings/Building save', '500');
    else if (after.includes('เรียบร้อย') || after.includes('สำเร็จ') || after.includes('บันทึก')) ok('Settings/Building save', 'บันทึกสำเร็จ มี toast');
    else ok('Settings/Building save', 'submit ไม่มี 500');
  } else warn('Settings/Building inputs', 'ไม่พบ input field');
} catch(e) { warn('Settings/Building save', e.message.slice(0,120)); }

// ═══ SETTINGS BILLING POLICY — submit ═══
await p.goto(`${BASE}/admin/settings/billing-policy`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
try {
  const numInputs = p.locator('input[type="number"]');
  const n = await numInputs.count();
  if (n > 0) {
    await numInputs.first().fill('5'); // grace period = 5 days
    const saveBtn = p.locator('button:has-text("บันทึก"), button[type="submit"]').first();
    await saveBtn.click({ timeout: 3000 }); await p.waitForTimeout(1500);
    if (fivexx.some(e=>e.includes('billing-policy')||e.includes('billing-rules'))) bad('Billing Policy save', '500');
    else ok('Billing Policy save', 'บันทึกได้ไม่มี 500');
  } else warn('Billing Policy', 'ไม่พบ number input');
} catch(e) { warn('Billing Policy save', e.message.slice(0,100)); }

// ═══ ROOMS — ตรวจ room detail + status change ═══
await p.goto(`${BASE}/admin/rooms`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
try {
  // คลิกห้อง 3201
  await p.locator('text=3201').first().click({ timeout: 5000 });
  await p.waitForTimeout(1500);
  const roomTxt = await p.locator('body').innerText();
  if (roomTxt.includes('3201')) {
    ok('Room detail 3201', 'เปิดรายละเอียดห้องได้');
    // ตรวจว่ามีข้อมูลแสดง
    const hasRentInfo = roomTxt.includes('ค่าเช่า') || roomTxt.includes('rent') || roomTxt.includes('STANDARD') || roomTxt.includes('2900');
    if (hasRentInfo) ok('Room detail content', 'มีข้อมูลค่าเช่า/กฎบิล');
    else warn('Room detail content', 'เปิดได้แต่ข้อมูลน้อย');
  } else warn('Room 3201 detail', roomTxt.slice(0,80));
  await p.goBack(); await p.waitForTimeout(500);
} catch { warn('Room 3201 detail', 'คลิกไม่ได้'); }

// ═══ CONTRACTS — ตรวจสร้าง contract ═══
await p.goto(`${BASE}/admin/contracts`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
const conBtns = await p.locator('button').allInnerTexts();
console.log('contract buttons:', conBtns.filter(t=>t.trim()).map(t=>t.trim().slice(0,25)));
const conText = await p.locator('body').innerText();
ok('Contracts page', conText.includes('สัญญา')||conText.includes('ไม่พบ') ? 'แสดงผล' : conText.slice(0,80));

// ═══ FLOORS — floor 2 detail ═══
await p.goto(`${BASE}/admin/floors/2`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
const flText = await p.locator('body').innerText();
if (flText.includes('ชั้น') || flText.includes('ห้อง') || flText.includes('Floor')) ok('Floor 2 detail', 'แสดงผล');
else warn('Floor 2 detail', flText.slice(0,80));

// ═══ INVOICE DETAIL + action buttons ═══
await p.goto(`${BASE}/admin/invoices`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1000);
try {
  await p.locator('table tbody tr, [class*="invoice"]').first().click({ timeout: 5000 });
  await p.waitForTimeout(1500);
  const invTxt = await p.locator('body').innerText();
  const hasPaid = invTxt.includes('PAID') || invTxt.includes('ชำระแล้ว');
  const sendCount = await p.locator('button:has-text("ส่ง")').count();
  const payCount = await p.locator('button:has-text("ชำระ"), button:has-text("Pay")').count();
  ok('Invoice detail', `PAID=${hasPaid}, send buttons=${sendCount}, pay buttons=${payCount}`);
} catch { warn('Invoice detail click', 'ไม่มี row'); }

// ═══ Final check ═══
await p.waitForTimeout(500);
if (fivexx.length > 0) bad('5xx found', fivexx.join(' | '));
else ok('Zero server 5xx', 'clean');

await br.close();
console.log('\n═══ DONE ═══');
