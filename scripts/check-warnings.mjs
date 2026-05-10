// ตรวจ 6 ⚠️ item ให้ชัดขึ้น
import { chromium } from 'playwright';
const BASE = 'http://localhost:3001';
const br = await chromium.launch({ headless: true });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

// Login
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await p.fill('input[type="text"], input[name="username"]', 'owner').catch(async()=>{ await p.locator('input').nth(0).fill('owner'); });
await p.fill('input[type="password"]', 'Owner@12345');
await Promise.all([p.waitForURL(/\/admin/, {timeout:15000}).catch(()=>{}), p.click('button[type="submit"]')]);
console.log('logged in =', p.url().includes('/admin'));

// helper: capture all buttons on page
async function showButtons(label) {
  const btns = await p.locator('button').all();
  const texts = await Promise.all(btns.map(b => b.innerText().catch(()=>'')));
  console.log(`[${label}] Buttons found:`, texts.filter(t=>t.trim()).map(t=>t.trim().slice(0,30)).join(' | '));
}
async function showMainContent(label) {
  // get main/article/[role=main] text, exclude nav
  const mainEl = p.locator('main, [role="main"], article, .main-content, #main').first();
  const exists = await mainEl.count();
  if (exists > 0) {
    const t = await mainEl.innerText();
    console.log(`[${label}] MAIN content (first 400):\n`, t.slice(0,400));
  } else {
    // fallback: just body but skip nav
    const t = await p.locator('body').innerText();
    const lines = t.split('\n').filter(l=>l.trim().length>2);
    console.log(`[${label}] Body lines:`, lines.slice(0,15).join(' | '));
  }
}

// ═══ 1. MAINTENANCE ═══
console.log('\n═══ MAINTENANCE ═══');
await p.goto(`${BASE}/admin/maintenance`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(2000);
await showMainContent('maintenance');
await showButtons('maintenance');

// ═══ 2. SYSTEM HEALTH ═══
console.log('\n═══ SYSTEM HEALTH ═══');
await p.goto(`${BASE}/admin/system-health`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(2000);
await showMainContent('system-health');

// ═══ 3. AUDIT LOGS ═══
console.log('\n═══ AUDIT LOGS ═══');
await p.goto(`${BASE}/admin/audit-logs`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(2000);
await showMainContent('audit-logs');

// ═══ 4. CREATE TENANT — ค้นหาปุ่มที่ถูกต้อง ═══
console.log('\n═══ TENANTS — buttons ═══');
await p.goto(`${BASE}/admin/tenants`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
await showButtons('tenants');
await showMainContent('tenants');
// try all buttons ว่าปุ่มไหนเปิด modal
const btns = await p.locator('button').all();
for (const btn of btns) {
  const t = await btn.innerText().catch(()=>'');
  if (!t.trim()) continue;
  console.log(`  btn: "${t.trim().slice(0,40)}"`);
}

// ═══ 5. BROADCAST — ค้นหาปุ่มที่ถูกต้อง ═══
console.log('\n═══ BROADCAST — buttons ═══');
await p.goto(`${BASE}/admin/broadcast`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1500);
await showButtons('broadcast');
await showMainContent('broadcast');

// ═══ 6. ทดสอบ CREATE TENANT จริงๆ via API ═══
console.log('\n═══ Tenants — actual create via UI ═══');
await p.goto(`${BASE}/admin/tenants`, { waitUntil: 'networkidle', timeout: 25000 });
await p.waitForTimeout(1000);
// พยายามหาปุ่มทุกวิธี
const allBtns = await p.locator('button').all();
for (const btn of allBtns) {
  const txt = await btn.innerText().catch(()=>'');
  const vis = await btn.isVisible().catch(()=>false);
  if (vis && txt.trim()) console.log(`  visible btn: "${txt.trim().slice(0,40)}"`);
}

await br.close();
