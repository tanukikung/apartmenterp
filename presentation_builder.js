/**
 * Apartment ERP Presentation Builder
 * Generates a polished PPTX using pptxgenjs
 *
 * Mock data is stored in the `MOCK` constant at the bottom.
 * Delete the MOCK section when connecting to real data.
 */

const pptxgen = require('pptxgenjs');

// ── Colors (from template) ──────────────────────────────────────────────────
const C = {
  darkBlue:   '1A3760',   // primary brand
  midBlue:    '2C5F8A',   // secondary
  lightBlue:  '4A90C4',   // accent
  veryLight:  'D6E8F7',   // background tint
  gold:       'C9A84C',   // highlight / KPI accent
  white:      'FFFFFF',
  offWhite:   'F5F8FB',
  darkText:   '1A2530',
  midText:    '4A5568',
  lightText:  '718096',
  green:      '2E7D4A',
  red:        'C0392B',
  orange:     'D97706',
  gridLine:   'E2E8F0',
};

// ── Helper factories ─────────────────────────────────────────────────────────
function titleSlide(deck) {
  const slide = deck.addSlide();
  slide.background = { color: C.darkBlue };

  // Top band
  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 0.7,
    fill: { color: C.gold },
    line: { color: C.gold },
  });

  slide.addText('CHULA ENGINEERING', {
    x: 0.4, y: 0.12, w: 9.2, h: 0.45,
    fontSize: 14, bold: true, color: C.darkBlue, align: 'right',
  });

  // Main title
  slide.addText('ระบบจัดการข้อมูลห้องเช่าอัตโนมัติ', {
    x: 0.5, y: 1.7, w: 9, h: 1.1,
    fontSize: 38, bold: true, color: C.white, align: 'center',
  });

  slide.addText('Apartment Management ERP System', {
    x: 0.5, y: 2.85, w: 9, h: 0.55,
    fontSize: 18, color: C.veryLight, align: 'center',
  });

  // Divider line
  slide.addShape('line', {
    x: 3.5, y: 3.55, w: 3, h: 0,
    line: { color: C.gold, width: 2 },
  });

  slide.addText('นายณัฐวีร์ นันทกอบกุล', {
    x: 0.5, y: 3.8, w: 9, h: 0.5,
    fontSize: 20, bold: true, color: C.white, align: 'center',
  });

  slide.addText('ภาควิชาวิศวกรรมอุตสาหการ คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย', {
    x: 0.5, y: 4.35, w: 9, h: 0.45,
    fontSize: 14, color: C.veryLight, align: 'center',
  });

  // Bottom bar
  slide.addShape('rect', {
    x: 0, y: 5.2, w: 10, h: 0.4,
    fill: { color: C.midBlue },
    line: { color: C.midBlue },
  });

  slide.addText('Automatic Apartment Data Management System', {
    x: 0.5, y: 5.22, w: 9, h: 0.35,
    fontSize: 11, color: C.veryLight, align: 'center',
  });

  return slide;
}

function sectionSlide(deck, number, titleTH, titleEN) {
  const slide = deck.addSlide();
  slide.background = { color: C.midBlue };

  // Number badge
  slide.addShape('ellipse', {
    x: 0.5, y: 1.8, w: 1.1, h: 1.1,
    fill: { color: C.gold },
    line: { color: C.gold },
  });
  slide.addText(String(number), {
    x: 0.5, y: 1.85, w: 1.1, h: 1.1,
    fontSize: 32, bold: true, color: C.darkBlue, align: 'center', valign: 'middle',
  });

  // Title
  slide.addText(titleTH, {
    x: 1.9, y: 1.85, w: 7.6, h: 0.7,
    fontSize: 32, bold: true, color: C.white,
  });
  slide.addText(titleEN, {
    x: 1.9, y: 2.55, w: 7.6, h: 0.45,
    fontSize: 16, color: C.veryLight,
  });

  // Bottom line
  slide.addShape('line', {
    x: 1.9, y: 3.15, w: 7.6, h: 0,
    line: { color: C.gold, width: 2 },
  });

  return slide;
}

function contentSlide(deck, title, bullets, options = {}) {
  const slide = deck.addSlide();
  slide.background = { color: C.offWhite };

  // Header bar
  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.darkBlue },
    line: { color: C.darkBlue },
  });

  slide.addText(title, {
    x: 0.4, y: 0.12, w: 9.2, h: 0.62,
    fontSize: 20, bold: true, color: C.white, valign: 'middle',
  });

  // Content area
  const startY = options.startY || 1.15;
  const maxItems = options.maxItems || 6;

  bullets.slice(0, maxItems).forEach((b, i) => {
    const y = startY + i * 0.68;

    // Bullet circle
    slide.addShape('ellipse', {
      x: 0.45, y: y + 0.1, w: 0.22, h: 0.22,
      fill: { color: C.gold },
      line: { color: C.gold },
    });

    slide.addText(b, {
      x: 0.85, y: y, w: 8.7, h: 0.6,
      fontSize: 15, color: C.darkText, valign: 'top',
    });
  });

  return slide;
}

function twoColSlide(deck, title, leftTitle, leftItems, rightTitle, rightItems) {
  const slide = deck.addSlide();
  slide.background = { color: C.offWhite };

  // Header
  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.darkBlue },
    line: { color: C.darkBlue },
  });
  slide.addText(title, {
    x: 0.4, y: 0.12, w: 9.2, h: 0.62,
    fontSize: 20, bold: true, color: C.white, valign: 'middle',
  });

  // Left column header
  slide.addShape('rect', {
    x: 0.35, y: 1.05, w: 4.3, h: 0.5,
    fill: { color: C.midBlue },
    line: { color: C.midBlue },
  });
  slide.addText(leftTitle, {
    x: 0.35, y: 1.05, w: 4.3, h: 0.5,
    fontSize: 14, bold: true, color: C.white, align: 'center', valign: 'middle',
  });

  // Right column header
  slide.addShape('rect', {
    x: 5.35, y: 1.05, w: 4.3, h: 0.5,
    fill: { color: C.gold },
    line: { color: C.gold },
  });
  slide.addText(rightTitle, {
    x: 5.35, y: 1.05, w: 4.3, h: 0.5,
    fontSize: 14, bold: true, color: C.darkBlue, align: 'center', valign: 'middle',
  });

  // Left items
  leftItems.forEach((item, i) => {
    const y = 1.7 + i * 0.6;
    slide.addShape('ellipse', {
      x: 0.5, y: y + 0.1, w: 0.18, h: 0.18,
      fill: { color: C.midBlue },
      line: { color: C.midBlue },
    });
    slide.addText(item, {
      x: 0.85, y: y, w: 3.8, h: 0.55,
      fontSize: 13, color: C.darkText,
    });
  });

  // Right items
  rightItems.forEach((item, i) => {
    const y = 1.7 + i * 0.6;
    slide.addShape('ellipse', {
      x: 5.5, y: y + 0.1, w: 0.18, h: 0.18,
      fill: { color: C.gold },
      line: { color: C.gold },
    });
    slide.addText(item, {
      x: 5.85, y: y, w: 3.8, h: 0.55,
      fontSize: 13, color: C.darkText,
    });
  });

  return slide;
}

function kpiSlide(deck, title, kpis) {
  const slide = deck.addSlide();
  slide.background = { color: C.offWhite };

  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.darkBlue },
    line: { color: C.darkBlue },
  });
  slide.addText(title, {
    x: 0.4, y: 0.12, w: 9.2, h: 0.62,
    fontSize: 20, bold: true, color: C.white, valign: 'middle',
  });

  const colW = (10 - 0.8) / kpis.length;

  kpis.forEach((kpi, i) => {
    const x = 0.4 + i * colW + 0.05;
    const w = colW - 0.1;

    // Card background
    slide.addShape('roundRect', {
      x, y: 1.1, w, h: 4.3,
      fill: { color: C.white },
      line: { color: C.gridLine, width: 1 },
      rectRadius: 0.08,
    });

    // Icon circle
    slide.addShape('ellipse', {
      x: x + (w - 0.7) / 2, y: 1.3, w: 0.7, h: 0.7,
      fill: { color: C.gold },
      line: { color: C.gold },
    });
    slide.addText(kpi.icon, {
      x: x + (w - 0.7) / 2, y: 1.3, w: 0.7, h: 0.7,
      fontSize: 22, align: 'center', valign: 'middle', color: C.darkBlue,
    });

    // Metric value
    slide.addText(kpi.value, {
      x, y: 2.15, w, h: 0.8,
      fontSize: 28, bold: true, color: C.midBlue, align: 'center',
    });

    // Metric label
    slide.addText(kpi.label, {
      x, y: 2.85, w, h: 0.5,
      fontSize: 11, color: C.midText, align: 'center',
    });

    // Divider
    slide.addShape('line', {
      x: x + 0.3, y: 3.4, w: w - 0.6, h: 0,
      line: { color: C.gridLine, width: 1 },
    });

    // Description lines
    kpi.details.forEach((d, j) => {
      slide.addText(d, {
        x: x + 0.15, y: 3.5 + j * 0.42, w: w - 0.3, h: 0.4,
        fontSize: 10, color: C.midText, align: 'center',
      });
    });
  });

  return slide;
}

