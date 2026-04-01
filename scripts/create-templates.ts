/**
 * Script to create 2 invoice templates with detailed Thai billing items.
 * Run: npx tsx scripts/create-templates.ts
 */
import { PrismaClient, DocumentTemplateType, DocumentTemplateStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const META_A4_PORTRAIT = JSON.stringify({
  pageSize: 'A4',
  orientation: 'PORTRAIT',
  marginPreset: 'normal',
  fontFamily: 'sans',
  fontSize: 'base',
  lineHeight: 'relaxed',
});

// ─── Template 1: ใบแจ้งหนี้ค่าบริการ (Standard Invoice) ───────────────────────
const TEMPLATE1_BODY = `<!--template-meta:${META_A4_PORTRAIT}-->
<header data-template-region="header">
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
    <div>
      <h1 style="margin:0; font-size:22px; color:#1a1a1a; font-weight:700;">ใบแจ้งหนี้ค่าบริการ</h1>
      <p style="margin:4px 0 0; font-size:13px; color:#666;">Apartment Service Invoice</p>
    </div>
    <div style="text-align:right;">
      <p style="margin:0; font-size:13px; color:#333;"><strong>เลขที่:</strong> <span data-template-field="billing.invoiceNumber">INV-{{billing.invoiceNumber}}</span></p>
      <p style="margin:4px 0 0; font-size:13px; color:#333;"><strong>วันที่:</strong> {{system.generatedAt}}</p>
      <p style="margin:4px 0 0; font-size:13px; color:#333;"><strong>Due:</strong> {{billing.dueDate}}</p>
    </div>
  </div>
  <hr style="border:none; border-top:2px solid #1a1a1a; margin:0 0 12px;"/>
  <table style="width:100%; margin-bottom:16px;">
    <tr>
      <td style="vertical-align:top; width:50%;">
        <p style="margin:0; font-size:11px; color:#999; text-transform:uppercase; letter-spacing:0.08em;">ผู้เช่า / Tenant</p>
        <p style="margin:4px 0 0; font-size:14px; font-weight:600; color:#1a1a1a;">{{tenant.fullName}}</p>
        <p style="margin:2px 0 0; font-size:13px; color:#555;">ห้อง {{room.number}} / ชั้น {{room.floorNumber}}</p>
        <p style="margin:2px 0 0; font-size:13px; color:#555;">โทร. {{tenant.phone}}</p>
      </td>
      <td style="vertical-align:top; width:50%; text-align:right;">
        <p style="margin:0; font-size:11px; color:#999; text-transform:uppercase; letter-spacing:0.08em;">รอบบิล / Billing Period</p>
        <p style="margin:4px 0 0; font-size:16px; font-weight:700; color:#1a1a1a;">{{computed.billingMonthLabel}}</p>
        <p style="margin:2px 0 0; font-size:13px; color:#555;">ชำระภายในวันที่ {{billing.dueDate}}</p>
      </td>
    </tr>
  </table>
</header>

<section data-template-region="body">
  <!-- Billing items table -->
  <table style="width:100%; border-collapse:collapse; font-size:13px; margin-top:8px;">
    <thead>
      <tr style="background:#1a1a1a; color:white;">
        <th style="padding:10px 12px; text-align:left; font-weight:600;">รายการ</th>
        <th style="padding:10px 12px; text-align:right; font-weight:600;">จำนวน</th>
        <th style="padding:10px 12px; text-align:right; font-weight:600;">ราคา/หน่วย</th>
        <th style="padding:10px 12px; text-align:right; font-weight:600;">จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>
      <!-- ค่าเช่าห้อง -->
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 12px; color:#333;">ค่าเช่าห้องพัก</td>
        <td style="padding:10px 12px; text-align:right; color:#555;">1 เดือน</td>
        <td style="padding:10px 12px; text-align:right; color:#555;">{{billing.rentAmount}}</td>
        <td style="padding:10px 12px; text-align:right; font-weight:600; color:#1a1a1a;">{{billing.rentAmount}}</td>
      </tr>
      <!-- ค่าน้ำ -->
      <tr style="border-bottom:1px solid #eee; background:#f8fbff;">
        <td style="padding:10px 12px; color:#333;">ค่าน้ำประปา <span style="font-size:11px; color:#888;">(มิเตอร์ {{billing.waterPrev}} → {{billing.waterCurr}} = {{billing.waterUnits}} หน่วย)</span></td>
        <td style="padding:10px 12px; text-align:right; color:#555;">{{billing.waterUnits}} หน่วย</td>
        <td style="padding:10px 12px; text-align:right; color:#555;">-</td>
        <td style="padding:10px 12px; text-align:right; font-weight:600; color:#1a1a1a;">{{billing.waterTotal}}</td>
      </tr>
      <!-- ค่าไฟ -->
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 12px; color:#333;">ค่าไฟฟ้า <span style="font-size:11px; color:#888;">(มิเตอร์ {{billing.electricPrev}} → {{billing.electricCurr}} = {{billing.electricUnits}} หน่วย)</span></td>
        <td style="padding:10px 12px; text-align:right; color:#555;">{{billing.electricUnits}} หน่วย</td>
        <td style="padding:10px 12px; text-align:right; color:#555;">-</td>
        <td style="padding:10px 12px; text-align:right; font-weight:600; color:#1a1a1a;">{{billing.electricTotal}}</td>
      </tr>
      <!-- ค่าเฟอร์นิเจอร์ (ถ้ามี) -->
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 12px; color:#333;">ค่าเฟอร์นิเจอร์</td>
        <td style="padding:10px 12px; text-align:right; color:#555;">-</td>
        <td style="padding:10px 12px; text-align:right; color:#555;">-</td>
        <td style="padding:10px 12px; text-align:right; font-weight:600; color:#1a1a1a;">{{billing.furnitureFee}}</td>
      </tr>
      <!-- ค่าอื่นๆ (ถ้ามี) -->
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 12px; color:#333;">ค่าบริการอื่นๆ</td>
        <td style="padding:10px 12px; text-align:right; color:#555;">-</td>
        <td style="padding:10px 12px; text-align:right; color:#555;">-</td>
        <td style="padding:10px 12px; text-align:right; font-weight:600; color:#1a1a1a;">{{billing.otherFee}}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr style="background:#1a1a1a; color:white;">
        <td colspan="3" style="padding:12px 12px; text-align:right; font-size:15px; font-weight:700;">ยอดรวมทั้งสิ้น (บาท)</td>
        <td style="padding:12px 12px; text-align:right; font-size:16px; font-weight:700; color:#fbbf24;">{{billing.total}}</td>
      </tr>
    </tfoot>
  </table>

  <!-- สถานะการชำระ -->
  {{#if payment.status}}
  <div style="margin-top:16px; padding:12px 16px; border-radius:8px; background:{{payment.status}} == 'PAID' ? '#dcfce7' : '#fef9c3'; border:1px solid {{payment.status}} == 'PAID' ? '#86efac' : '#fde047';">
    <p style="margin:0; font-size:13px; color:{{payment.status}} == 'PAID' ? '#166534' : '#854d0e';">
      <strong>สถานะชำระเงิน:</strong> {{payment.status}} | ชำระแล้ว {{payment.totalConfirmed}} บาท
    </p>
  </div>
  {{/if}}

  <!-- หมายเหตุ -->
  <div style="margin-top:24px; padding:12px 16px; background:#f8f8f8; border-radius:8px; border-left:4px solid #1a1a1a;">
    <p style="margin:0; font-size:12px; color:#555; line-height:1.6;">
      <strong>หมายเหตุ:</strong> กรุณาชำระค่าบริการภายในวันครบกำหนด หากชำระล่าช้าจะมีค่าปรับตามข้อตกลงในสัญญาเช่า
      สอบถามเพิ่มเติม: โทร. 02-xxx-xxxx หรือ Line: @apartment
    </p>
  </div>
</section>

<footer data-template-region="footer">
  <p style="text-align:center; font-size:11px; color:#aaa; margin:0; padding-top:8px; border-top:1px solid #eee;">
    เอกสารนี้สร้างอัตโนมัติจากระบบ Apartment ERP | วันที่พิมพ์ {{system.generatedAt}}
  </p>
</footer>`;

// ─── Template 2: ใบแจ้งหนี้แบบละเอียด (Detailed Invoice) ───────────────────────
const TEMPLATE2_BODY = `<!--template-meta:${META_A4_PORTRAIT}-->
<header data-template-region="header">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
    <div>
      <h1 style="margin:0; font-size:24px; color:#0f172a; font-weight:800; letter-spacing:-0.02em;">ใบแจ้งหนี้<br/><span style="font-size:14px; font-weight:400; color:#64748b;">Monthly Service Invoice</span></h1>
    </div>
    <div style="text-align:right;">
      <div style="background:#0f172a; color:white; padding:8px 16px; border-radius:8px; display:inline-block;">
        <p style="margin:0; font-size:11px; opacity:0.7; text-transform:uppercase; letter-spacing:0.1em;">เลขที่เอกสาร</p>
        <p style="margin:2px 0 0; font-size:14px; font-weight:700;">{{billing.invoiceNumber}}</p>
      </div>
    </div>
  </div>

  <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
    <tr>
      <td style="vertical-align:top; padding:12px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; width:50%;">
        <p style="margin:0 0 4px; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.1em; font-weight:600;">ข้อมูลผู้เช่า</p>
        <p style="margin:0; font-size:15px; font-weight:700; color:#0f172a;">{{tenant.fullName}}</p>
        <p style="margin:4px 0 0; font-size:13px; color:#475569;">📍 ห้อง {{room.number}} ชั้น {{room.floorNumber}}</p>
        <p style="margin:2px 0 0; font-size:13px; color:#475569;">📞 {{tenant.phone}}</p>
        {{#if tenant.email}}<p style="margin:2px 0 0; font-size:13px; color:#475569;">✉️ {{tenant.email}}</p>{{/if}}
      </td>
      <td style="width:16px;"></td>
      <td style="vertical-align:top; padding:12px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; width:50%;">
        <p style="margin:0 0 4px; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.1em; font-weight:600;">รอบบิล</p>
        <p style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">{{computed.billingMonthLabel}}</p>
        <p style="margin:4px 0 0; font-size:13px; color:#475569;">📅 วันครบกำหนด: <strong style="color:#dc2626;">{{billing.dueDate}}</strong></p>
        <p style="margin:2px 0 0; font-size:13px; color:#475569;">📋 สถานะ: <span style="background:#dbeafe; color:#1d4ed8; padding:1px 8px; border-radius:99px; font-size:12px; font-weight:600;">{{billing.status}}</span></p>
      </td>
    </tr>
  </table>
</header>

<section data-template-region="body">
  <!-- ===== มิเตอร์น้ำ ===== -->
  <div style="margin-bottom:20px;">
    <h3 style="margin:0 0 8px; font-size:13px; font-weight:700; color:#0f172a; text-transform:uppercase; letter-spacing:0.08em; display:flex; align-items:center; gap:6px;">
      <span style="background:#3b82f6; color:white; padding:2px 8px; border-radius:4px; font-size:11px;">💧</span>
      รายละเอียดค่าน้ำประปา
    </h3>
    <table style="width:100%; border-collapse:collapse; font-size:13px; background:white; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
      <thead>
        <tr style="background:#eff6ff;">
          <th style="padding:8px 12px; text-align:left; color:#1e40af; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">รายการ</th>
          <th style="padding:8px 12px; text-align:right; color:#1e40af; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">ค่าอ่านเดิม</th>
          <th style="padding:8px 12px; text-align:right; color:#1e40af; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">ค่าอ่านใหม่</th>
          <th style="padding:8px 12px; text-align:right; color:#1e40af; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">หน่วยที่ใช้</th>
          <th style="padding:8px 12px; text-align:right; color:#1e40af; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">ค่าบริการ</th>
          <th style="padding:8px 12px; text-align:right; color:#1e40af; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">รวม (บาท)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-top:1px solid #e2e8f0;">
          <td style="padding:10px 12px; color:#334155;">มิเตอร์น้ำ</td>
          <td style="padding:10px 12px; text-align:right; color:#64748b;">{{billing.waterPrev}}</td>
          <td style="padding:10px 12px; text-align:right; color:#64748b;">{{billing.waterCurr}}</td>
          <td style="padding:10px 12px; text-align:right; font-weight:600; color:#0f172a;">{{billing.waterUnits}} หน่วย</td>
          <td style="padding:10px 12px; text-align:right; color:#64748b;">{{billing.waterUsageCharge}}</td>
          <td style="padding:10px 12px; text-align:right; font-weight:700; color:#1d4ed8; font-size:15px;">{{billing.waterTotal}}</td>
        </tr>
        <tr style="background:#f8fafc; border-top:1px solid #e2e8f0;">
          <td style="padding:8px 12px; color:#64748b; font-size:12px;" colspan="4;">ค่าบริการประปา</td>
          <td style="padding:8px 12px;"></td>
          <td style="padding:8px 12px; text-align:right; color:#64748b; font-size:12px;">{{billing.waterServiceFee}}</td>
        </tr>
        <tr style="border-top:2px solid #1d4ed8; background:#eff6ff;">
          <td colspan="5" style="padding:8px 12px; text-align:right; color:#1e40af; font-weight:600;">รวมค่าน้ำ</td>
          <td style="padding:8px 12px; text-align:right; font-weight:800; color:#1d4ed8; font-size:15px;">{{billing.waterTotal}}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ===== มิเตอร์ไฟ ===== -->
  <div style="margin-bottom:20px;">
    <h3 style="margin:0 0 8px; font-size:13px; font-weight:700; color:#0f172a; text-transform:uppercase; letter-spacing:0.08em; display:flex; align-items:center; gap:6px;">
      <span style="background:#f59e0b; color:white; padding:2px 8px; border-radius:4px; font-size:11px;">⚡</span>
      รายละเอียดค่าไฟฟ้า
    </h3>
    <table style="width:100%; border-collapse:collapse; font-size:13px; background:white; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
      <thead>
        <tr style="background:#fffbeb;">
          <th style="padding:8px 12px; text-align:left; color:#b45309; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">รายการ</th>
          <th style="padding:8px 12px; text-align:right; color:#b45309; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">ค่าอ่านเดิม</th>
          <th style="padding:8px 12px; text-align:right; color:#b45309; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">ค่าอ่านใหม่</th>
          <th style="padding:8px 12px; text-align:right; color:#b45309; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">หน่วยที่ใช้</th>
          <th style="padding:8px 12px; text-align:right; color:#b45309; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">ค่าบริการ</th>
          <th style="padding:8px 12px; text-align:right; color:#b45309; font-weight:600; font-size:11px; text-transform:upperoshi; letter-spacing:0.06em;">รวม (บาท)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-top:1px solid #e2e8f0;">
          <td style="padding:10px 12px; color:#334155;">มิเตอร์ไฟฟ้า</td>
          <td style="padding:10px 12px; text-align:right; color:#64748b;">{{billing.electricPrev}}</td>
          <td style="padding:10px 12px; text-align:right; color:#64748b;">{{billing.electricCurr}}</td>
          <td style="padding:10px 12px; text-align:right; font-weight:600; color:#0f172a;">{{billing.electricUnits}} หน่วย</td>
          <td style="padding:10px 12px; text-align:right; color:#64748b;">{{billing.electricUsageCharge}}</td>
          <td style="padding:10px 12px; text-align:right; font-weight:700; color:#d97706; font-size:15px;">{{billing.electricTotal}}</td>
        </tr>
        <tr style="background:#fffbeb; border-top:1px solid #e2e8f0;">
          <td style="padding:8px 12px; color:#64748b; font-size:12px;" colspan="4;">ค่าบริการไฟฟ้า</td>
          <td style="padding:8px 12px;"></td>
          <td style="padding:8px 12px; text-align:right; color:#64748b; font-size:12px;">{{billing.electricServiceFee}}</td>
        </tr>
        <tr style="border-top:2px solid #d97706; background:#fffbeb;">
          <td colspan="5" style="padding:8px 12px; text-align:right; color:#b45309; font-weight:600;">รวมค่าไฟฟ้า</td>
          <td style="padding:8px 12px; text-align:right; font-weight:800; color:#d97706; font-size:15px;">{{billing.electricTotal}}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ===== สรุปยอด ===== -->
  <div style="background:#0f172a; border-radius:12px; padding:20px; color:white;">
    <h3 style="margin:0 0 16px; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; opacity:0.7;">สรุปยอดค่าบริการ</h3>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <tbody>
        <tr>
          <td style="padding:6px 0; opacity:0.8;">ค่าเช่าห้องพัก</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">{{billing.rentAmount}} บาท</td>
        </tr>
        {{#if billing.furnitureFee}}
        <tr>
          <td style="padding:6px 0; opacity:0.8;">ค่าเฟอร์นิเจอร์</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">{{billing.furnitureFee}} บาท</td>
        </tr>
        {{/if}}
        {{#if billing.otherFee}}
        <tr>
          <td style="padding:6px 0; opacity:0.8;">ค่าบริการอื่นๆ</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">{{billing.otherFee}} บาท</td>
        </tr>
        {{/if}}
        <tr>
          <td style="padding:6px 0; opacity:0.8;">ค่าน้ำประปา</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">{{billing.waterTotal}} บาท</td>
        </tr>
        <tr>
          <td style="padding:6px 0; opacity:0.8;">ค่าไฟฟ้า</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">{{billing.electricTotal}} บาท</td>
        </tr>
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid rgba(255,255,255,0.3);">
          <td style="padding:12px 0 4px; font-size:16px; font-weight:700;">ยอดรวมทั้งสิ้น</td>
          <td style="padding:12px 0 4px; text-align:right; font-size:22px; font-weight:800; color:#fbbf24;">{{billing.total}} บาท</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:16px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.2); display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div style="background:rgba(255,255,255,0.08); padding:10px 14px; border-radius:8px;">
        <p style="margin:0; font-size:11px; opacity:0.6; text-transform:uppercase; letter-spacing:0.06em;">กำหนดชำระ</p>
        <p style="margin:4px 0 0; font-size:14px; font-weight:700; color:#fbbf24;">{{billing.dueDate}}</p>
      </div>
      <div style="background:rgba(255,255,255,0.08); padding:10px 14px; border-radius:8px;">
        <p style="margin:0; font-size:11px; opacity:0.6; text-transform:uppercase; letter-spacing:0.06em;">สถานะ</p>
        <p style="margin:4px 0 0; font-size:14px; font-weight:700;">{{billing.status}}</p>
      </div>
    </div>
  </div>

  <!-- ช่องทางการชำระ -->
  <div style="margin-top:20px; padding:16px; background:#f0fdf4; border:1px solid #86efac; border-radius:8px;">
    <p style="margin:0 0 8px; font-size:13px; font-weight:700; color:#166534;">💳 ช่องทางการชำระเงิน</p>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px; color:#166534;">
      <p style="margin:0;">🏦 ธนาคารกสิกรไทย 123-4-56789</p>
      <p style="margin:0;">📱 PromptPay / LINE Pay</p>
    </div>
    <p style="margin:8px 0 0; font-size:12px; color:#166534;">⚠️ กรุณาชำระตามเลขที่บิล หรือแนบสลิปการโอนเงิน Line: @apartment</p>
  </div>
</section>

<footer data-template-region="footer">
  <p style="text-align:center; font-size:11px; color:#94a3b8; margin:0; padding-top:8px; border-top:1px solid #e2e8f0;">
    เอกสารนี้สร้างอัตโนมัติจากระบบ Apartment ERP | พิมพ์เมื่อ {{system.generatedAt}} | ติดต่อ 02-xxx-xxxx
  </p>
</footer>`;

async function main() {
  console.log('🔧 Creating invoice templates...\n');

  // Clean up existing test templates
  await prisma.documentTemplate.deleteMany({
    where: { name: { in: ['ใบแจ้งหนี้ค่าบริการ', 'ใบแจ้งหนี้แบบละเอียด'] } },
  });
  console.log('✅ Cleaned up existing templates');

  // Create Template 1 (template first, then version, then wire them)
  const t1Id = randomUUID();
  const v1Id = randomUUID();
  await prisma.documentTemplate.create({
    data: {
      id: t1Id,
      name: 'ใบแจ้งหนี้ค่าบริการ',
      description: 'ใบแจ้งหนี้รายเดือนแบบมาตรฐาน แสดงรายการค่าเช่า ค่าน้ำ ค่าไฟ และค่าบริการอื่นๆ',
      type: DocumentTemplateType.INVOICE,
      status: DocumentTemplateStatus.ACTIVE,
      subject: 'ใบแจ้งหนี้ค่าบริการประจำเดือน',
      body: TEMPLATE1_BODY,
    },
  });
  await prisma.documentTemplateVersion.create({
    data: {
      id: v1Id,
      templateId: t1Id,
      version: 1,
      status: 'ACTIVE',
      body: TEMPLATE1_BODY,
      subject: 'ใบแจ้งหนี้ค่าบริการประจำเดือน',
    },
  });
  await prisma.documentTemplate.update({ where: { id: t1Id }, data: { activeVersionId: v1Id } });
  console.log('✅ Created template 1: ใบแจ้งหนี้ค่าบริการ (Standard Invoice)');

  // Create Template 2
  const t2Id = randomUUID();
  const v2Id = randomUUID();
  await prisma.documentTemplate.create({
    data: {
      id: t2Id,
      name: 'ใบแจ้งหนี้แบบละเอียด',
      description: 'ใบแจ้งหนี้แสดงรายละเอียดมิเตอร์น้ำ/ไฟ แยกค่าบริการออกจากค่ากิจใช้ พร้อมสรุปยอดแบบ Dark card',
      type: DocumentTemplateType.INVOICE,
      status: DocumentTemplateStatus.ACTIVE,
      subject: 'ใบแจ้งหนี้รายละเอียดประจำเดือน',
      body: TEMPLATE2_BODY,
    },
  });
  await prisma.documentTemplateVersion.create({
    data: {
      id: v2Id,
      templateId: t2Id,
      version: 1,
      status: 'ACTIVE',
      body: TEMPLATE2_BODY,
      subject: 'ใบแจ้งหนี้รายละเอียดประจำเดือน',
    },
  });
  await prisma.documentTemplate.update({ where: { id: t2Id }, data: { activeVersionId: v2Id } });
  console.log('✅ Created template 2: ใบแจ้งหนี้แบบละเอียด (Detailed Invoice)');

  console.log('\n🎉 Done! Created 2 invoice templates:');
  console.log('   1. ใบแจ้งหนี้ค่าบริการ (Standard Invoice)');
  console.log('   2. ใบแจ้งหนี้แบบละเอียด (Detailed Invoice with meter breakdown)');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
