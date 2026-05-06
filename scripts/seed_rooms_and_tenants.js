/**
 * Room + Tenant Seed Script
 * Creates all 239 rooms (239 rooms total: 798/1-15, 3201-3232, 3301-3332, ..., 3801-3832)
 * Then creates ~192 tenants (80% of 239) with contracts + room assignments
 * Then seeds 12 months of billing data (already converted in /tmp/billing_converted/)
 *
 * Usage: node scripts/seed_rooms_and_tenants.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = new PrismaClient();

// ── Room definitions ──────────────────────────────────────────────────────

const FLOORS = [
  { prefix: '798/',   floor: 1, count: 15, rent: 15500 },  // 798/1 – 798/15
  { prefix: '320',    floor: 2, count: 32, rent: 2900  },  // 3201 – 3232
  { prefix: '330',    floor: 3, count: 32, rent: 3400  },  // 3301 – 3332
  { prefix: '340',    floor: 4, count: 32, rent: 2900  },  // 3401 – 3432
  { prefix: '350',    floor: 5, count: 32, rent: 2900  },  // 3501 – 3532
  { prefix: '360',    floor: 6, count: 32, rent: 2900  },  // 3601 – 3632
  { prefix: '370',    floor: 7, count: 32, rent: 3900  },  // 3701 – 3732
  { prefix: '380',    floor: 8, count: 32, rent: 2900  },  // 3801 – 3832
];
// Total: 15+32*7 = 239 rooms

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

// ── Step 1: Clean + Reset ─────────────────────────────────────────────────

async function cleanDB() {
  console.log('=== CLEANING DATABASE ===');
  const del = [
    ['paymentTransaction', 'deleteMany'],
    ['roomBilling', 'deleteMany'],
    ['invoice', 'deleteMany'],
    ['importBatch', 'deleteMany'],
    ['importSession', 'deleteMany'],
    ['billingPeriodCloseEvent', 'deleteMany'],
    ['billingPeriod', 'deleteMany'],
    ['maintenanceTicket', 'deleteMany'],
    ['roomTenant', 'deleteMany'],
    ['contract', 'deleteMany'],
    ['tenant', 'deleteMany'],
    ['OutboxEvent', 'deleteMany'],
    ['auditLog', 'deleteMany'],
  ];
  for (const [name, method] of del) {
    try { if (prisma[name]) await (prisma[name])[method](); } catch(e) { /* ignore */ }
  }
  // Reset rooms
  await prisma.room.updateMany({ data: { roomStatus: 'VACANT' } });
  await prisma.room.deleteMany();
  console.log('  ✓ DB cleaned\n');
}

// ── Step 2: Create 239 rooms ──────────────────────────────────────────────

async function createRooms() {
  console.log('=== CREATING 239 ROOMS ===');
  const rooms = [];
  for (const floor of FLOORS) {
    for (let i = 1; i <= floor.count; i++) {
      const roomNo = floor.prefix + pad(i, floor.prefix === '798/' ? 0 : 0);
      const finalRoomNo = floor.prefix === '798/'
        ? `798/${i}`   // 798/1, 798/2, ..., 798/15
        : `${floor.prefix}${pad(i, 0)}`;  // 3201, 3202, ...
      const rentStr = floor.rent === 15500 ? '15500' : String(floor.rent);
      const rm = await prisma.room.create({
        data: {
          roomNo: finalRoomNo,
          floorNo: floor.floor,
          defaultAccountId: BILLING_ACCOUNTS[floor.floor],
          defaultRuleCode: 'STANDARD',
          defaultRentAmount: rentStr,
          hasFurniture: floor.floor === 1,  // 798 building has furniture
          defaultFurnitureAmount: floor.floor === 1 ? '3000' : '0',
          roomStatus: 'VACANT',
        }
      });
      rooms.push(rm);
    }
  }
  console.log(`  ✓ Created ${rooms.length} rooms`);
  return rooms;
}

// ── Step 3: Create ~192 tenants (80% of 239) with contracts ───────────────

async function createTenantsAndContracts(rooms) {
  console.log('\n=== CREATING TENANTS + CONTRACTS ===');
  const OCCUPANCY_RATE = 0.80;
  const numOccupied = Math.floor(rooms.length * OCCUPANCY_RATE);  // ~191
  const occupiedRooms = rooms.slice(0, numOccupied);

  // Seed some rooms are "vacant" (no tenant)
  const vacantRooms = rooms.slice(numOccupied);

  let tenantCount = 0;
  let contractCount = 0;

  for (let i = 0; i < occupiedRooms.length; i++) {
    const room = occupiedRooms[i];
    const fi = i % THAI_FIRST.length;
    const li = i % THAI_LAST.length;
    const firstName = THAI_FIRST[fi];
    const lastName  = THAI_LAST[li];
    const phone     = randPhone();

    // Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        firstName,
        lastName,
        phone,
        email: `tenant${pad(i+1,4)}@example.com`,
        emergencyContact: `${THAI_FIRST[(i+1)%THAI_FIRST.length]} ${THAI_LAST[(i+2)%THAI_LAST.length]}`,
        emergencyPhone: randPhone(),
      }
    });

    // Assign tenant to room
    await prisma.roomTenant.create({
      data: {
        roomNo: room.roomNo,
        tenantId: tenant.id,
        role: 'PRIMARY',
        moveInDate: new Date('2025-01-01'),
      }
    });

    // Create contract (12 months: Jan-Dec 2025)
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
      }
    });

    // Update room status
    await prisma.room.update({
      where: { roomNo: room.roomNo },
      data: { roomStatus: 'OCCUPIED' },
    });

    tenantCount++;
    contractCount++;
  }

  console.log(`  ✓ ${tenantCount} tenants created`);
  console.log(`  ✓ ${contractCount} contracts created`);
  console.log(`  ✓ ${vacantRooms.length} rooms remain VACANT`);
  return { tenantCount, contractCount };
}

