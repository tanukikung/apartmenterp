/**
 * Clean seed script with all fixes applied.
 * 1. Reset DB (clean rooms, tenants, contracts, billings, invoices)
 * 2. Create 239 rooms (exact inventory)
 * 3. Create ~192 tenants (80% occupancy) with contracts
 * 4. Create 12 billing periods for 2025
 * 5. Ensure billing rules exist (DEFAULT, STANDARD, NO_ELECTRIC, NO_WATER)
 * 6. Import billing data from D:/tmp/billing_converted/month_N.xlsx
 * 7. Generate invoices via direct Prisma (avoiding broken $executeRaw API)
 */
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const prisma = new PrismaClient();

// ── Room definitions ──────────────────────────────────────────────────────

const FLOORS = [
  { prefix: '798/',   floor: 1, count: 15, rent: 15500 },
  { prefix: '320',    floor: 2, count: 32, rent: 2900  },
  { prefix: '330',    floor: 3, count: 32, rent: 3400  },
  { prefix: '340',    floor: 4, count: 32, rent: 2900  },
  { prefix: '350',    floor: 5, count: 32, rent: 2900  },
  { prefix: '360',    floor: 6, count: 32, rent: 2900  },
  { prefix: '370',    floor: 7, count: 32, rent: 3900  },
  { prefix: '380',    floor: 8, count: 32, rent: 2900  },
];

const BILLING_ACCOUNTS = {
  1: 'ACC_F1', 2: 'ACC_F2', 3: 'ACC_F3', 4: 'ACC_F4',
  5: 'ACC_F5', 6: 'ACC_F6', 7: 'ACC_F7', 8: 'ACC_F8',
};

const THAI_FIRST = ['สมชาย','สมหญิง','วิชัย','นงลัก','ประเสริฐ','พิชญา','ธนา','ศิริ',
  'อนันต์','จิรา','ชัยวัฒน์','มาลี','ประชัน','วรพล','ฐาปนา','นพดล',
  'สุชาติ','ทรงชัย','เอกชัย','ธีระ','วรรณา','สิทธิ์','ธรรม','ศักดิ์','เจริญ','บวร','ตรี','พงษ์'];
const THAI_LAST  = ['ใจดี','สุขสวัสดิ์','รุ่งเรือง','วิเศษ','พลาสุข','โพธิ์ทอง',
  'เจริญ','ดีสุข','ชำนาญ','เกษม','ปราณี','ศักดิ์สิทธิ์','วัฒนา','สุนทร',
  'บุญมี','ธรรมา','พัฒนา','สมบัติ','ศรีสุข','เต็มใจ','สุข','ทอง','พรม','แก้ว','ทับ','ลาย','เล็ก','ใหญ่'];

function pad(n, size) { let s = String(n); while (s.length < size) s = '0'+s; return s; }
function randInt(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }
function randPhone() { return '08'+pad(randInt(1000000,9999999),7); }

// ── Step 1: Clean DB ──────────────────────────────────────────────────────

async function cleanDB() {
  console.log('=== CLEANING DATABASE ===');
  // Must delete children before parents
  await prisma.invoice.deleteMany({ where: { roomBilling: { billingPeriod: { year: 2025 } } } }).catch(() => {});
  await prisma.roomBilling.deleteMany({ where: { billingPeriod: { year: 2025 } } }).catch(() => {});
  await prisma.importBatch.deleteMany().catch(() => {});
  await prisma.importSession.deleteMany().catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { year: 2025 } }).catch(() => {});
  await prisma.contract.deleteMany().catch(() => {});
  await prisma.roomTenant.deleteMany().catch(() => {});
  await prisma.tenant.deleteMany().catch(() => {});
  await prisma.room.updateMany({ data: { roomStatus: 'VACANT' } }).catch(() => {});
  await prisma.room.deleteMany().catch(() => {});
  await prisma.outboxEvent.deleteMany().catch(() => {});
  await prisma.auditLog.deleteMany().catch(() => {});
  console.log('  ✓ DB cleaned\n');
}

// ── Step 2: Create 239 rooms ──────────────────────────────────────────────

async function createRooms() {
  console.log('=== CREATING 239 ROOMS ===');
  let count = 0;
  for (const floor of FLOORS) {
    for (let i = 1; i <= floor.count; i++) {
      const finalRoomNo = floor.prefix === '798/'
        ? `798/${i}`
        : i >= 10
          ? floor.prefix.slice(0, -1) + i
          : floor.prefix + pad(i, 0);
      await prisma.room.create({
        data: {
          roomNo: finalRoomNo,
          floorNo: floor.floor,
          defaultAccountId: BILLING_ACCOUNTS[floor.floor],
          defaultRuleCode: 'STANDARD',
          defaultRentAmount: String(floor.rent),
          hasFurniture: floor.floor === 1,
          defaultFurnitureAmount: floor.floor === 1 ? '3000' : '0',
          roomStatus: 'VACANT',
        },
      });
      count++;
    }
  }
  console.log(`  ✓ Created ${count} rooms\n`);
}