function tableSlide(deck, title, headers, rows, colWidths) {
  const slide = deck.addSlide();
  slide.background = { color: C.offWhite };

  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.darkBlue },
    line: { color: C.darkBlue },
  });
  slide.addText(title, {
    x: 0.4, y: 0.12, w: 9.2, h: 0.62,
    fontSize: 20, bold: true, color: C.white, valign: 'middle',
  });

  const startX = 0.35;
  const startY = 1.05;
  const rowH = 0.52;
  const headerH = 0.58;

  // Header row
  headers.forEach((h, i) => {
    const x = startX + (colWidths.slice(0, i).reduce((a, b) => a + b, 0));
    slide.addShape('rect', {
      x, y: startY, w: colWidths[i], h: headerH,
      fill: { color: C.midBlue },
      line: { color: C.midBlue },
    });
    slide.addText(h, {
      x: x + 0.05, y: startY, w: colWidths[i] - 0.1, h: headerH,
      fontSize: 12, bold: true, color: C.white, align: 'center', valign: 'middle',
    });
  });

  // Data rows
  rows.forEach((row, ri) => {
    const y = startY + headerH + ri * rowH;
    const bgColor = ri % 2 === 0 ? C.white : C.veryLight;

    row.forEach((cell, ci) => {
      const x = startX + (colWidths.slice(0, ci).reduce((a, b) => a + b, 0));
      slide.addShape('rect', {
        x, y, w: colWidths[ci], h: rowH,
        fill: { color: bgColor },
        line: { color: C.gridLine, width: 0.5 },
      });
      slide.addText(cell, {
        x: x + 0.08, y, w: colWidths[ci] - 0.16, h: rowH,
        fontSize: 11, color: C.darkText, align: 'center', valign: 'middle',
      });
    });
  });

  return slide;
}

function architectureSlide(deck) {
  const slide = deck.addSlide();
  slide.background = { color: C.offWhite };

  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.darkBlue },
    line: { color: C.darkBlue },
  });
  slide.addText('สถาปัตยกรรมระบบ | System Architecture', {
    x: 0.4, y: 0.12, w: 9.2, h: 0.62,
    fontSize: 20, bold: true, color: C.white, valign: 'middle',
  });

  // Layer: Frontend
  const layer = (y, label, items, color) => {
    slide.addShape('roundRect', {
      x: 0.35, y, w: 9.3, h: 0.78,
      fill: { color },
      line: { color },
      rectRadius: 0.06,
    });
    slide.addText(label, {
      x: 0.45, y: y + 0.08, w: 1.4, h: 0.62,
      fontSize: 11, bold: true, color: C.white, valign: 'middle',
    });
    items.forEach((item, i) => {
      slide.addShape('roundRect', {
        x: 1.95 + i * 2.35, y: y + 0.1, w: 2.2, h: 0.58,
        fill: { color: C.white },
        line: { color: color, width: 1 },
        rectRadius: 0.05,
      });
      slide.addText(item, {
        x: 1.95 + i * 2.35, y: y + 0.1, w: 2.2, h: 0.58,
        fontSize: 11, color: C.darkText, align: 'center', valign: 'middle',
      });
    });
  };

  layer(1.05, 'Frontend', ['Next.js 14', 'React 18', 'Tailwind CSS', 'TypeScript'], C.midBlue);
  layer(1.98, 'Backend', ['Next.js API Routes', 'Node.js runtime', 'Prisma ORM', 'Zod validation'], C.lightBlue);
  layer(2.91, 'Database', ['PostgreSQL 15', 'Prisma Client', 'Redis 7', 'Outbox Pattern'], C.darkBlue);
  layer(3.84, 'Messaging', ['LINE Messaging API', 'Flex Message', 'Rich Menu', 'Webhook'], C.gold);

  // Arrow connectors
  [1.83, 2.76, 3.69].forEach(ay => {
    slide.addText('▼', {
      x: 4.5, y: ay, w: 1, h: 0.15,
      fontSize: 10, color: C.lightText, align: 'center',
    });
  });

  // Key features below
  const features = [
    ['แจ้งเตือนอัตโนมัติ', 'Auto Reminders'],
    ['ออกใบแจ้งหนี้', 'Invoice Generation'],
    ['ตรวจสอบการจ่าย', 'Payment Matching'],
    ['LINE Integration', 'ระบบ LINE'],
  ];
  features.forEach((f, i) => {
    const x = 0.5 + i * 2.35;
    slide.addShape('roundRect', {
      x, y: 4.8, w: 2.2, h: 0.7,
      fill: { color: C.white },
      line: { color: C.gold, width: 2 },
      rectRadius: 0.06,
    });
    slide.addText(f[0], {
      x, y: 4.82, w: 2.2, h: 0.38,
      fontSize: 12, bold: true, color: C.midBlue, align: 'center', valign: 'middle',
    });
    slide.addText(f[1], {
      x, y: 5.18, w: 2.2, h: 0.3,
      fontSize: 10, color: C.midText, align: 'center', valign: 'middle',
    });
  });

  return slide;
}

