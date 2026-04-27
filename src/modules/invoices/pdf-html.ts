/**
 * Invoice PDF — HTML + Puppeteer renderer.
 *
 * Uses Chromium's native text rendering (via Puppeteer) to produce PDFs with
 * correct Thai OpenType character shaping, diacritic positioning, and zero-width
 * combining-mark handling — none of which pdf-lib can do.
 *
 * The QR code is generated as an inline data-URL (qrcode package works in Node
 * without the canvas native dependency), so it is always embedded correctly.
 */
import * as QRCode from 'qrcode';
import type { InvoicePreviewResponse } from './types';

export interface HtmlInvoiceOptions {
  notes?: string;
  building?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    taxId?: string | null;
  };
  bankAccount?: {
    bankName?: string | null;
    accountNo?: string | null;
    accountName?: string | null;
  };
  promptpayNumber?: string;
  /** Override the hardcoded late-fee/policy rules — pass null to skip the policy box */
  paymentPolicy?: {
    lateFeeFloor1?: string;
    lateFeeRegular?: string;
    payByDay?: string;
    wrongAmountFine?: string;
    cutoffDay8?: string;
    slipRequired?: string;
  } | null;
  /** ระเบียบการพักอาศัย — shown in the Notes section, replacing template notes */
  leaseRules?: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const THAI_MONTHS = [
  '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '-';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yr = dt.getFullYear() + 543;
  return `${dd}/${mm}/${yr}`;
}

function fmtNum(n: number, dec = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function itemLabel(item: { typeName: string; description: string | null }): string {
  return item.description ? `${item.typeName}  –  ${item.description}` : item.typeName;
}

// ── QR code builder ──────────────────────────────────────────────────────────

async function buildQrDataUrl(payload: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payload, { width: 100, margin: 1 });
  } catch {
    return '';
  }
}

// ── HTML template ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Payment policy box ─────────────────────────────────────────────────────────

