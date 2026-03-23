/**
 * Invoice PDF — Professional template
 *
 * Layout (A4 portrait):
 *   ┌──────────────────────────────────────────────────────┐
 *   │  NAVY HEADER BAR  │  Property name + "ใบแจ้งหนี้"   │
 *   │  Amber accent stripe (4 pt)                          │
 *   ├──────────────────┬───────────────────────────────────┤
 *   │  Bill To         │  Invoice # / Date / Due / Period  │
 *   ├──────────────────┴───────────────────────────────────┤
 *   │  [NAVY]  รายการ │ หน่วย │ ราคา/หน่วย │ จำนวนเงิน   │
 *   │  ...rows (alternating white / light-blue) ...        │
 *   │                             ┌─────────────────────┐  │
 *   │                             │ NAVY  รวมทั้งสิ้น   │  │
 *   │                             └─────────────────────┘  │
 *   ├──────────────────────────────────────────────────────┤
 *   │  หมายเหตุ / Notes  (from DocumentTemplate)           │
 *   ├──────────────────────────────────────────────────────┤
 *   │  NAVY FOOTER BAR  │  thank-you + invoice ID          │
 *   └──────────────────────────────────────────────────────┘
 *
 * Thai-safe: all text uses embedded Sarabun TTF (Google OFL).
 * NEVER use pdf-lib StandardFonts — WinAnsi caps at U+00FF and crashes on Thai.
 */
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import type { InvoicePreviewResponse } from './types';
import { PDF_CONFIG } from './pdf-config';

export interface InvoicePdfOptions {
  /** Free-text appended as Notes / Terms section (from DocumentTemplate.body). */
  notes?: string;
  /** ID of the DocumentTemplate that provided the notes. */
  templateId?: string;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY   = rgb(0.11, 0.22, 0.37);   // #1c3860
const AMBER  = rgb(0.95, 0.62, 0.13);   // #f29d21
const WHITE  = rgb(1.00, 1.00, 1.00);
const BLACK  = rgb(0.10, 0.10, 0.10);
const GRAY   = rgb(0.45, 0.45, 0.45);
const LTGRAY = rgb(0.94, 0.94, 0.96);
const ROALT  = rgb(0.96, 0.97, 1.00);   // alternating row
const BORDER = rgb(0.80, 0.80, 0.88);
const LTNAVY = rgb(0.72, 0.76, 0.88);   // light text on navy

// ── Page constants ────────────────────────────────────────────────────────────
const W  = PDF_CONFIG.page.width;   // 595.28
const H  = PDF_CONFIG.page.height;  // 841.89
const ML = 45;                      // margin left
const MR = 550;                     // margin right

// ── Thai helpers ──────────────────────────────────────────────────────────────
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
  const yr = dt.getFullYear() + 543; // พ.ศ.
  return `${dd}/${mm}/${yr}`;
}

function fmtPeriod(year: number, month: number): string {
  return `${THAI_MONTHS[month] ?? ''} ${year + 543}`;
}

function fmtNum(n: number, dec = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtCurrency(n: number): string {
  return fmtNum(n) + ' บาท';
}

function itemLabel(item: { typeName: string; description: string | null }): string {
  return item.description ? `${item.typeName}  –  ${item.description}` : item.typeName;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateInvoicePdf(
  preview: InvoicePreviewResponse,
  opts?: InvoicePdfOptions,
): Promise<Uint8Array> {
  // ── Setup ──────────────────────────────────────────────────────────────────
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(PDF_CONFIG.fontPaths.regular()));
  const bold = await doc.embedFont(readFileSync(PDF_CONFIG.fontPaths.bold()));
  const page = doc.addPage([W, H]);

  // ── Drawing helpers ────────────────────────────────────────────────────────
  type Color = ReturnType<typeof rgb>;

  /** Draw filled rectangle.  y = bottom-left corner (pdf-lib convention). */
  const fillRect = (x: number, yBot: number, w: number, h: number, color: Color) =>
    page.drawRectangle({ x, y: yBot, width: w, height: h, color });

  /** Draw text.  y = baseline (pdf-lib convention). */
  const drawText = (
    text: string,
    x: number,
    yBase: number,
    size: number,
    isBold = false,
    color: Color = BLACK,
  ) => page.drawText(text, { x, y: yBase, size, font: isBold ? bold : font, color });

  /** Draw text right-aligned so its right edge is at xRight. */
  const drawRight = (
    text: string,
    xRight: number,
    yBase: number,
    size: number,
    isBold = false,
    color: Color = BLACK,
  ) => {
    const f = isBold ? bold : font;
    const w2 = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: xRight - w2, y: yBase, size, font: f, color });
  };

  /** Draw horizontal rule. */
  const hline = (y: number, x1 = ML, x2 = MR, color: Color = BORDER, t = 0.5) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color });

  // ── 1. HEADER BAR ─────────────────────────────────────────────────────────
  //
  //   y coord: pdf-lib origin is BOTTOM-LEFT.
  //   Header rect spans from H-80 (bottom) to H (top of page).
  //
  const HDR_H = 80;
  const HDR_BOT = H - HDR_H; // = 761.89

  fillRect(0, HDR_BOT, W, HDR_H, NAVY);

  // Left: property name
  drawText('Apartment ERP', ML, HDR_BOT + 50, 18, true, WHITE);
  drawText('ระบบจัดการอพาร์ตเมนต์', ML, HDR_BOT + 31, 9, false, LTNAVY);

  // Right: invoice title (right-aligned to MR)
  drawRight('ใบแจ้งหนี้', MR, HDR_BOT + 54, 24, true, AMBER);
  drawRight('INVOICE', MR, HDR_BOT + 31, 11, false, rgb(0.75, 0.86, 1.0));

  // Amber accent stripe below header
  const STRIPE_H = 4;
  fillRect(0, HDR_BOT - STRIPE_H, W, STRIPE_H, AMBER);

  // ── 2. META BLOCK: Bill-To (left) + Invoice Info (right) ──────────────────
  //
  //   Content area starts at: HDR_BOT - STRIPE_H = 761.89 - 4 = 757.89
  //   We call this META_TOP.
  //
  const META_TOP = HDR_BOT - STRIPE_H; // 757.89
  const META_PAD = 18;

  // ── Left: Bill To ──────────────────────────────────────────────────────────
  const BT_X = ML;
  drawText('เรียนเก็บจาก / Bill To', BT_X, META_TOP - META_PAD - 9, 8, false, GRAY);
  drawText(
    preview.tenantName || '(ไม่มีผู้เช่า)',
    BT_X, META_TOP - META_PAD - 24, 13, true, NAVY,
  );

  const roomLine = [
    `ห้อง ${preview.roomNo}`,
    preview.floorNo ? `ชั้น ${preview.floorNo}` : null,
  ].filter(Boolean).join('  ');
  drawText(roomLine, BT_X, META_TOP - META_PAD - 41, 11, false, BLACK);

  if (preview.tenantPhone) {
    drawText(`โทร. ${preview.tenantPhone}`, BT_X, META_TOP - META_PAD - 56, 9, false, GRAY);
  }

  // ── Right: Invoice detail rows ─────────────────────────────────────────────
  const DR_X = 300;           // left edge of right column
  const DR_ROW_H = 19;        // height of each detail row

  const invoiceNum =
    preview.invoiceNumber ||
    `INV-${preview.year}${String(preview.month).padStart(2, '0')}-${preview.roomNo}`;

  const detailRows: [string, string][] = [
    ['เลขที่ใบแจ้งหนี้', invoiceNum],
    ['วันที่ออก / Issue Date', fmtDate(preview.issuedAt)],
    ['ครบกำหนด / Due Date', fmtDate(preview.dueDate)],
    ['งวด / Period', fmtPeriod(preview.year, preview.month)],
  ];

  const DR_TOP = META_TOP - META_PAD; // top of first row = 757.89 - 18 = 739.89

  for (let i = 0; i < detailRows.length; i++) {
    const [label, val] = detailRows[i];
    const rowBot = DR_TOP - (i + 1) * DR_ROW_H; // bottom-left of this row's rect
    const bg = i % 2 === 0 ? LTGRAY : WHITE;
    fillRect(DR_X, rowBot, MR - DR_X, DR_ROW_H, bg);
    // Label (left)
    drawText(label, DR_X + 6, rowBot + 6, 8, false, GRAY);
    // Value (right-aligned)
    drawRight(val, MR - 6, rowBot + 6, 9, true, NAVY);
    // Row separator
    hline(rowBot, DR_X, MR, BORDER, 0.35);
  }

  // Bottom border of detail box
  const DR_BOT = DR_TOP - detailRows.length * DR_ROW_H;
  hline(DR_BOT, DR_X, MR, NAVY, 0.75);

  // ── Divider between meta and table ─────────────────────────────────────────
  const DIVIDER_Y = META_TOP - 97; // safely below both columns
  hline(DIVIDER_Y, ML, MR, NAVY, 1);

  // ── 3. LINE-ITEM TABLE ─────────────────────────────────────────────────────
  let curY = DIVIDER_Y - 8; // start below divider

  // Column right-edge positions (items are right-aligned within their columns)
  const C_NAME_L  = ML + 5;          // item name: left-aligned
  const C_QTY_R   = 335;             // หน่วย: right edge
  const C_PRICE_R = 455;             // ราคา/หน่วย: right edge
  const C_TOTAL_R = MR - 5;         // จำนวนเงิน: right edge

  // ── Table header row ───────────────────────────────────────────────────────
  const TH_H = 23;
  fillRect(ML, curY - TH_H, MR - ML, TH_H, NAVY);
  drawText('รายการ',              C_NAME_L,         curY - 16, 9.5, true, WHITE);
  drawRight('หน่วย',              C_QTY_R,          curY - 16, 9.5, true, WHITE);
  drawRight('ราคา/หน่วย (บาท)',  C_PRICE_R,        curY - 16, 9.5, true, WHITE);
  drawRight('จำนวนเงิน (บาท)',   C_TOTAL_R,        curY - 16, 9.5, true, WHITE);
  curY -= TH_H;

  // ── Table body rows ────────────────────────────────────────────────────────
  const ROW_H = 18;
  let ri = 0;

  for (const item of preview.items) {
    if (curY < 130) {
      // Overflow guard — future: add second page
      break;
    }

    const bg = ri % 2 === 0 ? WHITE : ROALT;
    fillRect(ML, curY - ROW_H, MR - ML, ROW_H, bg);
    hline(curY - ROW_H, ML, MR, BORDER, 0.3);

    drawText(itemLabel(item), C_NAME_L, curY - 13, 9.5, false, BLACK);

    const qtyDec = item.quantity % 1 === 0 ? 0 : 2;
    drawRight(fmtNum(item.quantity, qtyDec), C_QTY_R,   curY - 13, 9.5, false, BLACK);
    drawRight(fmtNum(item.unitPrice),        C_PRICE_R, curY - 13, 9.5, false, BLACK);
    drawRight(fmtNum(item.total),            C_TOTAL_R, curY - 13, 9.5, true,  BLACK);

    curY -= ROW_H;
    ri++;
  }

  // Bottom border of table body
  hline(curY, ML, MR, NAVY, 0.75);
  curY -= 8;

  // ── 4. METER READING DETAILS ──────────────────────────────────────────────
  const mr = preview.meterReadings;
  if (mr?.water || mr?.electric) {
    const MR_PAD   = 8;
    const COL_MID  = (ML + MR) / 2 + 5; // split point ~302
    const COL_L_R  = COL_MID - 10;       // right edge of left column values
    const COL_R_L  = COL_MID + 6;        // left  edge of right column labels
    const COL_R_R  = MR - 5;             // right edge of right column values

    // Section header bar
    const METER_ROWS = [
      mr?.water    ? 6 : 0,  // water: 6 data rows
      mr?.electric ? 6 : 0,  // electric: 6 data rows
    ];
    const METER_TITLE_H = 18;
    const METER_ROW_H   = 15;
    const hasBoth = mr?.water && mr?.electric;
    const METER_DATA_H  = Math.max(
      mr?.water    ? METER_ROWS[0] * METER_ROW_H : 0,
      mr?.electric ? METER_ROWS[1] * METER_ROW_H : 0,
    );
    const METER_TOTAL_H = METER_TITLE_H + MR_PAD + METER_DATA_H + MR_PAD + 6;

    // Background panel
    fillRect(ML, curY - METER_TOTAL_H, MR - ML, METER_TOTAL_H, rgb(0.96, 0.97, 1.0));
    hline(curY,                    ML, MR, BORDER, 0.4);
    hline(curY - METER_TOTAL_H,    ML, MR, BORDER, 0.4);

    // Title
    fillRect(ML, curY - METER_TITLE_H, MR - ML, METER_TITLE_H, rgb(0.88, 0.91, 0.97));
    drawText('รายละเอียดมิเตอร์ / Meter Reading Details',
      ML + 8, curY - 13, 9, true, NAVY);

    let dataY = curY - METER_TITLE_H - MR_PAD;

    // Helper: draw one meter column
    const drawMeterCol = (
      label: string,
      detail: import('./types').MeterReadingDetail,
      labelX: number,
      valueRightX: number,
    ) => {
      // Column title (e.g. "💧 มาตรน้ำ / Water")
      drawText(label, labelX, dataY, 8.5, true, NAVY);

      const mRows: [string, string][] = [
        ['มิเตอร์ก่อน (หน่วย)', detail.prev != null ? fmtNum(detail.prev, 2) : 'ไม่ระบุ'],
        ['มิเตอร์หลัง (หน่วย)', detail.curr != null ? fmtNum(detail.curr, 2) : 'ไม่ระบุ'],
        ['จำนวนหน่วย',          fmtNum(detail.units, 2)],
        ['อัตรา/หน่วย (บาท)',   fmtNum(detail.ratePerUnit, 4)],
        ['ค่าบริการ (บาท)',      fmtNum(detail.serviceFee, 2)],
        ['รวม (บาท)',            fmtNum(detail.total, 2)],
      ];

      let rowY = dataY - METER_ROW_H;
      for (const [lbl, val] of mRows) {
        const isTotal = lbl.startsWith('รวม');
        drawText(lbl, labelX, rowY, isTotal ? 8.5 : 8, isTotal, isTotal ? NAVY : GRAY);
        drawRight(val, valueRightX, rowY, isTotal ? 8.5 : 8, isTotal, isTotal ? NAVY : BLACK);
        rowY -= METER_ROW_H;
      }
    };

    if (hasBoth) {
      // Vertical divider between columns
      page.drawLine({
        start: { x: COL_MID, y: curY - METER_TOTAL_H + 4 },
        end:   { x: COL_MID, y: curY - METER_TITLE_H - 2 },
        thickness: 0.4,
        color: BORDER,
      });
      if (mr.water)    drawMeterCol('มาตรน้ำ / Water',    mr.water,    ML + 8, COL_L_R);
      if (mr.electric) drawMeterCol('มาตรไฟ / Electric',  mr.electric, COL_R_L, COL_R_R);
    } else if (mr.water) {
      drawMeterCol('มาตรน้ำ / Water', mr.water, ML + 8, COL_R_R);
    } else if (mr.electric) {
      drawMeterCol('มาตรไฟ / Electric', mr.electric, ML + 8, COL_R_R);
    }

    curY -= METER_TOTAL_H + 10;
  }

  // ── 6. TOTAL BOX ──────────────────────────────────────────────────────────
  const TOT_W = 255;
  const TOT_H = 40;
  const TOT_X = MR - TOT_W;

  fillRect(TOT_X, curY - TOT_H, TOT_W, TOT_H, NAVY);
  // Label
  drawText('รวมทั้งสิ้น / TOTAL', TOT_X + 10, curY - 12, 9.5, true, AMBER);
  // Amount (right-aligned, white, larger)
  drawRight(fmtCurrency(preview.totalAmount), MR - 8, curY - 30, 15, true, WHITE);

  curY -= TOT_H + 22;

  // ── 7. PAID WATERMARK ─────────────────────────────────────────────────────
  if (preview.status === 'PAID') {
    // Rotated "PAID" stamp — draw as angled text block in lower-right area
    page.drawText('PAID', {
      x: 370,
      y: curY + 10,
      size: 52,
      font: bold,
      color: rgb(0.15, 0.60, 0.25),
      opacity: 0.14,
      rotate: degrees(-25),
    });
  }

  // ── 8. NOTES / TERMS (from DocumentTemplate) ──────────────────────────────
  if (opts?.notes) {
    hline(curY, ML, MR, BORDER);
    curY -= 14;
    drawText('หมายเหตุ / Notes', ML, curY, 9, true, GRAY);
    curY -= 13;

    const MAX = 60; // chars per line (Thai-safe at 9pt Sarabun)
    for (const rawLine of opts.notes.split('\n')) {
      if (curY < 42) break;
      if (!rawLine.trim()) { curY -= 6; continue; }
      let rem = rawLine;
      while (rem.length > 0) {
        if (curY < 42) break;
        const chunk = rem.slice(0, MAX);
        rem = rem.slice(MAX);
        drawText(chunk, ML, curY, 9, false, GRAY);
        curY -= 12;
      }
    }
  }

  // ── 9. FOOTER BAR ─────────────────────────────────────────────────────────
  fillRect(0, 0,  W, 30, NAVY);
  fillRect(0, 30, W, 3,  AMBER); // amber line above footer

  drawText(
    'ขอบคุณที่ไว้วางใจในบริการของเรา  •  Thank you for your business',
    ML, 10, 8, false, LTNAVY,
  );

  // Tiny invoice ID on right
  drawRight(
    `ID: ${preview.invoiceId.slice(-12).toUpperCase()}`,
    MR, 10, 7, false, rgb(0.50, 0.55, 0.65),
  );

  return doc.save();
}