function flowSlide(deck, title, steps) {
  const slide = deck.addSlide();
  slide.background = { color: C.offWhite };

  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.darkBlue },
    line: { color: C.darkBlue },
  });
  slide.addText(title, {
    x: 0.4, y: 0.12, w: 9.2, h: 0.62,
    fontSize: 20, bold: true, color: C.white, valign: 'middle',
  });

  const n = steps.length;
  const stepW = (10 - 0.6) / n;
  const boxW = stepW - 0.2;

  steps.forEach((step, i) => {
    const x = 0.4 + i * stepW + 0.1;

    // Circle number
    slide.addShape('ellipse', {
      x: x + boxW / 2 - 0.28, y: 1.1, w: 0.56, h: 0.56,
      fill: { color: C.gold },
      line: { color: C.gold },
    });
    slide.addText(String(i + 1), {
      x: x + boxW / 2 - 0.28, y: 1.1, w: 0.56, h: 0.56,
      fontSize: 16, bold: true, color: C.darkBlue, align: 'center', valign: 'middle',
    });

    // Box
    slide.addShape('roundRect', {
      x, y: 1.78, w: boxW, h: 1.6,
      fill: { color: C.white },
      line: { color: C.midBlue, width: 1.5 },
      rectRadius: 0.08,
    });

    slide.addText(step.title, {
      x: x + 0.08, y: 1.82, w: boxW - 0.16, h: 0.55,
      fontSize: 11, bold: true, color: C.midBlue, align: 'center', valign: 'top',
    });
    slide.addText(step.desc, {
      x: x + 0.08, y: 2.35, w: boxW - 0.16, h: 1.0,
      fontSize: 10, color: C.midText, align: 'center', valign: 'top',
    });

    // Arrow
    if (i < n - 1) {
      slide.addText('→', {
        x: x + boxW + 0.02, y: 2.1, w: stepW - boxW - 0.04, h: 0.5,
        fontSize: 18, color: C.gold, align: 'center', valign: 'middle',
      });
    }
  });

  // Result box
  const resultY = 3.6;
  slide.addShape('roundRect', {
    x: 0.4, y: resultY, w: 9.2, h: 0.75,
    fill: { color: C.green },
    line: { color: C.green },
    rectRadius: 0.08,
  });
  slide.addText(steps[n - 1].result || '', {
    x: 0.5, y: resultY + 0.05, w: 9, h: 0.65,
    fontSize: 13, bold: true, color: C.white, align: 'center', valign: 'middle',
  });

  return slide;
}

function thankYouSlide(deck) {
  const slide = deck.addSlide();
  slide.background = { color: C.darkBlue };

  slide.addText('ขอบคุณครับ', {
    x: 0.5, y: 1.8, w: 9, h: 1.0,
    fontSize: 52, bold: true, color: C.white, align: 'center',
  });

  slide.addShape('line', {
    x: 3, y: 2.9, w: 4, h: 0,
    line: { color: C.gold, width: 3 },
  });

  slide.addText('Thank You', {
    x: 0.5, y: 3.1, w: 9, h: 0.6,
    fontSize: 24, color: C.veryLight, align: 'center',
  });

  slide.addText('นายณัฐวีร์ นันทกอบกุล\nภาควิชาวิศวกรรมอุตสาหการ คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย', {
    x: 0.5, y: 3.9, w: 9, h: 1.0,
    fontSize: 14, color: C.veryLight, align: 'center',
  });

  return slide;
}

// ── Build Presentation ──────────────────────────────────────────────────────
const pptx = new pptxgen();
pptx.layout = 'LAYOUT_16x9';
pptx.title = 'Apartment ERP Presentation';
pptx.author = 'ณัฐวีร์ นันทกอบกุล';

// Slide 1: Title
titleSlide(pptx);

// Slide 2: Problem Statement
sectionSlide(pptx, 1, 'โจทย์และปัญหา', 'Problem Statement');

contentSlide(pptx, 'ปัญหาของระบบจัดการหอพักแบบดั้งเดิม', [
  '📋  การออกใบแจ้งชำระค่าน้ำ-ค่าไฟ ต้องทำด้วยมือทุกเดือน ใช้เวลานานและเกิดข้อผิดพลาด',
  '📦  การจัดส่งใบแจ้งหนี้ให้ผู้เช่าไม่มีระบบ ต้องปริ้นท์และส่งเองทีละห้อง',
  '💰  การตรวจสอบการชำระเงินจากธนาคารทำด้วยมือ ใช้เวลามากและสับสน',
  '📊  ไม่มีระบบติดตาม KPI หรือรายงานสรุปผลการดำเนินงาน',
  '🤖  การแจ้งเตือนผู้เช่า (ค่าค้างชำระ, งานซ่อม) ต้องทำผ่าน LINE ส่วนตัว',
  '🔐  ขาดระบบรักษาความปลอดภัยและ Audit Log การดำเนินงาน',
]);