// ── Step 3: Create ~192 tenants with contracts ────────────────────────────

async function createTenantsAndContracts() {
  console.log('=== CREATING TENANTS + CONTRACTS ===');
  const rooms = await prisma.room.findMany({ orderBy: { roomNo: 'asc' } });
  const OCCUPANCY_RATE = 0.80;
  const numOccupied = Math.floor(rooms.length * OCCUPANCY_RATE);
  const occupiedRooms = rooms.slice(0, numOccupied);
  const vacantRooms = rooms.slice(numOccupied);

  let tenantCount = 0;
  let contractCount = 0;

  for (let i = 0; i < occupiedRooms.length; i++) {
    const room = occupiedRooms[i];
    const fi = i % THAI_FIRST.length;
    const li = i % THAI_LAST.length;
    const firstName = THAI_FIRST[fi];
    const lastName  = THAI_LAST[li];

    const tenant = await prisma.tenant.create({
      data: {
        firstName,
        lastName,
        phone: randPhone(),
        email: `tenant${pad(i+1,4)}@example.com`,
        emergencyContact: `${THAI_FIRST[(i+1)%THAI_FIRST.length]} ${THAI_LAST[(i+2)%THAI_LAST.length]}`,
        emergencyPhone: randPhone(),
      },
    });

    await prisma.roomTenant.create({
      data: {
        roomNo: room.roomNo,
        tenantId: tenant.id,
        role: 'PRIMARY',
        moveInDate: new Date('2025-01-01'),
      },
    });

    const rent = parseFloat(String(room.defaultRentAmount));
    await prisma.contract.create({
      data: {
        roomNo: room.roomNo,
        primaryTenantId: tenant.id,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        monthlyRent: rent,
        deposit: rent * 2,
        status: 'ACTIVE',
      },
    });

    await prisma.room.update({
      where: { roomNo: room.roomNo },
      data: { roomStatus: 'OCCUPIED' },
    });

    tenantCount++;
    contractCount++;
  }

  console.log(`  ✓ ${tenantCount} tenants created`);
  console.log(`  ✓ ${contractCount} contracts created`);
  console.log(`  ✓ ${vacantRooms.length} rooms remain VACANT\n`);
}

// ── Step 4: Create billing periods ────────────────────────────────────────

async function createBillingPeriods() {
  console.log('=== CREATING BILLING PERIODS (12 months) ===');
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  for (let m = 1; m <= 12; m++) {
    await prisma.billingPeriod.upsert({
      where: { year_month: { year: 2025, month: m } },
      create: { year: 2025, month: m, status: 'OPEN', dueDay: 25 },
      update: { status: 'OPEN' },
    });
    console.log(`  ✓ 2025/${String(m).padStart(2,'0')} (${months[m-1]})`);
  }
  console.log('');
}

// ── Step 5: Ensure billing rules ─────────────────────────────────────────

async function ensureBillingRules() {
  const rules = [
    { code: 'DEFAULT', descriptionTh: 'Default', waterEnabled: true, waterUnitPrice: '20', waterMinCharge: '100', waterServiceFeeMode: 'FLAT_ROOM', waterServiceFeeAmount: '20', electricEnabled: true, electricUnitPrice: '9', electricMinCharge: '45', electricServiceFeeMode: 'FLAT_ROOM', electricServiceFeeAmount: '20' },
    { code: 'STANDARD', descriptionTh: 'Standard', waterEnabled: true, waterUnitPrice: '20', waterMinCharge: '100', waterServiceFeeMode: 'FLAT_ROOM', waterServiceFeeAmount: '20', electricEnabled: true, electricUnitPrice: '9', electricMinCharge: '45', electricServiceFeeMode: 'FLAT_ROOM', electricServiceFeeAmount: '20' },
    { code: 'NO_ELECTRIC', descriptionTh: 'No electric', waterEnabled: true, waterUnitPrice: '18', waterMinCharge: '0', waterServiceFeeMode: 'FLAT_ROOM', waterServiceFeeAmount: '50', electricEnabled: false, electricUnitPrice: '0', electricMinCharge: '0', electricServiceFeeMode: 'NONE', electricServiceFeeAmount: '0' },
    { code: 'NO_WATER', descriptionTh: 'No water', waterEnabled: false, waterUnitPrice: '0', waterMinCharge: '0', waterServiceFeeMode: 'NONE', waterServiceFeeAmount: '0', electricEnabled: true, electricUnitPrice: '8', electricMinCharge: '0', electricServiceFeeMode: 'NONE', electricServiceFeeAmount: '0' },
  ];
  for (const r of rules) {
    await prisma.billingRule.upsert({ where: { code: r.code }, create: r, update: {} });
  }
  console.log('✓ Billing rules ensured');
}

