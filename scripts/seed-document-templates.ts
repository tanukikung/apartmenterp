/**
 * Seed default document templates into the database.
 * Run via: npx tsx scripts/seed-document-templates.ts
 *
 * Or import and call seedDocumentTemplates(prisma) from setup complete API.
 */

import { PrismaClient, DocumentTemplateType, DocumentTemplateStatus, DocumentTemplateVersionStatus } from '@prisma/client';

// ─── Default template HTML bodies ─────────────────────────────────────────────
// These use {{handlebars}} placeholders for field resolution.
// The body is stored directly in DocumentTemplate.body and DocumentTemplateVersion.body.

const INVOICE_BODY = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DejaVu Sans', 'Noto Sans Thai', Arial, sans-serif; font-size: 14px; color: #2D2D2D; background: #FAF8F5; }
.doc-header { background: linear-gradient(135deg, #5C8A68 0%, #4A7258 100%); color: white; padding: 28px 36px; }
.doc-header .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
.doc-header .subtitle { font-size: 11px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.04em; }
.doc-body { padding: 28px 36px; background: #FFFFFF; }
.doc-footer { padding: 16px 36px; background: #E8F0EB; border-top: 1px solid #E5E0DA; font-size: 11px; color: #6B6560; text-align: center; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
.info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 3px; }
.info-value { font-size: 14px; font-weight: 600; color: #2D2D2D; }
table { width: 100%; border-collapse: collapse; }
th { background: #E8F0EB; color: #4A7258; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left; font-weight: 600; }
th.right { text-align: right; }
td { padding: 10px 14px; border-bottom: 1px solid #E5E0DA; font-size: 13px; vertical-align: top; }
td.right { text-align: right; font-variant-numeric: tabular-nums; }
.total-row td { font-weight: 700; font-size: 15px; color: #4A7258; background: #E8F0EB; }
.amount-due { background: #2D2D2D; color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; margin-top: 16px; border-radius: 8px; }
.amount-due .label { font-size: 12px; opacity: 0.85; }
.amount-due .value { font-size: 20px; font-weight: 700; color: #D4AA62; }
.section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #E8F0EB; }
.period-badge { display: inline-block; background: #D4AA62; color: white; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-top: 4px; }
.room-label { font-size: 22px; font-weight: 700; color: #4A7258; margin-bottom: 2px; }
.thank-you { text-align: center; padding: 20px; color: #6B6560; font-size: 13px; }
</style>
</head>
<body>
<div class="doc-header">
  <div class="logo">{{building.name}}</div>
  <div class="subtitle">ใบแจ้งหนี้รายเดือน · {{building.address}}</div>
</div>
<div class="doc-body">
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
    <div>
      <div class="room-label">ห้อง {{room.number}}</div>
      <span class="period-badge">{{billing.monthName}} {{billing.year}}</span>
    </div>
    <div style="text-align:right;">
      <div class="info-label">วันที่ออกใบแจ้งหนี้</div>
      <div class="info-value">{{billing.issueDate}}</div>
      <div class="info-label" style="margin-top:8px;">กำหนดชำระ</div>
      <div class="info-value" style="color:#D4AA62;">{{billing.dueDate}}</div>
    </div>
  </div>
  <div class="info-grid">
    <div>
      <div class="info-label">ผู้เช่า</div>
      <div class="info-value">{{tenant.fullName}}</div>
      <div style="font-size:12px; color:#6B6560; margin-top:2px;">{{tenant.phone}}</div>
    </div>
    <div>
      <div class="info-label">อาคาร / ชั้น</div>
      <div class="info-value">{{building.name}} · ชั้น {{room.floorNumber}}</div>
    </div>
  </div>
  <div class="section-title">รายการค่าใช้จ่าย</div>
  <table>
    <thead><tr><th>รายการ</th><th class="right">จำนวน</th></tr></thead>
    <tbody>
      <tr><td>ค่าเช่าห้องพัก · {{billing.monthName}} {{billing.year}}</td><td class="right">{{billing.rentAmount}}</td></tr>
      {{#if billing.waterTotal}}<tr><td>ค่าน้ำ ( {{billing.waterUnits}} หน่วย)</td><td class="right">{{billing.waterTotal}}</td></tr>{{/if}}
      {{#if billing.electricityTotal}}<tr><td>ค่าไฟฟ้า ( {{billing.electricityUnits}} หน่วย)</td><td class="right">{{billing.electricityTotal}}</td></tr>{{/if}}
      {{#if billing.lateFeeAmount}}<tr><td>ค่าปรับชำระเกินกำหนด</td><td class="right">{{billing.lateFeeAmount}}</td></tr>{{/if}}
      {{#each billing.extraCharges}}<tr><td>{{this.description}}</td><td class="right">{{this.amount}}</td></tr>{{/each}}
    </tbody>
  </table>
  <div class="amount-due">
    <div><div class="label">ยอดรวมที่ต้องชำระ</div></div>
    <div class="value">{{billing.total}}</div>
  </div>
  {{#if billing.notes}}<div style="margin-top:16px; padding:12px; background:#FAF8F5; border-radius:6px; font-size:12px; color:#6B6560;"><strong>หมายเหตุ:</strong> {{billing.notes}}</div>{{/if}}
  <div class="thank-you">ขอบคุณที่ใช้บริการ · กรุณาชำระเงินก่อนวันที่ {{billing.dueDate}}<br>หากมีข้อสงสัยติดต่อ {{building.phone}} หรือ {{building.email}}</div>
</div>
<div class="doc-footer">เอกสารนี้สร้างโดยระบบ Apartment ERP · ไม่ต้องพิมพ์ลายเซ็นต์</div>
</body>
</html>`;

const RECEIPT_BODY = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DejaVu Sans', 'Noto Sans Thai', Arial, sans-serif; font-size: 14px; color: #2D2D2D; background: #FAF8F5; }
.doc-header { background: linear-gradient(135deg, #5C8A68 0%, #4A7258 100%); color: white; padding: 28px 36px; }
.doc-header .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
.doc-header .subtitle { font-size: 11px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.04em; }
.doc-body { padding: 28px 36px; background: #FFFFFF; }
.doc-footer { padding: 16px 36px; background: #E8F0EB; border-top: 1px solid #E5E0DA; font-size: 11px; color: #6B6560; text-align: center; }
.info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 3px; }
.info-value { font-size: 14px; font-weight: 600; color: #2D2D2D; }
table { width: 100%; border-collapse: collapse; }
th { background: #E8F0EB; color: #4A7258; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left; font-weight: 600; }
th.right { text-align: right; }
td { padding: 10px 14px; border-bottom: 1px solid #E5E0DA; font-size: 13px; }
td.right { text-align: right; font-variant-numeric: tabular-nums; }
.total-row td { font-weight: 700; font-size: 15px; color: #4A7258; background: #E8F0EB; }
.section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #E8F0EB; }
.receipt-box { max-width: 480px; margin: 0 auto; }
.receipt-title { font-size: 22px; font-weight: 700; text-align: center; color: #4A7258; margin-bottom: 4px; }
.receipt-sub { font-size: 12px; text-align: center; color: #6B6560; margin-bottom: 24px; }
.receipt-number { font-size: 11px; color: #6B6560; text-align: center; margin-bottom: 20px; font-family: monospace; }
.paid-stamp { text-align: center; margin: 20px 0; }
.paid-stamp span { display: inline-block; border: 3px solid #5C8A68; color: #5C8A68; padding: 6px 24px; border-radius: 6px; font-size: 16px; font-weight: 800; letter-spacing: 0.1em; transform: rotate(-5deg); }
.payment-info { background: #E8F0EB; border-radius: 8px; padding: 16px; margin-top: 20px; }
.payment-info .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E0DA; font-size: 13px; }
.payment-info .row:last-child { border-bottom: none; }
.payment-info .label { color: #6B6560; }
.payment-info .value { font-weight: 600; }
</style>
</head>
<body>
<div class="doc-header">
  <div class="logo">{{building.name}}</div>
  <div class="subtitle">ใบเสร็จรับเงิน · {{building.address}}</div>
</div>
<div class="doc-body">
  <div class="receipt-box">
    <div class="receipt-title">ใบเสร็จรับเงิน</div>
    <div class="receipt-sub">RECEIPT</div>
    <div class="receipt-number">เลขที่ {{receipt.number}} · วันที่ {{receipt.date}}</div>
    <div class="paid-stamp"><span>ชำระแล้ว</span></div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
      <div>
        <div class="info-label">ผู้ชำระเงิน</div>
        <div class="info-value">{{tenant.fullName}}</div>
      </div>
      <div>
        <div class="info-label">ห้องพัก</div>
        <div class="info-value">ห้อง {{room.number}} · ชั้น {{room.floorNumber}}</div>
      </div>
    </div>
    <div class="section-title">รายละเอียดการชำระ</div>
    <table>
      <thead><tr><th>รายการ</th><th class="right">จำนวน (บาท)</th></tr></thead>
      <tbody>
        {{#each receipt.items}}<tr><td>{{this.description}}</td><td class="right">{{this.amount}}</td></tr>{{/each}}
        <tr class="total-row"><td>รวมทั้งสิ้น</td><td class="right">{{receipt.total}}</td></tr>
      </tbody>
    </table>
    <div class="payment-info">
      <div class="row"><span class="label">ช่องทางการชำระ</span><span class="value">{{receipt.method}}</span></div>
      <div class="row"><span class="label">วันที่ชำระ</span><span class="value">{{receipt.paidDate}}</span></div>
      {{#if receipt.reference}}<div class="row"><span class="label">อ้างอิง</span><span class="value">{{receipt.reference}}</span></div>{{/if}}
    </div>
  </div>
</div>
<div class="doc-footer">เอกสารนี้สร้างโดยระบบ Apartment ERP · ไม่ต้องพิมพ์ลายเซ็นต์</div>
</body>
</html>`;

const PAYMENT_NOTICE_BODY = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DejaVu Sans', 'Noto Sans Thai', Arial, sans-serif; font-size: 14px; color: #2D2D2D; background: #FAF8F5; }
.doc-header { background: linear-gradient(135deg, #5C8A68 0%, #4A7258 100%); color: white; padding: 28px 36px; }
.doc-header .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
.doc-header .subtitle { font-size: 11px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.04em; }
.doc-body { padding: 28px 36px; background: #FFFFFF; }
.doc-footer { padding: 16px 36px; background: #E8F0EB; border-top: 1px solid #E5E0DA; font-size: 11px; color: #6B6560; text-align: center; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
.info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 3px; }
.info-value { font-size: 14px; font-weight: 600; color: #2D2D2D; }
table { width: 100%; border-collapse: collapse; }
th { background: #E8F0EB; color: #4A7258; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left; font-weight: 600; }
th.right { text-align: right; }
td { padding: 10px 14px; border-bottom: 1px solid #E5E0DA; font-size: 13px; }
td.right { text-align: right; font-variant-numeric: tabular-nums; }
.total-row td { font-weight: 700; font-size: 15px; color: #4A7258; background: #E8F0EB; }
.section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #E8F0EB; }
.notice-title { font-size: 20px; font-weight: 700; text-align: center; color: #2D2D2D; margin-bottom: 6px; }
.notice-sub { font-size: 12px; text-align: center; color: #6B6560; margin-bottom: 24px; }
.urgent-box { background: #FEF3CD; border: 1px solid #E6C84C; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center; }
.urgent-box .text { font-size: 14px; font-weight: 700; color: #856404; }
.due-box { background: #2D2D2D; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
.due-box .overdue { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #FF6B6B; margin-bottom: 6px; }
.due-box .amount { font-size: 28px; font-weight: 700; color: #D4AA62; }
.due-box .due-date { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 6px; }
.how-to-pay { background: #E8F0EB; border-radius: 8px; padding: 16px; margin-top: 20px; }
.how-to-pay .title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 10px; }
.how-to-pay .method { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E0DA; font-size: 13px; }
.how-to-pay .method:last-child { border-bottom: none; }
</style>
</head>
<body>
<div class="doc-header">
  <div class="logo">{{building.name}}</div>
  <div class="subtitle">แจ้งเตือนค่าบริการ · {{building.address}}</div>
</div>
<div class="doc-body">
  <div class="notice-title">แจ้งชำระค่าบริการ</div>
  <div class="notice-sub">PAYMENT NOTICE · {{billing.monthName}} {{billing.year}}</div>
  <div class="info-grid">
    <div><div class="info-label">ผู้เช่า</div><div class="info-value">{{tenant.fullName}}</div></div>
    <div><div class="info-label">ห้องพัก</div><div class="info-value">ห้อง {{room.number}} · ชั้น {{room.floorNumber}}</div></div>
  </div>
  {{#if billing.isOverdue}}<div class="urgent-box"><div class="text">⚠️ ครบกำหนดชำระแล้ว · กรุณาชำระโดยเร็ว</div></div>{{/if}}
  <div class="due-box">
    <div class="overdue">{{#if billing.isOverdue}}เกินกำหนด{{else}}กรุณาชำระภายใน{{/if}}</div>
    <div class="amount">{{billing.total}}</div>
    <div class="due-date">วันที่ {{billing.dueDate}}</div>
  </div>
  <table>
    <thead><tr><th>รายการ</th><th class="right">จำนวน (บาท)</th></tr></thead>
    <tbody>
      <tr><td>ค่าเช่าห้องพัก</td><td class="right">{{billing.rentAmount}}</td></tr>
      {{#if billing.waterTotal}}<tr><td>ค่าน้ำ</td><td class="right">{{billing.waterTotal}}</td></tr>{{/if}}
      {{#if billing.electricityTotal}}<tr><td>ค่าไฟฟ้า</td><td class="right">{{billing.electricityTotal}}</td></tr>{{/if}}
      {{#if billing.lateFeeAmount}}<tr><td>ค่าปรับ</td><td class="right">{{billing.lateFeeAmount}}</td></tr>{{/if}}
      <tr class="total-row"><td>รวมทั้งสิ้น</td><td class="right">{{billing.total}}</td></tr>
    </tbody>
  </table>
  <div class="how-to-pay">
    <div class="title">ช่องทางการชำระเงิน</div>
    {{#each paymentMethods}}<div class="method"><span>{{this.name}}</span><span>{{this.account}}</span></div>{{/each}}
  </div>
  <p style="margin-top:20px; font-size:12px; color:#6B6560; text-align:center;">หากชำระแล้วกรุณาแจ้งทาง LINE หรือติดต่อเจ้าหน้าที่ · {{building.phone}}<br>ขอบคุณที่ให้ความร่วมมือ</p>
</div>
<div class="doc-footer">เอกสารนี้สร้างโดยระบบ Apartment ERP · ไม่ต้องพิมพ์ลายเซ็นต์</div>
</body>
</html>`;

const CONTRACT_BODY = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'DejaVu Sans', 'Noto Sans Thai', Arial, sans-serif; font-size: 14px; color: #2D2D2D; background: #FAF8F5; }
.doc-header { background: linear-gradient(135deg, #5C8A68 0%, #4A7258 100%); color: white; padding: 28px 36px; }
.doc-header .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
.doc-header .subtitle { font-size: 11px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.04em; }
.doc-body { padding: 28px 36px; background: #FFFFFF; }
.doc-footer { padding: 16px 36px; background: #E8F0EB; border-top: 1px solid #E5E0DA; font-size: 11px; color: #6B6560; text-align: center; }
.info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 3px; }
.info-value { font-size: 14px; font-weight: 600; color: #2D2D2D; }
.section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #E8F0EB; }
.contract-title { font-size: 18px; font-weight: 700; text-align: center; color: #4A7258; margin-bottom: 4px; letter-spacing: 0.04em; }
.contract-sub { font-size: 12px; text-align: center; color: #6B6560; margin-bottom: 24px; }
.contract-no { text-align: center; font-size: 12px; color: #6B6560; margin-bottom: 20px; font-family: monospace; background: #FAF8F5; padding: 8px; border-radius: 6px; }
.parties { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: start; margin-bottom: 24px; }
.party-box { background: #E8F0EB; border-radius: 8px; padding: 16px; }
.party-box.right { background: #FAF8F5; }
.party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 8px; }
.party-name { font-size: 15px; font-weight: 700; color: #2D2D2D; margin-bottom: 4px; }
.vs { font-size: 20px; font-weight: 700; color: #5C8A68; align-self: center; padding-top: 40px; }
.terms-table { width: 100%; }
.terms-table td { padding: 10px 14px; border: 1px solid #E5E0DA; font-size: 13px; vertical-align: top; }
.terms-table td:first-child { font-weight: 600; color: #4A7258; background: #E8F0EB; width: 35%; }
.sign-area { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
.sign-box { border-top: 1px solid #2D2D2D; padding-top: 8px; text-align: center; font-size: 12px; color: #6B6560; }
.sign-box .name { font-weight: 600; font-size: 13px; color: #2D2D2D; }
</style>
</head>
<body>
<div class="doc-header">
  <div class="logo">{{building.name}}</div>
  <div class="subtitle">สัญญาเช่าที่พัก · {{building.address}}</div>
</div>
<div class="doc-body">
  <div class="contract-title">สัญญาเช่าที่พักอาศัย</div>
  <div class="contract-sub">RESIDENTIAL LEASE AGREEMENT</div>
  <div class="contract-no">เลขที่สัญญา: {{contract.number}} · วันที่ลงนาม: {{contract.signDate}}</div>
  <div class="parties">
    <div class="party-box">
      <div class="party-label">ผู้ให้เช่า ( Landlord )</div>
      <div class="party-name">{{contract.landlordName}}</div>
      <div style="font-size:12px; color:#6B6560;">{{contract.landlordAddress}}</div>
      <div style="font-size:12px; color:#6B6560; margin-top:4px;">โทร: {{contract.landlordPhone}}</div>
    </div>
    <div class="vs">VS</div>
    <div class="party-box right">
      <div class="party-label">ผู้เช่า ( Tenant )</div>
      <div class="party-name">{{tenant.fullName}}</div>
      <div style="font-size:12px; color:#6B6560;">{{tenant.address}}</div>
      <div style="font-size:12px; color:#6B6560; margin-top:4px;">โทร: {{tenant.phone}}</div>
    </div>
  </div>
  <div class="section-title">รายละเอียดการเช่า</div>
  <table class="terms-table">
    <tr><td>ที่พักอาศัย</td><td>ห้องเลขที่ {{room.number}} ชั้น {{room.floorNumber}} อาคาร {{building.name}}</td></tr>
    <tr><td>ระยะเวลาเช่า</td><td>ตั้งแต่ {{contract.startDate}} ถึง {{contract.endDate}}</td></tr>
    <tr><td>ค่าเช่ารายเดือน</td><td>{{contract.monthlyRent}} บาท ( {{contract.monthlyRentText}} )</td></tr>
    <tr><td>เงินประกัน</td><td>{{contract.deposit}} บาท ( {{contract.depositText}} )</td></tr>
    <tr><td>วันชำระค่าเช่า</td><td>ภายในวันที่ {{contract.rentDueDay}} ของทุกเดือน</td></tr>
    {{#if contract.parkingSpaces}}<tr><td>ที่จอดรถ</td><td>{{contract.parkingSpaces}}</td></tr>{{/if}}
  </table>
  {{#if contract.specialTerms}}<div class="section-title" style="margin-top:20px;">เงื่อนไขพิเศษ</div><p style="font-size:13px; line-height:1.7;">{{contract.specialTerms}}</p>{{/if}}
  <div class="sign-area">
    <div class="sign-box"><div class="name">{{contract.landlordName}}</div><div class="role">ผู้ให้เช่า</div><div style="margin-top:8px;">วันที่: _____________</div></div>
    <div class="sign-box"><div class="name">{{tenant.fullName}}</div><div class="role">ผู้เช่า</div><div style="margin-top:8px;">วันที่: _____________</div></div>
  </div>
</div>
<div class="doc-footer">เอกสารนี้สร้างโดยระบบ Apartment ERP · ไม่ต้องพิมพ์ลายเซ็นต์</div>
</body>
</html>`;

// ─── Templates definition ──────────────────────────────────────────────────────

const TEMPLATES = [
  {
    type: DocumentTemplateType.INVOICE,
    name: 'ใบแจ้งหนี้รายเดือน',
    description: 'ใบแจ้งหนี้ค่าเช่าประจำเดือน — มีรายการค่าเช่า น้ำ ไฟ ค่าปรับ และยอดรวม',
    subject: 'ใบแจ้งหนี้ค่าเช่าห้อง {{room.number}} {{billing.monthName}} {{billing.year}}',
    body: INVOICE_BODY,
  },
  {
    type: DocumentTemplateType.RECEIPT,
    name: 'ใบเสร็จรับเงิน',
    description: 'ใบเสร็จรับเงินค่าเช่า — ยืนยันการชำระเงินเรียบร้อย',
    subject: 'ใบเสร็จรับเงิน ห้อง {{room.number}}',
    body: RECEIPT_BODY,
  },
  {
    type: DocumentTemplateType.PAYMENT_NOTICE,
    name: 'แจ้งชำระค่าบริการ',
    description: 'ใบแจ้งชำระค่าบริการ — ส่งก่อนวันครบกำหนดหรือเมื่อเกินกำหนด',
    subject: 'แจ้งชำระค่าบริการ ห้อง {{room.number}} {{billing.monthName}} {{billing.year}}',
    body: PAYMENT_NOTICE_BODY,
  },
  {
    type: DocumentTemplateType.CONTRACT,
    name: 'สัญญาเช่าที่พัก',
    description: 'สัญญาเช่าที่พักอาศัย — สรุปเงื่อนไขการเช่า ค่าเช่า ระยะเวลา และเงื่อนไขพิเศษ',
    subject: 'สัญญาเช่าที่พักอาศัย ห้อง {{room.number}}',
    body: CONTRACT_BODY,
  },
];

// ─── Seeder function ──────────────────────────────────────────────────────────

export async function seedDocumentTemplates(prisma: PrismaClient) {
  for (const tpl of TEMPLATES) {
    const existing = await prisma.documentTemplate.findFirst({ where: { name: tpl.name } });
    if (existing) {
      console.log(`  Template "${tpl.name}" already exists, skipping.`);
      continue;
    }

    const template = await prisma.documentTemplate.create({
      data: {
        name: tpl.name,
        description: tpl.description,
        type: tpl.type,
        subject: tpl.subject,
        body: tpl.body,
        status: DocumentTemplateStatus.ACTIVE,
      },
    });

    const version = await prisma.documentTemplateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        label: 'Default version',
        subject: tpl.subject,
        body: tpl.body,
        status: DocumentTemplateVersionStatus.ACTIVE,
        fileType: 'html',
        fileName: `${tpl.name.replace(/\s+/g, '_')}_v1.html`,
        activatedAt: new Date(),
      },
    });

    await prisma.documentTemplate.update({
      where: { id: template.id },
      data: { activeVersionId: version.id },
    });

    console.log(`  Created template: "${tpl.name}"`);
  }
}

// ─── CLI runner ───────────────────────────────────────────────────────────────

if (require.main === module) {
  const prisma = new PrismaClient();
  seedDocumentTemplates(prisma)
    .then(() => {
      console.log('Document templates seeded successfully.');
      return prisma.$disconnect();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