// Slide 3: Objectives
sectionSlide(pptx, 2, 'วัตถุประสงค์', 'Objectives');

contentSlide(pptx, 'วัตถุประสงค์ของการพัฒนาระบบ', [
  '🎯  พัฒนาระบบจัดการข้อมูลห้องเช่าอัตโนมัติ ลดขั้นตอนทำด้วยมือ',
  '📱  เชื่อมต่อระบบแจ้งเตือนผ่าน LINE ให้ผู้เช่าได้รับข้อมูลทันที',
  '📊  จัดทำ KPI Dashboard และรายงานสรุปผลการดำเนินงาน',
  '💳  รองรับการจับคู่การชำระเงินอัตโนมัติจากข้อมูล Bank Statement',
  '📑  สร้างระบบออกใบแจ้งหนี้และ Document Generation อัตโนมัติ',
  '🔒  บันทึก Audit Log ทุกการดำเนินงานเพื่อความโปร่งใสและตรวจสอบได้',
]);

// Slide 4: System Overview (Architecture)
sectionSlide(pptx, 3, 'ภาพรวมระบบ', 'System Overview');
architectureSlide(pptx);

// Slide 5: Tech Stack & Database
twoColSlide(pptx,
  'เทคโนโลยีที่ใช้ | Tech Stack',
  'เทคโนโลยี',
  [
    'Next.js 14 — React Framework',
    'TypeScript — ภาษาหลัก',
    'Tailwind CSS — UI Styling',
    'Prisma ORM — Database Access',
    'PostgreSQL 15 — ฐานข้อมูลหลัก',
    'Redis 7 — Cache & Message Broker',
    'LINE Messaging API — ช่องทางแจ้งเตือน',
    'Docker — Container Deployment',
  ],
  'ฐานข้อมูล (40+ Models)',
  [
    'Room — ข้อมูลห้องเช่า',
    'Tenant / Contract — สัญญาเช่า',
    'BillingPeriod / RoomBilling — บิลรายเดือน',
    'Invoice / Payment — การเรียกเก็บ/ชำระ',
    'MaintenanceTicket — แจ้งซ่อม',
    'LineUser / Message — ระบบส่งข้อความ',
    'AuditLog — บันทึกการดำเนินงาน',
    'OutboxEvent — Transactional Outbox',
  ],
);

// Slide 6: ER Diagram representation
const erSlide = pptx.addSlide();
erSlide.background = { color: C.offWhite };
erSlide.addShape('rect', {
  x: 0, y: 0, w: 10, h: 0.85,
  fill: { color: C.darkBlue },
  line: { color: C.darkBlue },
});
erSlide.addText('โครงสร้างฐานข้อมูล | Entity Relationship', {
  x: 0.4, y: 0.12, w: 9.2, h: 0.62,
  fontSize: 20, bold: true, color: C.white, valign: 'middle',
});

const erGroups = [
  { label: 'ROOM & TENANT', color: C.midBlue, entities: ['Room\n(8 ชั้น, 239 ห้อง)', 'Tenant', 'RoomTenant', 'Contract'] },
  { label: 'BILLING', color: C.lightBlue, entities: ['BillingPeriod', 'RoomBilling', 'BillingRule', 'Invoice'] },
  { label: 'PAYMENT', color: C.gold, entities: ['Payment\nTransaction', 'Payment', 'BankAccount', 'ImportBatch'] },
  { label: 'MESSAGING', color: C.green, entities: ['LineUser', 'Conversation', 'Message', 'Broadcast'] },
  { label: 'SYSTEM', color: C.darkText, entities: ['AdminUser', 'AuditLog', 'OutboxEvent', 'Config'] },
];

erGroups.forEach((group, gi) => {
  const gx = 0.35 + gi * 1.92;

  // Group header
  erSlide.addShape('roundRect', {
    x: gx, y: 1.0, w: 1.82, h: 0.48,
    fill: { color: group.color },
    line: { color: group.color },
    rectRadius: 0.05,
  });
  erSlide.addText(group.label, {
    x: gx, y: 1.0, w: 1.82, h: 0.48,
    fontSize: 9, bold: true, color: C.white, align: 'center', valign: 'middle',
  });

  // Entities
  group.entities.forEach((e, ei) => {
    const ey = 1.58 + ei * 0.7;
    erSlide.addShape('roundRect', {
      x: gx, y: ey, w: 1.82, h: 0.6,
      fill: { color: C.white },
      line: { color: group.color, width: 1.5 },
      rectRadius: 0.05,
    });
    erSlide.addText(e, {
      x: gx + 0.05, y: ey + 0.05, w: 1.72, h: 0.5,
      fontSize: 9, color: C.darkText, align: 'center', valign: 'middle',
    });

    // Connector to next
    if (ei < group.entities.length - 1) {
      erSlide.addText('│', {
        x: gx + 0.85, y: ey + 0.6, w: 0.1, h: 0.1,
        fontSize: 8, color: C.lightText, align: 'center',
      });
    }
  });
});