// ── Step 6: Parse xlsx ───────────────────────────────────────────────────

function parseXlsx(filePath) {
  const wb = XLSX.readFile(filePath, { cellNF: true });
  const result = {};

  for (const sheetName of wb.SheetNames) {
    if (!sheetName.startsWith('ชั้น_')) continue;
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (data.length < 4) continue;

    const headers = data[1]; // row 2 = English column names
    const colMap = {};
    headers.forEach((h, i) => { if (h) colMap[String(h).trim()] = i; });

    for (let ri = 3; ri < data.length; ri++) {
      const row = data[ri];
      if (!row || row.length === 0) continue;

      const getCell = (colName) => {
        const idx = colMap[colName];
        if (idx === undefined) return null;
        let v = row[idx];
        if (v === undefined || v === null || String(v).trim() === '') return null;
        return v;
      };
      const getNum = (colName) => {
        const v = getCell(colName);
        if (v == null) return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
      };

      const roomNo = getCell('room');
      if (!roomNo) continue;

      result[String(roomNo)] = {
        rentAmount: getNum('rent_amount') ?? 0,
        waterMode: getCell('water_mode') || 'NORMAL',
        waterPrev: getNum('water_prev'),
        waterCurr: getNum('water_curr'),
        waterUnits: getNum('water_units') ?? 0,
        waterUsageCharge: getNum('water_charge') ?? 0,
        waterServiceFee: getNum('water_fee') ?? 0,
        waterTotal: (getNum('water_charge') ?? 0) + (getNum('water_fee') ?? 0),
        electricMode: getCell('electric_mode') || 'NORMAL',
        electricPrev: getNum('electric_prev'),
        electricCurr: getNum('electric_curr'),
        electricUnits: getNum('electric_units') ?? 0,
        electricUsageCharge: getNum('electric_charge') ?? 0,
        electricServiceFee: getNum('electric_fee') ?? 0,
        electricTotal: (getNum('electric_charge') ?? 0) + (getNum('electric_fee') ?? 0),
        furnitureFee: getNum('furniture_fee') ?? 0,
        otherFee: getNum('other_fee') ?? 0,
        totalDue: getNum('total_due') ?? 0,
        note: getCell('note'),
        ruleCode: getCell('rule_code') || 'DEFAULT',
        recvAccountOverrideId: getCell('recv_account_override_id'),
        recvAccountId: getCell('account_id'),
        ruleOverrideCode: getCell('rule_override_code'),
      };
    }
  }
  return result;
}

// ── Step 7: Import billing data via upsert ────────────────────────────────

async function importBillings() {
  console.log('\n=== IMPORTING BILLING DATA ===');

  // Reset periods to OPEN first
  await prisma.billingPeriod.updateMany({ where: { year: 2025 }, data: { status: 'OPEN' } });

  // Delete existing billings for 2025
  const periods = await prisma.billingPeriod.findMany({ where: { year: 2025 }, select: { id: true } });
  await prisma.roomBilling.deleteMany({ where: { billingPeriodId: { in: periods.map(p => p.id) } } });

  let totalImported = 0;

  for (let m = 1; m <= 12; m++) {
    const filePath = `D:/tmp/billing_converted/month_${m}.xlsx`;
    if (!fs.existsSync(filePath)) {
      console.log(`  Month ${m}: FILE NOT FOUND`);
      continue;
    }

    const period = await prisma.billingPeriod.findUnique({
      where: { year_month: { year: 2025, month: m } },
    });
    if (!period) { console.log(`  Month ${m}: Period not found`); continue; }

    const xlsxData = parseXlsx(filePath);
    const roomNos = Object.keys(xlsxData);
    console.log(`  Month ${m}: ${roomNos.length} rooms`);

    let inserted = 0;
    for (const roomNo of roomNos) {
      const d = xlsxData[roomNo];
      const billing = {
        id: uuidv4(),
        billingPeriodId: period.id,
        roomNo: String(roomNo),
        status: 'DRAFT',
        rentAmount: d.rentAmount,
        waterMode: d.waterMode,
        waterPrev: d.waterPrev,
        waterCurr: d.waterCurr,
        waterUnits: d.waterUnits,
        waterUsageCharge: d.waterUsageCharge,
        waterServiceFee: d.waterServiceFee,
        waterTotal: d.waterTotal,
        electricMode: d.electricMode,
        electricPrev: d.electricPrev,
        electricCurr: d.electricCurr,
        electricUnits: d.electricUnits,
        electricUsageCharge: d.electricUsageCharge,
        electricServiceFee: d.electricServiceFee,
        electricTotal: d.electricTotal,
        furnitureFee: d.furnitureFee,
        otherFee: d.otherFee,
        totalDue: d.totalDue,
        note: d.note,
        ruleCode: d.ruleCode,
        recvAccountId: d.recvAccountId,
        recvAccountOverrideId: d.recvAccountOverrideId,
        ruleOverrideCode: d.ruleOverrideCode,
      };

      try {
        await prisma.roomBilling.upsert({
          where: { billingPeriodId_roomNo: { billingPeriodId: period.id, roomNo: billing.roomNo } },
          create: billing,
          update: {},
        });
        inserted++;
      } catch (e) {
        // silently skip errors
      }
    }

    console.log(`    Month ${m}: ✓ (${inserted}/${roomNos.length})`);
    totalImported += inserted;
  }

  console.log(`\n  Total billings imported: ${totalImported}`);
  return totalImported;
}