function _buildPolicyBox(opts: HtmlInvoiceOptions): string {
  const ba = opts.bankAccount;
  const pol = opts.paymentPolicy;

  // Don't render if no bank account info at all
  if (!ba?.bankName && !ba?.accountNo) return '';

  return `
  <div class="policy-section">
    <div class="policy-header">ข้อตกลงการชำระเงิน / Payment Policy</div>
    <div class="policy-body">
      <div class="policy-cols">
        <div class="policy-col">
          <div class="policy-sub-header">ช่องทางการชำระเงิน / Payment Methods</div>
          ${ba?.bankName ? `<div class="policy-row"><span class="policy-label">ธนาคาร / Bank</span><span class="policy-value">${escapeHtml(ba.bankName)}</span></div>` : ''}
          ${ba?.accountNo ? `<div class="policy-row"><span class="policy-label">เลขที่บัญชี / Account No.</span><span class="policy-value">${escapeHtml(ba.accountNo)}</span></div>` : ''}
          ${ba?.accountName ? `<div class="policy-row"><span class="policy-label">ชื่อบัญชี / Account Name</span><span class="policy-value">${escapeHtml(ba.accountName)}</span></div>` : ''}
        </div>
        ${pol ? `
        <div class="policy-col">
          <div class="policy-sub-header">ระเบียบการชำระเงิน / Payment Rules</div>
          ${pol.payByDay ? `<div class="policy-rule">• ${escapeHtml(pol.payByDay)}</div>` : ''}
          ${pol.slipRequired ? `<div class="policy-rule">• ${escapeHtml(pol.slipRequired)}</div>` : ''}
          ${pol.wrongAmountFine ? `<div class="policy-rule">• ${escapeHtml(pol.wrongAmountFine)}</div>` : ''}
          ${pol.cutoffDay8 ? `<div class="policy-rule">• ${escapeHtml(pol.cutoffDay8)}</div>` : ''}
        </div>
        <div class="policy-col">
          <div class="policy-sub-header">อัตราค่าปรับ / Late Fee Schedule</div>
          ${pol.lateFeeFloor1 ? `<div class="policy-rule">• ${escapeHtml(pol.lateFeeFloor1)}</div>` : ''}
          ${pol.lateFeeRegular ? `<div class="policy-rule">• ${escapeHtml(pol.lateFeeRegular)}</div>` : ''}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

// ── Meter panel builder (compact horizontal layout) ──────────────────────────

function buildMeterPanel(
  mr: NonNullable<InvoicePreviewResponse['meterReadings']>,
): string {
  const water = mr.water;
  const electric = mr.electric;

  const fmtMeterRow = (
    label: string,
    detail: NonNullable<typeof water>,
    col: 'l' | 'r',
  ) => {
    const br = col === 'r' ? '<br/>' : '';
    const space = col === 'r' ? '&nbsp;&nbsp;&nbsp;&nbsp;' : '';
    return `
      <tr>
        <td class="meter-label">${space}${label}</td>
        <td class="meter-val">${br}${fmtNum(detail.prev ?? 0, 0)}</td>
        <td class="meter-val">${br}${fmtNum(detail.curr ?? 0, 0)}</td>
        <td class="meter-val">${br}${fmtNum(detail.units, 0)}</td>
        <td class="meter-val">${br}${fmtNum(detail.ratePerUnit, 2)}</td>
        <td class="meter-val">${br}${fmtNum(detail.usageCharge, 2)}</td>
        <td class="meter-val">${br}${fmtNum(detail.serviceFee, 2)}</td>
        <td class="meter-val meter-total">${br}${fmtNum(detail.total, 2)}</td>
      </tr>`;
  };

  const rows: string[] = [];
  if (water) rows.push(fmtMeterRow('มาตรน้ำ / Water', water, 'l'));
  if (electric) rows.push(fmtMeterRow('มาตรไฟ / Electric', electric, 'l'));

  return `
  <table class="meter-table">
    <thead>
      <tr class="meter-head-row">
        <th>รายละเอียดมิเตอร์ / Meter Reading Details</th>
        <th>มิเตอร์ก่อน</th>
        <th>มิเตอร์หลัง</th>
        <th>จำนวนหน่วย</th>
        <th>อัตรา/หน่วย</th>
        <th>ค่าใช้น้ำ/ไฟ</th>
        <th>ค่าบริการ</th>
        <th>รวม (บาท)</th>
      </tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

export async function buildInvoiceHtml(
  preview: InvoicePreviewResponse,
  opts: HtmlInvoiceOptions,
): Promise<{ html: string; qrDataUrl: string }> {
  const bldName = opts.building?.name || 'อพาร์ตเมนต์';
  const bldAddress = opts.building?.address || '';
  const bldPhone = opts.building?.phone || '';
  const bldTaxId = opts.building?.taxId || '';

  const invoiceNumber =
    preview.invoiceNumber ||
    `INV-${preview.year}${String(preview.month).padStart(2, '0')}-${preview.roomNo}`;

  const periodLabel = `${THAI_MONTHS[preview.month] ?? ''} ${preview.year + 543}`;
  const dueDateLabel = fmtDate(preview.dueDate);
  const issuedDateLabel = fmtDate(preview.issuedAt);

  // QR payload
  const period = `${preview.year}-${String(preview.month).padStart(2, '0')}`;
  let qrPayload: string;
  if (opts.promptpayNumber) {
    const { buildPromptPayPayload } = await import('./emv-qr');
    qrPayload = buildPromptPayPayload(opts.promptpayNumber, preview.totalAmount, bldName);
  } else {
    qrPayload = `${bldName}|${preview.roomNo}|${period}|${preview.totalAmount.toFixed(2)}`;
  }
  const qrDataUrl = await buildQrDataUrl(qrPayload);

  // Meter panel (compact horizontal)
  const mr = preview.meterReadings;
  const _meterPanelHtml = (mr?.water || mr?.electric)
    ? buildMeterPanel(mr)
    : '';

  // Line items
  const lineItemsHtml = preview.items.map((item, i) => `
    <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
      <td>${escapeHtml(itemLabel(item))}</td>
      <td class="num">${fmtNum(item.quantity, item.quantity % 1 === 0 ? 0 : 2)}</td>
      <td class="num">${fmtNum(item.unitPrice)}</td>
      <td class="num bold">${fmtNum(item.total)}</td>
    </tr>`).join('');

  // Notes — leaseRules takes priority; otherwise use template notes (max 4 lines)
  let notesHtml = '';
  if (opts.leaseRules && opts.leaseRules.length > 0) {
    notesHtml = `<div class="notes-section">
        <div class="notes-header">ระเบียบการพักอาศัย / House Rules</div>
        <div class="notes-body">${opts.leaseRules.map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>
      </div>`;
  } else {
    const notesLines = (opts.notes ?? '').split('\n').filter(l => l.trim()).slice(0, 4);
    if (notesLines.length > 0) {
      notesHtml = `<div class="notes-section">
        <div class="notes-header">หมายเหตุ / Notes</div>
        <div class="notes-body">${notesLines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>
      </div>`;
    }
  }

  const isPaid = preview.status === 'PAID';
  const paidWatermark = isPaid
    ? `<div class="paid-watermark">ชำระแล้ว / PAID</div>`
    : '';

  const roomLine = [
    `ห้อง ${preview.roomNo}`,
    preview.floorNo ? `ชั้น ${preview.floorNo}` : null,
  ].filter(Boolean).join('  ');

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(invoiceNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" />
  <style>
    /* ── Reset & base ─────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      font-family: 'Sarabun', 'Noto Sans Thai', sans-serif;
      font-size: 17px;
      line-height: 1.3;
      color: #1a1a1a;
      background: #fff;
    }

    /* ── A4 page ──────────────────────────────────────────────── */
    @page { size: A4 portrait; margin: 0; }
    body { width: 210mm; min-height: 297mm; overflow: hidden; position: relative; }

    /* ── Header bar ─────────────────────────────────────────── */
    .header {
      background: #1c3860;
      color: #fff;
      padding: 12px 40px 10px;
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 3px;
      background: #f29d21;
    }
    .header-left .header-name { font-size: 18px; font-weight: 700; }
    .header-left .header-sub { font-size: 11px; color: #c8d4ee; margin-top: 3px; }
    .header-title-main { font-size: 26px; font-weight: 700; color: #f29d21; text-align: right; line-height: 1.1; }
    .header-title-sub { font-size: 11px; color: #c8d4ee; text-align: right; }

    /* ── Meta block ─────────────────────────────────────────── */
    .meta {
      display: flex;
      justify-content: space-between;
      padding: 10px 40px 8px;
      gap: 24px;
    }
    .bill-to .label { font-size: 12px; color: #888; }
    .bill-to .name { font-size: 17px; font-weight: 700; color: #1c3860; margin-top: 2px; }
    .bill-to .detail { font-size: 14px; color: #444; margin-top: 1px; }
    .bill-to .phone { font-size: 13px; color: #777; margin-top: 1px; }

    .invoice-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid #ccc;
      overflow: hidden;
      align-self: flex-start;
      min-width: 240px;
    }
    .inv-cell { padding: 5px 9px; font-size: 12px; }
    .inv-row:nth-child(odd) .inv-cell { background: #f0f0f2; }
    .inv-cell:first-child { color: #666; }
    .inv-cell:last-child { font-weight: 700; color: #1c3860; text-align: right; }

    /* ── Divider ─────────────────────────────────────────────── */
    .divider { border: none; border-top: 1px solid #1c3860; margin: 0 40px; }

    /* ── Table ──────────────────────────────────────────────── */
    .table-section { padding: 8px 40px 0; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: #1c3860; color: #fff; font-size: 13px; font-weight: 700;
      padding: 6px 10px; text-align: left;
    }
    thead th:not(:first-child) { text-align: right; }
    tbody td { padding: 6px 10px; font-size: 13px; border-bottom: 0.5px solid #e0e0e8; }
    tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td.bold { font-weight: 700; }
    .row-even td { background: #fff; }
    .row-odd td { background: #f4f5fb; }

    /* ── Total + QR row ────────────────────────────────────── */
    .bottom-row {
      display: flex;
      justify-content: flex-end;
      align-items: stretch;
      padding: 10px 40px 0;
      gap: 0;
    }
    .total-label { font-size: 13px; color: #f29d21; font-weight: 700; }
    .total-amount { font-size: 30px; font-weight: 700; line-height: 1; }

    /* ── QR ─────────────────────────────────────────────── */
    .qr-box { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; }
    .qr-box img { width: 110px; height: 110px; display: block; }
    .qr-label { font-size: 11px; color: #888; }
    .qr-amount { font-size: 13px; font-weight: 700; color: #1c3860; }

    /* ── Bank Transfer Box ────────────────────────────────── */
    .transfer-box {
      background: #f8fafc;
      border: 1.5px solid #1c3860;
      border-right: none;
      border-radius: 8px 0 0 8px;
      padding: 10px 16px;
      flex: 1;
    }
    .total-box {
      background: #1c3860; color: #fff;
      border-radius: 0 8px 8px 0;
      border: 1.5px solid #1c3860;
      padding: 12px 20px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      min-width: 200px;
      text-align: center;
    }
    .transfer-header { font-size: 13px; font-weight: 700; color: #1c3860; margin-bottom: 6px; }
    .transfer-row { display: flex; gap: 10px; font-size: 14px; line-height: 1.6; }
    .transfer-label { color: #555; white-space: nowrap; min-width: 70px; }
    .transfer-value { color: #1c3860; font-weight: 700; }
    .transfer-note { font-size: 12px; color: #888; margin-top: 6px; font-style: italic; }

    /* ── Meter panel ─────────────────────────────────────────── */
    .meter-section { padding: 6px 40px 0; }

    /* ── Payment Policy ──────────────────────────────────────── */
    .policy-section { padding: 8px 40px 0; }
    .policy-header {
      font-size: 11px; font-weight: 700; color: #1c3860;
      border-bottom: 1.5px solid #f29d21; padding-bottom: 2px; margin-bottom: 4px;
    }
    .policy-body { display: flex; gap: 12px; }
    .policy-cols { display: flex; gap: 16px; width: 100%; }
    .policy-col { flex: 1; }
    .policy-sub-header {
      font-size: 10px; font-weight: 700; color: #666; margin-bottom: 3px;
    }
    .policy-row { display: flex; gap: 4px; font-size: 11px; margin-bottom: 2px; }
    .policy-label { color: #666; white-space: nowrap; }
    .policy-value { color: #222; font-weight: 600; }
    .policy-rule { font-size: 11px; color: #444; margin-bottom: 3px; line-height: 1.5; }
    .policy-rule strong { color: #1c3860; }
    .meter-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #d0d0e0;
    }
    .meter-head-row th {
      background: #e8ecf5;
      color: #1c3860;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 6px;
      text-align: left;
      border-bottom: 1px solid #d0d0e0;
    }
    .meter-head-row th:not(:first-child) { text-align: right; }
    .meter-label {
      font-size: 10px; color: #555; padding: 2px 6px; text-align: left;
      border-right: 1px solid #e0e0e8;
    }
    .meter-val {
      font-size: 10px; color: #333; padding: 2px 6px; text-align: right;
      border-right: 1px solid #e0e0e8;
    }
    .meter-val:last-child { border-right: none; }
    .meter-total { font-weight: 700; color: #1c3860; }
    tbody tr:nth-child(odd) td { background: #fafafa; }

    /* ── Notes ─────────────────────────────────────────────── */
    .notes-section { padding: 14px 40px 0; }
    .notes-header { font-size: 13px; font-weight: 700; color: #888; margin-bottom: 6px; }
    .notes-body { font-size: 14px; color: #444; line-height: 1.7; }
    .notes-body p { margin-bottom: 5px; }

    /* ── Footer ─────────────────────────────────────────────── */
    .footer {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: #1c3860;
    }
    .footer::before {
      content: ''; display: block; height: 2px; background: #f29d21;
    }
    .footer-inner {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 40px;
    }
    .footer-text { font-size: 11px; color: #c8d4ee; }
    .footer-id { font-size: 10px; color: #7a8ab0; }

    /* ── PAID watermark ────────────────────────────────────── */
    .paid-watermark {
      position: absolute; bottom: 50px; right: 50px;
      font-size: 42px; font-weight: 700; color: rgba(30, 120, 50, 0.16);
      transform: rotate(-20deg); pointer-events: none; white-space: nowrap;
    }
  </style>
</head>
<body>

${paidWatermark}

<!-- Header -->
<div class="header">
  <div class="header-left">
    <div class="header-name">${escapeHtml(bldName)}</div>
    ${bldAddress || bldPhone ? `<div class="header-sub">${[bldAddress, bldPhone ? `โทร. ${bldPhone}` : ''].filter(Boolean).join('  |  ')}</div>` : ''}
    ${bldTaxId ? `<div class="header-sub">เลขประจำตัวผู้เสียภาษี: ${escapeHtml(bldTaxId)}</div>` : ''}
  </div>
  <div>
    <div class="header-title-main">ใบแจ้งหนี้</div>
    <div class="header-title-sub">INVOICE</div>
  </div>
</div>

<!-- Meta -->
<div class="meta">
  <div class="bill-to">
    <div class="label">เรียนเก็บจาก / Bill To</div>
    <div class="name">${escapeHtml(preview.tenantName || '(ไม่มีผู้เช่า)')}</div>
    <div class="detail">${escapeHtml(roomLine)}</div>
    ${preview.tenantPhone ? `<div class="phone">โทร. ${escapeHtml(preview.tenantPhone)}</div>` : ''}
  </div>
  <div class="invoice-info">
    <div class="inv-row"><div class="inv-cell">เลขที่ใบแจ้งหนี้</div><div class="inv-cell">${escapeHtml(invoiceNumber)}</div></div>
    <div class="inv-row"><div class="inv-cell">วันที่ออก / Issue Date</div><div class="inv-cell">${issuedDateLabel}</div></div>
    <div class="inv-row"><div class="inv-cell">ครบกำหนด / Due Date</div><div class="inv-cell">${dueDateLabel}</div></div>
    <div class="inv-row"><div class="inv-cell">งวด / Period</div><div class="inv-cell">${periodLabel}</div></div>
  </div>
</div>

<hr class="divider" />

<!-- Line items -->
<div class="table-section">
  <table>
    <thead>
      <tr>
        <th>รายการ</th>
        <th class="num">หน่วย</th>
        <th class="num">ราคา/หน่วย (บาท)</th>
        <th class="num">จำนวนเงิน (บาท)</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}
    </tbody>
  </table>
</div>

<!-- Total + QR + Bank Transfer -->
<div class="bottom-row">
  ${opts.promptpayNumber && qrDataUrl ? `
  <div class="qr-box">
    <img src="${qrDataUrl}" alt="QR Code" />
    <div class="qr-label">สแกนชำระ / Scan to Pay</div>
    <div class="qr-amount">฿${preview.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
  </div>` : ''}

  ${(opts.bankAccount?.bankName || opts.bankAccount?.accountNo) ? `
  <div class="transfer-box">
    <div class="transfer-header">ชำระด้วยการโอน / Bank Transfer</div>
    ${opts.bankAccount.bankName ? `<div class="transfer-row"><span class="transfer-label">ธนาคาร</span><span class="transfer-value">${escapeHtml(opts.bankAccount.bankName)}</span></div>` : ''}
    ${opts.bankAccount.accountNo ? `<div class="transfer-row"><span class="transfer-label">เลขที่บัญชี</span><span class="transfer-value">${escapeHtml(opts.bankAccount.accountNo)}</span></div>` : ''}
    ${opts.bankAccount.accountName ? `<div class="transfer-row"><span class="transfer-label">ชื่อบัญชี</span><span class="transfer-value">${escapeHtml(opts.bankAccount.accountName)}</span></div>` : ''}
    ${!opts.promptpayNumber ? `<div class="transfer-note">• กรุณาวางบัญชีนี้ในแอปธนาคารเพื่อชำระเงิน</div>` : ''}
  </div>` : ''}

  <div class="total-box">
    <span class="total-label">รวมทั้งสิ้น / TOTAL</span>
    <span class="total-amount">฿${fmtNum(preview.totalAmount)}</span>
  </div>
</div>

<!-- Notes -->
${notesHtml}

<!-- Footer -->
<div class="footer">
  <div class="footer-inner">
    <span class="footer-text">ขอบคุณที่ไว้วางใจในบริการของเรา  •  Thank you for your business</span>
    <span class="footer-id">ID: ${preview.invoiceId.slice(-12).toUpperCase()}</span>
  </div>
</div>

</body>
</html>`;

  return { html, qrDataUrl };
}