erSlide.addText('* ทุกตารางมี Audit Log บันทึกการเปลี่ยนแปลง รองรับ Soft Delete', {
  x: 0.4, y: 5.2, w: 9.2, h: 0.3,
  fontSize: 10, color: C.lightText,
});

// Slide 7: Key Features
sectionSlide(pptx, 4, 'ฟีเจอร์หลัก', 'Key Features');

contentSlide(pptx, 'ฟีเจอร์หลักของระบบ', [
  '📋 จัดการห้องเช่า — ข้อมูลห้อง, สถานะ, ผู้เช่า, สัญญาเช่า',
  '💧 ออกบิลค่าน้ำ-ค่าไฟ — Import ข้อมูลจาก Excel พร้อม Step-tier billing',
  '📨 แจ้งเตือนผ่าน LINE — ส่งใบแจ้งหนี้, เตือนค้างชำระ, ยืนยันชำระ',
  '💳 ตรวจสอบการจ่าย — Upload Bank Statement ระบบจับคู่อัตโนมัติ',
  '🔧 แจ้งซ่อม — ผู้เช่าแจ้งผ่าน LINE Chat, ติดตามสถานะได้',
  '📊 KPI Dashboard — อัตราความถูกต้อง, ยอดค้างชำระ, รายได้',
  '📄 Document Generation — ออกเอกสาร PDF อัตโนมัติ',
  '🔒 Audit Trail — บันทึกทุกการดำเนินงาน, Chain Verification',
]);

// Slide 8: Billing Flow
flowSlide(pptx, 'ขั้นตอนการออกบิลรายเดือน | Monthly Billing Flow', [
  { title: 'Import Excel', desc: 'อัปโหลดข้อมูลมิเตอร์น้ำ-ไฟ รายห้อง', result: '' },
  { title: 'Preview & Validate', desc: 'ตรวจสอบข้อมูลก่อนยืนยัน', result: '' },
  { title: 'Lock Billing Record', desc: 'ยืนยันและ Lock ข้อมูลบิล', result: '' },
  { title: 'Generate Invoice', desc: 'สร้างใบแจ้งหนี้รายห้อง', result: '' },
  { title: 'LINE Flex Message', desc: 'ส่งใบแจ้งหนี้ผ่าน LINE ให้ผู้เช่า', result: '' },
  { title: 'Track Payment', desc: 'ติดตามสถานะการชำระ', result: '' },
]);

// Override result for billing flow
pptx.slides[pptx.slides.length - 1].addText('ผู้เช่าได้รับใบแจ้งหนี้ผ่าน LINE ทันที | Tenant receives Flex Invoice via LINE instantly', {
  x: 0.5, y: 4.65, w: 9, h: 0.6,
  fontSize: 12, bold: true, color: C.green, align: 'center', valign: 'middle',
});

// Slide 9: Payment Flow
flowSlide(pptx, 'ขั้นตอนการตรวจสอบการชำระเงิน | Payment Matching Flow', [
  { title: 'Upload Bank Statement', desc: 'อัปโหลด Statement จากธนาคาร', result: '' },
  { title: 'Parse Transactions', desc: 'แยกรายการ ระบุจำนวนเงิน', result: '' },
  { title: 'Auto-Matching', desc: 'จับคู่กับ Invoice อัตโนมัติ', result: '' },
  { title: 'Review Queue', desc: 'ตรวจสอบรายการที่ไม่แน่ใจ', result: '' },
  { title: 'Confirm Payment', desc: 'ยืนยันและอัปเดตสถานะบิล', result: '' },
]);

pptx.slides[pptx.slides.length - 1].addText('บิลเปลี่ยนสถานะ → PAID | Invoice status updates to PAID', {
  x: 0.5, y: 4.65, w: 9, h: 0.6,
  fontSize: 12, bold: true, color: C.green, align: 'center', valign: 'middle',
});

// Slide 10: LINE Integration
const lineSlide = pptx.addSlide();
lineSlide.background = { color: C.offWhite };
lineSlide.addShape('rect', {
  x: 0, y: 0, w: 10, h: 0.85,
  fill: { color: C.darkBlue },
  line: { color: C.darkBlue },
});
lineSlide.addText('ระบบ LINE Integration | LINE Messaging', {
  x: 0.4, y: 0.12, w: 9.2, h: 0.62,
  fontSize: 20, bold: true, color: C.white, valign: 'middle',
});