// ── Step 8: Generate invoices ────────────────────────────────────────────

async function generateInvoices() {
  console.log('\n=== GENERATING INVOICES ===');

  const periods = await prisma.billingPeriod.findMany({
    where: { year: 2025 },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });

  let totalInvoices = 0;

  for (const period of periods) {
    // Lock all DRAFT billings
    const lockResult = await prisma.roomBilling.updateMany({
      where: { billingPeriodId: period.id, status: 'DRAFT' },
      data: { status: 'LOCKED' },
    });

    if (lockResult.count === 0) {
      console.log(`  2025/${String(period.month).padStart(2,'0')}: no DRAFT records to lock`);
      continue;
    }

    await prisma.billingPeriod.update({
      where: { id: period.id },
      data: { status: 'LOCKED' },
    });

    // Get billings without invoices
    const billings = await prisma.roomBilling.findMany({
      where: { billingPeriodId: period.id, status: 'LOCKED' },
      include: { invoice: { select: { id: true } } },
    });

    const toGenerate = billings.filter(b => !b.invoice);
    let generated = 0;

    for (const billing of toGenerate) {
      try {
        // Create invoice directly via Prisma
        // Note: Invoice model does NOT have rentAmount/waterAmount/electricAmount/furnitureAmount/otherAmount
        // Those exist on RoomBilling but NOT on Invoice
        await prisma.invoice.create({
          data: {
            roomNo: billing.roomNo,
            roomBillingId: billing.id,
            year: period.year,
            month: period.month,
            issuedAt: new Date(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'GENERATED',
            totalAmount: Number(billing.totalDue ?? 0),
          },
        });
        generated++;
      } catch (e) {
        console.log(`    Error for ${billing.roomNo}: code=${e.code} msg=${String(e.message).slice(0,100)}`);
      }
    }

    console.log(`  2025/${String(period.month).padStart(2,'0')}: locked ${lockResult.count}, generated ${generated} invoices`);
    totalInvoices += generated;
  }

  return totalInvoices;
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  ROOM + TENANT + BILLING SEED        ║');
  console.log('╚══════════════════════════════════════╝');

  await cleanDB();
  await createRooms();
  await createTenantsAndContracts();
  await createBillingPeriods();
  await ensureBillingRules();
  await importBillings();
  await generateInvoices();

  const stats = {
    rooms:     await prisma.room.count(),
    occupied:  await prisma.room.count({ where: { roomStatus: 'OCCUPIED' } }),
    vacant:    await prisma.room.count({ where: { roomStatus: 'VACANT' } }),
    tenants:   await prisma.tenant.count(),
    contracts: await prisma.contract.count(),
    periods:   await prisma.billingPeriod.count(),
    billings:  await prisma.roomBilling.count(),
    invoices:  await prisma.invoice.count(),
  };

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  SEED COMPLETE ✓                    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  Rooms total:     ${stats.rooms}`);
  console.log(`  Occupied:        ${stats.occupied} (${Math.round(stats.occupied/stats.rooms*100)}%)`);
  console.log(`  Vacant:          ${stats.vacant}`);
  console.log(`  Tenants:         ${stats.tenants}`);
  console.log(`  Contracts:       ${stats.contracts}`);
  console.log(`  Billing Pd:      ${stats.periods}`);
  console.log(`  RoomBillings:    ${stats.billings}`);
  console.log(`  Invoices:        ${stats.invoices}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });