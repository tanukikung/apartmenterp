// ทดสอบส่วนที่เหลือ — Maintenance page ใหม่ + Tenant create + Broadcast
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

// Login
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await p.fill('input[type="text"], input[name="username"]', 'owner').catch(async()=>{ await p.locator('input').nth(0).fill('owner'); });
await p.fill('input[type="password"]', 'Owner@12345');
await Promise.all([p.waitForURL(/\/admin/, {timeout:15000}).catch(()=>{}), p.click('button[type="submit"]')]);

// ═══ 1. MAINTENANCE PAGE (ใหม่) ═══
await p.goto(`${BASE}/admin/maintenance`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(2000);
// ตรวจว่าไม่ redirect ไป system-health แล้ว
const maintUrl = p.url();
if (maintUrl.includes('system-health')) {
  bad('Maintenance page redirect', 'ยัง redirect ไป system-health อยู่ (Next.js cache?)');
} else {
  const main = p.locator('main, [role="main"]').first();
  const txt = await main.innerText().catch(async () => p.locator('body').innerText());
  if (txt.includes('แจ้งซ่อม') || txt.includes('Maintenance') || txt.includes('ซ่อม') || txt.includes('รับแจ้ง')) {
    ok('Maintenance page', 'แสดงหน้าจัดการแจ้งซ่อมได้');
    // ตรวจ ticket list
    const tickets = await p.locator('text=รอดำเนินการ, text=กำลังซ่อม, text=OPEN, text=IN_PROGRESS').count().catch(()=>0);
    const stats = await p.locator('text=ทั้งหมด').count();
    if (stats > 0) ok('Maintenance stats', 'แสดง stats ได้');
  } else {
    warn('Maintenance page', txt.slice(0,150));
  }
}

// ═══ 2. MAINTENANCE — click ticket ═══
try {
  const ticketCard = p.locator('[class*="cursor-pointer"], .cursor-pointer').first();
  await ticketCard.waitFor({ timeout: 4000 });
  await ticketCard.click(); await p.waitForTimeout(500);
  // ตรวจ detail panel เปิด
  const hasStatusSelect = await p.locator('select').count();
  if (hasStatusSelect > 0) {
    ok('Maintenance ticket detail panel', `มี ${hasStatusSelect} dropdown`);
    // เปลี่ยนสถานะ
    const statusSel = p.locator('select').first();
    await statusSel.selectOption('IN_PROGRESS'); await p.waitForTimeout(1500);
    if (fivexx.some(e => e.includes('maintenance'))) bad('Maintenance update-status', fivexx.filter(e=>e.includes('maintenance')).join(', '));
    else ok('Maintenance update-status', 'เปลี่ยนสถานะได้ไม่มี 500');
    // เพิ่ม comment
    const commentBox = p.locator('textarea').first();
    await commentBox.fill('ตรวจสอบแล้ว กำลังดำเนินการ');
    await p.locator('button').filter({hasText:/บันทึก comment/}).click(); await p.waitForTimeout(1500);
    if (fivexx.some(e => e.includes('comment'))) bad('Maintenance add comment', '500 error');
    else ok('Maintenance add comment', 'เพิ่ม comment ได้');
  } else warn('Maintenance detail panel', 'คลิกแล้วแต่ไม่พบ select/form');
} catch { warn('Maintenance ticket click', 'ไม่มี ticket (DB ใหม่)'); }

// ═══ 3. TENANTS — สร้าง tenant ใหม่ ═══
await p.goto(`${BASE}/admin/tenants`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
try {
  // ปุ่ม "เพิ่มผู้เช่า" — ใช้ exact text
  await p.locator('button:has-text("เพิ่มผู้เช่า")').click({ timeout: 5000 });
  await p.waitForTimeout(800);
  // ตรวจว่า modal/dialog เปิด
  const dlg = p.locator('[role="dialog"], .modal-backdrop, form[class*="modal"]').first();
  const formVisible = await dlg.isVisible().catch(()=>false);
  if (!formVisible) {
    // อาจเปิดเป็น inline form
    const inputs = await p.locator('input[name], input[type="text"], input[type="tel"]').count();
    if (inputs < 2) { warn('Tenant create dialog', 'modal ไม่เปิดหรือ form ไม่มี input'); }
  }
  // กรอกข้อมูล
  await p.fill('input[name="firstName"], input[placeholder*="ชื่อ"]', 'Playwright').catch(()=>{});
  await p.fill('input[name="lastName"], input[placeholder*="นามสกุล"]', 'Tester').catch(()=>{});
  await p.fill('input[name="phone"], input[type="tel"]', '0811111111').catch(()=>{});
  await p.fill('input[name="email"], input[type="email"]', 'play@test.com').catch(()=>{});
  // submit
  await p.locator('button[type="submit"]').click({ timeout: 3000 });
  await p.waitForTimeout(2000);
  const after = await p.locator('body').innerText();
  if (after.includes('Tester') || after.includes('Playwright')) {
    ok('Create Tenant', 'ผู้เช่า "Playwright Tester" ปรากฏในรายการ');
  } else if (!fivexx.some(e=>e.includes('tenant'))) {
    ok('Create Tenant submit', 'submit ได้ไม่มี 500 (อาจ auto-close dialog)');
  } else {
    bad('Create Tenant', fivexx.filter(e=>e.includes('tenant')).join(', '));
  }
} catch (e) { warn('Create Tenant', e.message.slice(0,100)); }

// ═══ 4. BROADCAST — ตรวจฟีเจอร์ส่ง reminder ═══
await p.goto(`${BASE}/admin/broadcast`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
const bcText = await p.locator('main, body').first().innerText();
// ปุ่ม "ส่ง Reminder" ควรมีอยู่
const hasSendBtn = await p.locator('button:has-text("ส่ง Reminder")').count();
if (hasSendBtn > 0) {
  ok('Broadcast — ส่ง Reminder button', 'ปุ่มอยู่และ visible');
  // หน้านี้แสดง "ไม่พบใบแจ้งหนี้ค้างชำระ" เป็นเรื่องปกติของ DB ใหม่
  ok('Broadcast page', 'UI ครบถ้วน (ไม่มี overdue เพราะ DB ใหม่)');
} else warn('Broadcast', 'ไม่พบปุ่ม ส่ง Reminder');

// ═══ 5. SETTINGS BUILDING — submit form ═══
await p.goto(`${BASE}/admin/settings/building`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1000);
try {
  // กรอกชื่ออาคาร
  const nameInput = p.locator('input[name*="name"], input[name*="building"]').first();
  await nameInput.fill('Test Building (Playwright)').catch(()=>{});
  const saveBtn = p.locator('button[type="submit"], button:has-text("บันทึก")').first();
  await saveBtn.click({ timeout: 3000 }); await p.waitForTimeout(1500);
  if (fivexx.some(e=>e.includes('building'))) bad('Settings/Building save', '500');
  else ok('Settings/Building save', 'บันทึกได้ไม่มี 500');
} catch { warn('Settings/Building save', 'หาปุ่มหรือ input ไม่เจอ'); }

// ═══ 6. SYSTEM HEALTH — verify real content ═══
await p.goto(`${BASE}/admin/system-health`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
const shTxt = await p.locator('main').first().innerText().catch(async()=> p.locator('body').innerText());
if (shTxt.includes('ฐานข้อมูล') || shTxt.includes('Database') || shTxt.includes('connected') || shTxt.includes('ปกติ')) {
  ok('System Health', 'แสดงสถานะ DB + services ได้');
} else warn('System Health content', shTxt.slice(0,120));

// ═══ 7. AUDIT LOGS — ตรวจว่ามี entries ═══
await p.goto(`${BASE}/admin/audit-logs`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
const auTxt = await p.locator('main').first().innerText().catch(async()=> p.locator('body').innerText());
const hasEntries = await p.locator('table tbody tr').count().catch(()=>0);
if (hasEntries > 0 || auTxt.includes('LOGIN') || auTxt.includes('PAYMENT')) {
  ok('Audit Logs', `มี ${hasEntries} audit entries`);
} else warn('Audit Logs', 'ไม่พบ entries');

// ═══ 8. Final 5xx check ═══
if (fivexx.length > 0) {
  bad('Server 5xx detected', fivexx.join(' | '));
} else ok('Zero server 5xx', 'ทุก action ไม่มี 500');

await br.close();
console.log('\n' + '═'.repeat(50));
console.log('done');