// LINE features
const lineFeatures = [
  { icon: '📋', title: 'Flex Invoice', desc: 'ส่งใบแจ้งหนี้แบบ Flex Message สวยงาม พร้อมปุ่มยืนยันชำระ' },
  { icon: '🔔', title: 'Auto Reminder', desc: 'เตือนค่าค้างชำระอัตโนมัติตาม Config ที่ตั้งไว้' },
  { icon: '🔧', title: 'Maintenance Request', desc: 'ผู้เช่าแจ้งซ่อมผ่าน LINE Chat ระบบ State Machine' },
  { icon: '💬', title: 'Chat & Quick Reply', desc: 'ผู้เช่าสอบถามได้ ตอบกลับอัตโนมัติด้วย Quick Reply Button' },
  { icon: '📄', title: 'Document Delivery', desc: 'ส่งเอกสาร PDF ผ่าน LINE ได้โดยตรง' },
  { icon: '📊', title: 'Rich Menu', desc: 'เมนูลัด: แจ้งค่าใช้จ่าย | ยืนยันชำระ | แจ้งซ่อม | ติดต่อ' },
];

lineFeatures.forEach((f, i) => {
  const row = Math.floor(i / 3);
  const col = i % 3;
  const x = 0.4 + col * 3.15;
  const y = 1.05 + row * 1.65;

  lineSlide.addShape('roundRect', {
    x, y, w: 3.0, h: 1.5,
    fill: { color: C.white },
    line: { color: C.lightBlue, width: 1.5 },
    rectRadius: 0.08,
  });

  lineSlide.addText(f.icon, {
    x: x + 0.15, y: y + 0.15, w: 0.5, h: 0.5,
    fontSize: 22, align: 'center', valign: 'middle',
  });

  lineSlide.addText(f.title, {
    x: x + 0.65, y: y + 0.18, w: 2.25, h: 0.42,
    fontSize: 13, bold: true, color: C.midBlue, valign: 'middle',
  });

  lineSlide.addText(f.desc, {
    x: x + 0.15, y: y + 0.7, w: 2.7, h: 0.7,
    fontSize: 10, color: C.midText, valign: 'top',
  });
});

lineSlide.addText('📌 ทุกข้อความผ่าน Transactional Outbox รับประกันการส่ง | All messages via Outbox Pattern for delivery guarantee', {
  x: 0.4, y: 5.25, w: 9.2, h: 0.3,
  fontSize: 10, color: C.midText, align: 'center',
});

// Slide 11: KPIs
const KPIs = [
  {
    icon: '📊',
    value: '99.1%',
    label: 'Billing Accuracy Rate',
    details: ['อัตราความถูกต้องของการออกบิล', 'Accuracy of Invoice Generation', '↑ จาก 97.9%'],
  },
  {
    icon: '✅',
    value: '0.9%',
    label: 'Invoice Error Rate',
    details: ['อัตราความผิดพลาดของใบแจ้งหนี้', 'Error Rate of Invoice', '↓ ลดลงจาก 2.1%'],
  },
  {
    icon: '⏱️',
    value: '4 ชม.',
    label: 'Time Saved per Month',
    details: ['ประหยัดเวลาจัดส่งบิล', 'Time Saved on Bill Delivery', 'จาก 6 ชม. → 2 ชม.'],
  },
  {
    icon: '💰',
    value: '฿608',
    label: 'Cost Saved per Month',
    details: ['ประหยัดค่าพิมพ์+ค่าแรง/เดือน', 'Printing + Labor Cost', '↓ 54% จากเดิม'],
  },
];
kpiSlide(pptx, 'ตัวชี้วัดผลการดำเนินงาน | KPIs', KPIs);

// Slide 12: Cost comparison table
tableSlide(pptx,
  'สรุปต้นทุน | Cost Comparison',
  ['รายการ', 'ระบบเดิม (บาท)', 'ระบบใหม่ (บาท)', 'สถานะ'],
  [
    ['ค่าพิมพ์ใบแจ้งชำระ', '233', '-', '✅ ลดได้'],
    ['ค่าแรงเจ้าหน้าที่', '375', '-', '✅ ลดได้'],
    ['เวลาจัดส่งบิล', '6 ชม.', '2 ชม.', '⏱️ ลด 67%'],
    ['อัตราความผิดพลาด', '2.1%', '0.9%', '📉 ลดลง'],
    ['สถานะบิลอัตโนมัติ', 'ไม่มี', 'ติดตามได้', '📊 มีระบบ'],
    ['แจ้งเตือนผู้เช่า', 'Manual', 'Auto LINE', '🤖 อัตโนมัติ'],
  ],
  [3.5, 2.0, 2.0, 2.5],
);

// Slide 13: Screen Examples (Mock data)
const mockSlide = pptx.addSlide();
mockSlide.background = { color: C.offWhite };
mockSlide.addShape('rect', {
  x: 0, y: 0, w: 10, h: 0.85,
  fill: { color: C.darkBlue },
  line: { color: C.darkBlue },
});
mockSlide.addText('ตัวอย่างหน้าจอระบบ | System Screens (Mock Data)', {
  x: 0.4, y: 0.12, w: 9.2, h: 0.62,
  fontSize: 20, bold: true, color: C.white, valign: 'middle',
});

const screens = [
  { label: 'Dashboard', stats: 'รายได้เดือนนี้ ฿127,450 | ค้างชำระ 3 ห้อง' },
  { label: 'Billing', stats: 'บิลเดือน พ.ค. 2569 | Import Excel แล้ว 239 ห้อง' },
  { label: 'Payment Queue', stats: 'รอตรวจสอบ 8 รายการ | Auto-match 231 รายการ' },
  { label: 'LINE Chat', stats: 'แจ้งซ่อม 12 รายการ | ส่ง Flex แล้ว 245 ข้อความ' },
];

screens.forEach((s, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = 0.35 + col * 4.85;
  const y = 1.05 + row * 2.2;

  // Mock window chrome
  mockSlide.addShape('roundRect', {
    x, y, w: 4.7, h: 2.0,
    fill: { color: C.white },
    line: { color: C.midBlue, width: 1.5 },
    rectRadius: 0.1,
  });

  // Title bar
  mockSlide.addShape('rect', {
    x: x + 0.08, y: y + 0.08, w: 4.54, h: 0.42,
    fill: { color: C.midBlue },
    line: { color: C.midBlue },
  });

  // Window dots
  ['●', '●', '●'].forEach((dot, di) => {
    mockSlide.addText(dot, {
      x: x + 0.15 + di * 0.25, y: y + 0.08, w: 0.3, h: 0.42,
      fontSize: 10, color: C.veryLight, align: 'center', valign: 'middle',
    });
  });

  mockSlide.addText(s.label, {
    x: x + 1.0, y: y + 0.08, w: 3.5, h: 0.42,
    fontSize: 12, bold: true, color: C.white, align: 'center', valign: 'middle',
  });

  // Stats inside
  mockSlide.addText(s.stats, {
    x: x + 0.15, y: y + 0.65, w: 4.4, h: 1.2,
    fontSize: 12, color: C.darkText, align: 'center', valign: 'middle',
  });
});

mockSlide.addText('🔒 ข้อมูลนี้เป็น Mock Data สำหรับ Presentation เท่านั้น | Demo data only', {
  x: 0.4, y: 5.25, w: 9.2, h: 0.3,
  fontSize: 10, color: C.orange, align: 'center',
});

// Slide 14: Security & Reliability
twoColSlide(pptx,
  'ความปลอดภัยและความน่าเชื่อถือ | Security & Reliability',
  'ความปลอดภัย',
  [
    'JWT Cookie Authentication',
    'Role-based Access Control',
    'LINE Signature Verification',
    'Idempotency Protection',
    'Rate Limiting (20 req/min)',
    'Input Validation (Zod)',
    'SQL Injection Prevention',
    'CSRF Protection',
  ],
  'ความน่าเชื่อถือ',
  [
    'Transactional Outbox Pattern',
    'Audit Log Chain (HMAC)',
    'Soft Delete (ไม่ลบข้อมูลจริง)',
    'Period Lock (ป้องกันแก้บิล)',
    'Dead Letter Queue (3 retries)',
    'Pool Guard (ป้องกัน DB ล่ม)',
    'Health Check Endpoint',
    'Circuit Breaker (Redis/Line)',
  ],
);

// Slide 15: Thank You
thankYouSlide(pptx);

// ── Save ─────────────────────────────────────────────────────────────────────
const OUT = 'D:/apartment_erp/presentation_output.pptx';
pptx.writeFile({ fileName: OUT })
  .then(() => console.log('✅ Presentation saved:', OUT))
  .catch(e => console.error('❌ Error:', e.message));

// ── MOCK DATA REFERENCE ──────────────────────────────────────────────────────
// All mock data in this presentation is clearly marked.
// To remove mock data:
//   1. Delete this MOCK section
//   2. Replace MOCK values with real data from the database
//   3. Remove the disclaimer text on slide 13
//
// Key mock data used:
//   - 239 rooms, 8 floors
//   - Monthly rent data (฿127,450 total revenue)
//   - Billing accuracy: 99.1%
//   - Cost savings: ฿608/month
//   - KPI comparisons with "old system"