// ── Step 4: Create billing periods ────────────────────────────────────────

async function createBillingPeriods() {
  console.log('\n=== CREATING BILLING PERIODS (12 months) ===');
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  for (let m = 1; m <= 12; m++) {
    const period = await prisma.billingPeriod.upsert({
      where: { year_month: { year: 2025, month: m } },
      create: { year: 2025, month: m, status: 'OPEN', dueDay: 25 },
      update: { status: 'OPEN' },
    });
    console.log(`  ✓ 2025/${String(m).padStart(2,'0')} (${months[m-1]}) — ${period.id.substring(0,8)}...`);
  }
}

// ── Step 5: Import billing data (11 months from /tmp/billing_converted) ─

async function login() {
  const res = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'Owner@12345' }),
  });
  const cookies = res.headers.getSetCookie();
  const sc = cookies.find(c => c.startsWith('auth_session')) || '';
  return sc.split(';')[0].replace('auth_session=', '').trim();
}

async function importMonth(sessionCookie, monthNum) {
  const filePath = `D:/tmp/billing_converted/month_${monthNum}.xlsx`;
  if (!fs.existsSync(filePath)) {
    console.log(`  Month ${monthNum}: FILE NOT FOUND`);
    return false;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const boundary = crypto.randomBytes(16).toString('hex');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="month_${monthNum}.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="forceImport"\r\n\r\ntrue\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch('http://localhost:3001/api/billing/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Cookie': `auth_session=${sessionCookie}` },
    body,
  });
  const data = await res.json();
  if (!data.success) {
    console.log(`  Month ${monthNum}: Preview failed — ${data.error?.message}`);
    return false;
  }

  const batchId = data.data?.batch?.id;
  if (!batchId) return false;

  const execRes = await fetch('http://localhost:3001/api/billing/import/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': `auth_session=${sessionCookie}` },
    body: JSON.stringify({ batchId }),
  });
  const execData = await execRes.json();
  if (execData.success) {
    console.log(`  Month ${monthNum}: ✓ (${data.data.batch.totalRows} rows)`);
    return true;
  } else {
    console.log(`  Month ${monthNum}: Execute failed — ${execData.error?.message}`);
    return false;
  }
}

// ── Step 6: Generate invoices ────────────────────────────────────────────

async function generateInvoices(sessionCookie) {
  console.log('\n=== GENERATING INVOICES ===');
  const periods = await prisma.billingPeriod.findMany({ orderBy: [{ year: 'asc' }, { month: 'asc' }] });
  let total = 0;
  for (const p of periods) {
    const res = await fetch('http://localhost:3001/api/billing/wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `auth_session=${sessionCookie}` },
      body: JSON.stringify({ action: 'lock-and-generate', periodId: p.id }),
    });
    const d = await res.json();
    const g = d.success ? (d.data?.generated || 0) : 0;
    if (g > 0) total += g;
    console.log(`  2025/${String(p.month).padStart(2,'0')}: ${g} invoices`);
  }
  console.log(`  Total: ${total} invoices`);
  return total;
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  ROOM + TENANT SEED                  ║');
  console.log('╚══════════════════════════════════════╝');

  await cleanDB();
  const rooms = await createRooms();

  const { tenantCount, contractCount } = await createTenantsAndContracts(rooms);
  await createBillingPeriods();

  // Import billing data
  const cookie = await login();
  console.log('\n=== IMPORTING BILLING DATA ===');
  const results = [];
  for (let m = 1; m <= 12; m++) {
    const ok = await importMonth(cookie, m);
    results.push({ month: m, ok });
  }

  // Generate invoices
  const invoiceCount = await generateInvoices(cookie);

  // Stats
  const stats = {
    rooms:        await prisma.room.count(),
    occupied:     await prisma.room.count({ where: { roomStatus: 'OCCUPIED' } }),
    vacant:       await prisma.room.count({ where: { roomStatus: 'VACANT' } }),
    tenants:      await prisma.tenant.count(),
    contracts:    await prisma.contract.count(),
    periods:      await prisma.billingPeriod.count(),
    billings:     await prisma.roomBilling.count(),
    invoices:     await prisma.invoice.count(),
  };

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  SEED COMPLETE ✓                    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  Rooms total:     ${stats.rooms}`);
  console.log(`  Occupied:        ${stats.occupied} (${Math.round(stats.occupied/stats.rooms*100)}%)`);
  console.log(`  Vacant:         ${stats.vacant}`);
  console.log(`  Tenants:        ${stats.tenants}`);
  console.log(`  Contracts:      ${stats.contracts}`);
  console.log(`  Billing Pd:     ${stats.periods}`);
  console.log(`  RoomBillings:   ${stats.billings}`);
  console.log(`  Invoices:       ${stats.invoices}`);
  console.log(`  Months imported: ${results.filter(r=>r.ok).length}/12`);

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });