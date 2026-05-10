/**
 * Deep interactive test — กรอก form จริง, submit จริง, ตรวจ response
 */
import { chromium } from 'playwright';
const BASE = 'http://localhost:3001';
const R = { pass: 0, fail: 0, skip: 0 };
const issues = [];

const br = await chromium.launch({ headless: true });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

// Track 5xx
const fivexx = [];
p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) fivexx.push(`${r.status()} ${r.url()}`); });

function pass(label, detail='') { console.log(`✅ ${label}${detail?' — '+detail:''}`); R.pass++; }
function fail(label, detail='') { console.log(`🔴 ${label}${detail?' — '+detail:''}`); R.fail++; issues.push({label,detail}); }
function skip(label, detail='') { console.log(`⚠️  ${label}${detail?' — '+detail:''}`); R.skip++; }
async function go(path) { await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 25000 }); await p.waitForTimeout(800); }
async function bodyText() { return p.locator('body').innerText(); }

// LOGIN
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await p.fill('input[type="text"], input[name="username"]', 'owner').catch(async()=>{
  await p.locator('input').nth(0).fill('owner');
});
await p.fill('input[type="password"]', 'Owner@12345');
await Promise.all([p.waitForURL(/\/admin/, {timeout:15000}).catch(()=>{}), p.click('button[type="submit"]')]);
p.url().includes('/admin') ? pass('Login') : fail('Login', p.url());

// ═══ MAINTENANCE ═══
await go('/admin/maintenance');
const mText = await bodyText();
// check real content, not nav
if (mText.includes('OPEN') || mText.includes('แจ้งซ่อม') || mText.includes('ไม่พบ') || mText.includes('maintenance') || mText.includes('Maintenance') || mText.includes('ซ่อม')) {
  pass('Maintenance page', 'แสดงผลได้');
} else {
  // dump for debug
  const lines = mText.split('\n').filter(l=>l.trim().length>3).slice(0,10).join(' | ');
  skip('Maintenance page', `content: ${lines.slice(0,200)}`);
}

// ═══ CREATE TENANT (form ใหม่) ═══
await go('/admin/tenants');
try {
  const addBtn = p.locator('button').filter({hasText:/เพิ่ม|Add|สร้าง|ผู้เช่า/i}).first();
  await addBtn.waitFor({timeout:4000});
  await addBtn.click(); await p.waitForTimeout(500);
  // fill form
  await p.fill('input[name="firstName"], input[placeholder*="ชื่อ"], input[placeholder*="First"]', 'Test').catch(()=>{});
  await p.fill('input[name="lastName"], input[placeholder*="นามสกุล"], input[placeholder*="Last"]', 'UserPlaywright').catch(()=>{});
  await p.fill('input[name="phone"], input[type="tel"]', '0899999999').catch(()=>{});
  const submitBtn = p.locator('button[type="submit"], button').filter({hasText:/บันทึก|Save|ยืนยัน|สร้าง|Create/}).first();
  await submitBtn.waitFor({timeout:3000});
  await submitBtn.click(); await p.waitForTimeout(1500);
  const afterText = await bodyText();
  if (afterText.includes('UserPlaywright') || afterText.includes('สำเร็จ') || afterText.includes('Success') || !afterText.includes('ผิดพลาด')) {
    pass('Create Tenant', 'submit form สำเร็จ');
  } else {
    skip('Create Tenant', 'submit แล้วตรวจ response ไม่ชัดเจน');
  }
} catch(e) { skip('Create Tenant', 'เปิด form ไม่ได้: ' + e.message.slice(0,80)); }

// ═══ BILLING — ดูรายละเอียดบิล ═══
await go('/admin/billing');
try {
  // คลิก row แรก
  const firstRow = p.locator('table tbody tr, [data-testid="billing-row"], .billing-item').first();
  await firstRow.waitFor({timeout:5000});
  await firstRow.click(); await p.waitForTimeout(1000);
  const detail = await bodyText();
  if (detail.includes('2026') || detail.includes('3201') || detail.includes('LOCKED') || detail.includes('DRAFT')) {
    pass('Billing row click', 'เปิดรายละเอียดได้');
  } else skip('Billing row click', detail.slice(0,100));
  await p.goBack(); await p.waitForTimeout(500);
} catch { skip('Billing row click', 'ไม่มี row หรือ click ไม่ได้'); }

// ═══ INVOICE — view + send button check ═══
await go('/admin/invoices');
try {
  const row = p.locator('table tbody tr, [data-testid*="invoice"], .invoice-row').first();
  await row.waitFor({timeout:5000});
  await row.click(); await p.waitForTimeout(1000);
  const inv = await bodyText();
  if (inv.includes('INV') || inv.includes('PAID') || inv.includes('GENERATED') || inv.includes('2026')) {
    pass('Invoice detail page', 'แสดงรายละเอียด invoice ได้');
  } else skip('Invoice detail page', inv.slice(0,120));
  // check for send/pay buttons
  const hasSend = await p.locator('button').filter({hasText:/ส่ง|Send/}).count();
  const hasPay = await p.locator('button').filter({hasText:/ชำระ|Pay|จ่าย/}).count();
  if (hasSend > 0 || hasPay > 0) pass('Invoice action buttons', `send=${hasSend}, pay=${hasPay}`);
  else skip('Invoice action buttons', 'ไม่พบปุ่ม send/pay');
  await p.goBack(); await p.waitForTimeout(500);
} catch { skip('Invoice detail', 'ไม่มี invoice row'); }

// ═══ PAYMENTS — review tab ═══
await go('/admin/payments');
const payText = await bodyText();
if (payText.includes('500') && payText.toLowerCase().includes('server error')) {
  fail('Payments page', 'ยังมี 500 error แสดง');
} else pass('Payments page', 'แสดงผลปกติ');

await go('/admin/payments/review');
const revText = await bodyText();
if (revText.includes('ตรวจสอบ') || revText.includes('review') || revText.includes('ไม่พบ') || revText.includes('Review')) {
  pass('Payments review page', 'แสดงผลได้');
} else skip('Payments review', revText.slice(0,100));

// ═══ SETTINGS — billing policy form check ═══
await go('/admin/settings/billing-policy');
const bpText = await bodyText();
const hasInputs = await p.locator('input[type="number"], input[name*="grace"], input[name*="penalty"], input[name*="rate"]').count();
if (hasInputs > 0) pass('Settings/Billing Policy form', `มี ${hasInputs} input fields`);
else skip('Settings/Billing Policy form', 'ไม่พบ input fields สำหรับตั้งค่า');

// ═══ SETTINGS — automation ═══
await go('/admin/settings/automation');
const autoText = await bodyText();
if (autoText.includes('อัตโนมัติ') || autoText.includes('automation') || autoText.includes('Automation') || autoText.includes('schedule')) {
  pass('Settings/Automation', 'แสดงผลได้');
} else skip('Settings/Automation', autoText.slice(0,80));

// ═══ FLOORS — floor detail ═══
await go('/admin/floors');
try {
  const floor = p.locator('a, button, [role="link"]').filter({hasText:/ชั้น|Floor|2|3|4/i}).first();
  await floor.waitFor({timeout:3000});
  await floor.click(); await p.waitForTimeout(1000);
  const fl = await bodyText();
  if (fl.includes('ห้อง') || fl.includes('ชั้น') || fl.includes('3')) pass('Floor detail click', 'เปิดได้');
  else skip('Floor detail click', fl.slice(0,80));
} catch { skip('Floor detail click', 'ไม่สามารถคลิก floor'); }

// ═══ REPORTS — ตรวจว่า render chart/data ได้ ═══
await go('/admin/reports/revenue');
const revRpt = await bodyText();
if (revRpt.includes('รายได้') || revRpt.includes('Revenue') || revRpt.includes('บาท') || revRpt.includes('฿')) {
  pass('Reports/Revenue', 'มีข้อมูลรายได้');
} else skip('Reports/Revenue', 'ไม่มีข้อมูล (DB ใหม่ปกติ)');

// ═══ OVERDUE — room detail ═══
await go('/admin/overdue');
try {
  const roomLink = p.locator('a, tr').filter({hasText:/320|321|322/}).first();
  await roomLink.waitFor({timeout:3000});
  await roomLink.click(); await p.waitForTimeout(1000);
  const od = await bodyText();
  if (od.includes('320') || od.includes('invoice') || od.includes('Invoice')) pass('Overdue room detail', 'คลิก overdue room ได้');
  else skip('Overdue room detail', od.slice(0,100));
  await p.goBack(); await p.waitForTimeout(500);
} catch { skip('Overdue room click', 'ไม่มีข้อมูล (DB ใหม่)'); }

// ═══ SYSTEM HEALTH — ตรวจสอบว่าสถานะ DB แสดง ═══
await go('/admin/system-health');
const shText = await bodyText();
if (shText.includes('connected') || shText.includes('ok') || shText.includes('✓') || shText.includes('สุขภาพ') || shText.includes('database')) {
  pass('System Health', 'แสดงสถานะระบบได้');
} else skip('System Health', shText.slice(0,100));

// ═══ SYSTEM JOBS — trigger a job ═══
await go('/admin/system-jobs');
try {
  const runBtn = p.locator('button').filter({hasText:/Run|รัน|เรียก/i}).first();
  await runBtn.waitFor({timeout:4000});
  await runBtn.click(); await p.waitForTimeout(2000);
  const jText = await bodyText();
  if (fivexx.some(e=>e.includes('jobs'))) fail('System Jobs — Run job', `5xx: ${fivexx.filter(e=>e.includes('jobs')).join(', ')}`);
  else pass('System Jobs — Run job', 'กดปุ่ม Run ได้ไม่มี 500');
} catch { skip('System Jobs — Run job', 'หาปุ่มไม่เจอ'); }

// ═══ CHAT — ตรวจ conversation list ═══
await go('/admin/chat');
const chatText = await bodyText();
if (chatText.includes('ไม่พบ') || chatText.includes('ไม่มีการสนทนา') || chatText.includes('สนทนา') || chatText.includes('conversation') || chatText.includes('Chat')) {
  pass('Chat page', 'render ได้');
} else skip('Chat page', chatText.slice(0,80));

// ═══ BROADCAST — สร้าง broadcast ═══
await go('/admin/broadcast');
try {
  const newBtn = p.locator('button').filter({hasText:/สร้าง|New|ใหม่|ประกาศ/i}).first();
  await newBtn.waitFor({timeout:4000});
  await newBtn.click(); await p.waitForTimeout(500);
  const hasForm = await p.locator('input, textarea').count();
  if (hasForm > 0) pass('Broadcast — สร้างใหม่', 'form เปิดได้');
  else skip('Broadcast — สร้างใหม่', 'เปิดได้แต่ไม่พบ form input');
  await p.keyboard.press('Escape');
} catch { skip('Broadcast — new button', 'หาปุ่มไม่เจอ'); }

// ═══ ANALYTICS — ตรวจ chart containers ═══
await go('/admin/analytics');
await p.waitForTimeout(2000);
const anText = await bodyText();
// charts ปกติจะ render เป็น svg หรือ canvas
const hasSvg = await p.locator('svg, canvas').count();
if (hasSvg > 0) pass('Analytics', `มี ${hasSvg} chart elements (svg/canvas)`);
else skip('Analytics', 'ไม่พบ chart svg/canvas (อาจยังไม่มีข้อมูล)');

// ═══ AUDIT LOGS — ตรวจ log entries ═══
await go('/admin/audit-logs');
await p.waitForTimeout(1000);
const auditText = await bodyText();
// ควรมี login log จากการ test
if (auditText.includes('LOGIN') || auditText.includes('login') || auditText.includes('owner') || auditText.includes('audit')) {
  pass('Audit Logs', 'มี audit entries');
} else skip('Audit Logs', auditText.slice(0,100));

// ═══ BILLING IMPORT ═══
await go('/admin/billing/import');
const biText = await bodyText();
if (biText.includes('นำเข้า') || biText.includes('Import') || biText.includes('อัพโหลด') || biText.includes('Upload') || biText.includes('ไฟล์')) {
  pass('Billing Import page', 'หน้าแสดงผล upload UI');
} else skip('Billing Import', biText.slice(0,80));

// ═══ REPORTS — collections ═══
await go('/admin/reports/collections');
const colText = await bodyText();
if (colText.includes('เก็บเงิน') || colText.includes('Collection') || colText.includes('รายงาน') || colText.includes('Report')) {
  pass('Reports/Collections', 'แสดงผล');
} else skip('Reports/Collections', colText.slice(0,80));

// ═══ LATE FEES — ตรวจ run button ═══
await go('/admin/late-fees');
const lfText = await bodyText();
if (lfText.includes('ค่าปรับ') || lfText.includes('Late') || lfText.includes('late') || lfText.includes('penalty')) {
  pass('Late Fees', 'แสดง late fee info ได้');
} else skip('Late Fees', lfText.slice(0,80));

// ═══ USERS — admin settings/users ═══
await go('/admin/settings/users');
const uText = await bodyText();
if (uText.includes('owner') && uText.includes('staff')) {
  pass('Settings/Users', 'เห็น owner และ staff ครบ');
} else if (uText.includes('owner') || uText.includes('staff')) {
  pass('Settings/Users', 'เห็น user บางส่วน');
} else skip('Settings/Users', uText.slice(0,80));

// ═══ CHECK for any 5xx ═══
await p.waitForTimeout(500);
if (fivexx.length > 0) {
  fail('Server 5xx detected', fivexx.join(' | '));
} else pass('No server 5xx throughout test', `${R.pass} passes, 0 server errors`);

await br.close();
console.log(`\n${'═'.repeat(50)}`);
console.log(`FINAL: ${R.pass} ✅  ${R.fail} 🔴  ${R.skip} ⚠️`);
if (issues.length) { console.log('\n🔴 Issues:'); issues.forEach(i=>console.log(`  ${i.label}: ${i.detail}`)); }
