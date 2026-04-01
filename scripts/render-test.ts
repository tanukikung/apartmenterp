/**
 * Test script: renders both invoice templates as PNG + PDF
 * Run: cd apps/erp && npx tsx scripts/render-test.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const OUT_DIR = path.join(__dirname, '../public');
mkdirSync(OUT_DIR, { recursive: true });

const HTML = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: sans-serif; font-size: 13px; color: #111; margin: 0; padding: 16px; background: white; }
  .invoice-header { display:flex; justify-content:space-between; margin-bottom:16px; }
  .invoice-title { font-size:22px; font-weight:700; }
  .invoice-meta { text-align:right; font-size:12px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { background:#1a1a1a; color:white; padding:8px 10px; text-align:left; }
  td { padding:7px 10px; border-bottom:1px solid #eee; }
  .text-right { text-align:right; }
  .total-row { background:#1a1a1a; color:white; }
  .total-amount { color:#fbbf24; font-size:18px; font-weight:700; }
  .meter-note { font-size:10px; color:#888; }
  .remark-box { margin-top:16px; padding:10px; background:#f8f8f8; border-left:4px solid #1a1a1a; font-size:11px; }
  .dark-card { background:#0f172a; color:white; padding:16px; border-radius:10px; margin-top:16px; }
  .dark-card h3 { color:#94a3b8; font-size:11px; text-transform:uppercase; letter-spacing:0.1em; margin:0 0 12px; }
  .dark-total { font-size:22px; color:#fbbf24; font-weight:800; }
  .payment-box { background:#f0fdf4; border:1px solid #86efac; padding:12px; border-radius:8px; margin-top:16px; font-size:11px; color:#166534; }
  .blue-card { background:#eff6ff; border:1px solid #bfdbfe; padding:10px; border-radius:8px; margin-bottom:12px; }
  .amber-card { background:#fffbeb; border:1px solid #fde68a; padding:10px; border-radius:8px; margin-bottom:12px; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
  .info-box { background:#f8fafc; border:1px solid #e2e8f0; padding:10px; border-radius:8px; }
  .info-label { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.08em; }
  .info-value { font-size:14px; font-weight:700; margin-top:2px; }
</style>
</head>
<body>

<!-- PAGE 1: Standard Invoice -->
<div style="page-break-after:always;">
  <div class="invoice-header">
    <div>
      <div class="invoice-title">ใบแจ้งหนี้ค่าบริการ</div>
      <div style="font-size:12px; color:#666;">Apartment Service Invoice</div>
    </div>
    <div class="invoice-meta">
      <div><strong>เลขที่:</strong> INV-2026-03-101-ABC</div>
      <div><strong>วันที่:</strong> 29 มีนาคม 2569</div>
      <div><strong>Due:</strong> 15 เมษายน 2569</div>
    </div>
  </div>

  <div style="margin-bottom:14px;">
    <div style="float:left; width:50%;">
      <div class="info-label">ผู้เช่า</div>
      <div style="font-size:14px; font-weight:700;">สมชาย ใจดี</div>
      <div style="font-size:12px; color:#555;">ห้อง 101 / ชั้น 1</div>
      <div style="font-size:12px; color:#555;">โทร. 081-234-5678</div>
    </div>
    <div style="float:right; width:50%; text-align:right;">
      <div class="info-label">รอบบิล</div>
      <div style="font-size:15px; font-weight:700;">มีนาคม 2569</div>
      <div style="font-size:12px; color:#555;">ชำระภายใน 15 เมษายน 2569</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>รายการ</th>
        <th class="text-right">จำนวน</th>
        <th class="text-right">ราคา/หน่วย</th>
        <th class="text-right">จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>ค่าเช่าห้องพัก</td>
        <td class="text-right">1 เดือน</td>
        <td class="text-right">-</td>
        <td class="text-right" style="font-weight:600;">10,500</td>
      </tr>
      <tr style="background:#f8fbff;">
        <td>ค่าน้ำประปา <span class="meter-note">(มิเตอร์ 1,200 → 1,215 = 15 หน่วย)</span></td>
        <td class="text-right">15 หน่วย</td>
        <td class="text-right">-</td>
        <td class="text-right" style="font-weight:600;">330</td>
      </tr>
      <tr>
        <td>ค่าไฟฟ้า <span class="meter-note">(มิเตอร์ 5,000 → 5,250 = 250 หน่วย)</span></td>
        <td class="text-right">250 หน่วย</td>
        <td class="text-right">-</td>
        <td class="text-right" style="font-weight:600;">1,296</td>
      </tr>
      <tr>
        <td>ค่าเฟอร์นิเจอร์</td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right" style="font-weight:600;">0</td>
      </tr>
      <tr>
        <td>ค่าบริการอื่นๆ</td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right" style="font-weight:600;">0</td>
      </tr>
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3" style="text-align:right; font-size:14px; padding:10px;">ยอดรวมทั้งสิ้น (บาท)</td>
        <td class="text-right total-amount" style="padding:10px;">12,126</td>
      </tr>
    </tfoot>
  </table>

  <div class="remark-box">
    <strong>หมายเหตุ:</strong> กรุณาชำระค่าบริการภายในวันครบกำหนด หากชำระล่าช้าจะมีค่าปรับตามข้อตกลงในสัญญาเช่า สอบถามเพิ่มเติม: โทร. 02-xxx-xxxx
  </div>
</div>

<!-- PAGE 2: Detailed Invoice -->
<div>
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
    <div>
      <div style="font-size:22px; font-weight:800; color:#0f172a;">ใบแจ้งหนี้แบบละเอียด</div>
      <div style="font-size:13px; color:#64748b;">Monthly Service Invoice — Detailed</div>
    </div>
    <div style="background:#0f172a; color:white; padding:8px 14px; border-radius:8px; text-align:center;">
      <div style="font-size:10px; opacity:0.7; text-transform:uppercase;">เลขที่</div>
      <div style="font-size:13px; font-weight:700;">INV-2026-03-101</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">ข้อมูลผู้เช่า</div>
      <div class="info-value">สมชาย ใจดี</div>
      <div style="font-size:12px; color:#475569;">📍 ห้อง 101 ชั้น 1</div>
      <div style="font-size:12px; color:#475569;">📞 081-234-5678</div>
    </div>
    <div class="info-box">
      <div class="info-label">รอบบิล</div>
      <div style="font-size:16px; font-weight:800; color:#0f172a;">มีนาคม 2569</div>
      <div style="font-size:12px; color:#dc2626;">📅 วันครบกำหนด: <strong>15 เมษายน 2569</strong></div>
      <div style="font-size:12px; color:#475569;">📋 สถานะ: <span style="background:#dbeafe; color:#1d4ed8; padding:1px 8px; border-radius:99px; font-size:11px; font-weight:600;">รอชำระ</span></div>
    </div>
  </div>

  <!-- Water -->
  <div class="blue-card">
    <div style="font-size:12px; font-weight:700; color:#1e40af; margin-bottom:8px;">💧 รายละเอียดค่าน้ำประปา</div>
    <table style="width:100%; border-collapse:collapse; font-size:12px; background:white; border-radius:6px; overflow:hidden;">
      <thead>
        <tr style="background:#dbeafe; color:#1e40af;">
          <th style="padding:6px 10px; text-align:left;">รายการ</th>
          <th style="padding:6px 10px; text-align:right;">ค่าอ่านเดิม</th>
          <th style="padding:6px 10px; text-align:right;">ค่าอ่านใหม่</th>
          <th style="padding:6px 10px; text-align:right;">หน่วยใช้</th>
          <th style="padding:6px 10px; text-align:right;">ค่าบริการ</th>
          <th style="padding:6px 10px; text-align:right;">รวม (บาท)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-top:1px solid #e2e8f0;">
          <td style="padding:7px 10px;">มิเตอร์น้ำ</td>
          <td style="padding:7px 10px; text-align:right; color:#64748b;">1,200</td>
          <td style="padding:7px 10px; text-align:right; color:#64748b;">1,215</td>
          <td style="padding:7px 10px; text-align:right; font-weight:600;">15 หน่วย</td>
          <td style="padding:7px 10px; text-align:right; color:#64748b;">30</td>
          <td style="padding:7px 10px; text-align:right; font-weight:700; color:#1d4ed8;">330</td>
        </tr>
        <tr style="background:#f8fafc; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b;">
          <td colspan="4" style="padding:5px 10px;">ค่าบริการประปา (ค่าบริการรายเดือน)</td>
          <td style="padding:5px 10px;"></td>
          <td style="padding:5px 10px; text-align:right;">30</td>
        </tr>
        <tr style="border-top:2px solid #1d4ed8; background:#dbeafe;">
          <td colspan="5" style="padding:7px 10px; text-align:right; font-weight:700; color:#1e40af; font-size:12px;">รวมค่าน้ำ</td>
          <td style="padding:7px 10px; text-align:right; font-weight:800; color:#1d4ed8;">330</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Electric -->
  <div class="amber-card">
    <div style="font-size:12px; font-weight:700; color:#b45309; margin-bottom:8px;">⚡ รายละเอียดค่าไฟฟ้า</div>
    <table style="width:100%; border-collapse:collapse; font-size:12px; background:white; border-radius:6px; overflow:hidden;">
      <thead>
        <tr style="background:#fef3c7; color:#b45309;">
          <th style="padding:6px 10px; text-align:left;">รายการ</th>
          <th style="padding:6px 10px; text-align:right;">ค่าอ่านเดิม</th>
          <th style="padding:6px 10px; text-align:right;">ค่าอ่านใหม่</th>
          <th style="padding:6px 10px; text-align:right;">หน่วยใช้</th>
          <th style="padding:6px 10px; text-align:right;">ค่าบริการ</th>
          <th style="padding:6px 10px; text-align:right;">รวม (บาท)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-top:1px solid #e2e8f0;">
          <td style="padding:7px 10px;">มิเตอร์ไฟฟ้า</td>
          <td style="padding:7px 10px; text-align:right; color:#64748b;">5,000</td>
          <td style="padding:7px 10px; text-align:right; color:#64748b;">5,250</td>
          <td style="padding:7px 10px; text-align:right; font-weight:600;">250 หน่วย</td>
          <td style="padding:7px 10px; text-align:right; color:#64748b;">300</td>
          <td style="padding:7px 10px; text-align:right; font-weight:700; color:#d97706;">1,296</td>
        </tr>
        <tr style="background:#fef9c3; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b;">
          <td colspan="4" style="padding:5px 10px;">ค่าบริการไฟฟ้า (ค่าบริการรายเดือน)</td>
          <td style="padding:5px 10px;"></td>
          <td style="padding:5px 10px; text-align:right;">300</td>
        </tr>
        <tr style="border-top:2px solid #d97706; background:#fef3c7;">
          <td colspan="5" style="padding:7px 10px; text-align:right; font-weight:700; color:#b45309; font-size:12px;">รวมค่าไฟฟ้า</td>
          <td style="padding:7px 10px; text-align:right; font-weight:800; color:#d97706;">1,296</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Dark summary card -->
  <div class="dark-card">
    <h3>สรุปยอดค่าบริการ</h3>
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <tbody>
        <tr><td style="padding:5px 0; opacity:0.8;">ค่าเช่าห้องพัก</td><td style="text-align:right; font-weight:600;">10,500 บาท</td></tr>
        <tr><td style="padding:5px 0; opacity:0.8;">ค่าน้ำประปา</td><td style="text-align:right; font-weight:600;">330 บาท</td></tr>
        <tr><td style="padding:5px 0; opacity:0.8;">ค่าไฟฟ้า</td><td style="text-align:right; font-weight:600;">1,296 บาท</td></tr>
        <tr style="border-top:2px solid rgba(255,255,255,0.3);">
          <td style="padding:10px 0 4px; font-size:15px; font-weight:700;">ยอดรวมทั้งสิ้น</td>
          <td style="text-align:right; font-size:22px; font-weight:800; color:#fbbf24;">12,126 บาท</td>
        </tr>
      </tbody>
    </table>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px;">
      <div style="background:rgba(255,255,255,0.08); padding:8px 12px; border-radius:6px;">
        <div style="font-size:10px; opacity:0.6; text-transform:uppercase;">กำหนดชำระ</div>
        <div style="font-size:13px; font-weight:700; color:#fbbf24;">15 เมษายน 2569</div>
      </div>
      <div style="background:rgba(255,255,255,0.08); padding:8px 12px; border-radius:6px;">
        <div style="font-size:10px; opacity:0.6; text-transform:uppercase;">สถานะ</div>
        <div style="font-size:13px; font-weight:700;">รอชำระ</div>
      </div>
    </div>
  </div>

  <div class="payment-box">
    <div style="font-size:12px; font-weight:700; margin-bottom:6px;">💳 ช่องทางการชำระเงิน</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:6px;">
      <div>🏦 ธนาคารกสิกรไทย 123-4-56789</div>
      <div>📱 PromptPay / LINE Pay</div>
    </div>
    <div>⚠️ กรุณาชำระตามเลขที่บิล หรือแนบสลิปการโอนเงิน Line: @apartment</div>
  </div>
</div>

</body>
</html>`;

async function main() {
  console.log('🚀 Launching Chromium...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

  console.log('📄 Rendering HTML...');
  await page.setContent(HTML, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  // PNG screenshot
  console.log('🖼️  Taking full-page screenshot...');
  const png = await page.screenshot({ type: 'png', fullPage: true, omitBackground: false });
  writeFileSync(path.join(OUT_DIR, 'invoice-preview-test.png'), png);
  console.log(`   PNG: ${png.length} bytes`);

  // PDF
  console.log('📰 Generating PDF...');
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  });
  writeFileSync(path.join(OUT_DIR, 'invoice-preview-test.pdf'), Buffer.from(pdf));
  console.log(`   PDF: ${pdf.length} bytes`);

  await browser.close();
  console.log('\n✅ Done! Files saved to:');
  console.log('   📄', path.join(OUT_DIR, 'invoice-preview-test.pdf'));
  console.log('   🖼️  ', path.join(OUT_DIR, 'invoice-preview-test.png'));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
