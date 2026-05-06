/**
 * Comprehensive Base Data Seeder (Pure JS)
 * Usage: node scripts/seed_full_system.js
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const prisma = new PrismaClient();

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function runPython(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-c', script], {
      cwd: 'D:/apartment_erp', shell: true,
    });
    let out = '', err = '';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('close', code => code === 0 ? resolve(out) : reject(new Error(err || out)));
  });
}

async function apiLogin() {
  const res = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'Owner@12345' }),
  });
  const cookies = res.headers.getSetCookie();
  const sessionCookie = cookies.find(c => c.startsWith('auth_session')) || '';
  return sessionCookie.split(';')[0].replace('auth_session=', '').trim();
}

async function apiPost(path, body, sessionCookie) {
  const res = await fetch('http://localhost:3001' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': 'auth_session=' + sessionCookie,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Step 1: Clean DB ────────────────────────────────────────────────────────

async function cleanDB() {
  console.log('\n=== STEP 1: CLEAN DATABASE ===');
  const modelNames = [
    'paymentMatchReview', 'paymentMatchDecision', 'paymentMatch',
    'paymentTransaction', 'paymentHistory',
    'roomBilling', 'invoice',
    'billingPeriodCloseEvent', 'billingPeriod',
    'importBatch', 'importSession',
    'maintenanceTicket',
    'roomTenant', 'contract',
    'tenant',
    'outboxMessage', 'auditLog',
  ];

  for (const modelName of modelNames) {
    try {
      const m = prisma[modelName];
      if (m) await m.deleteMany();
    } catch (e) {
      // ignore
    }
  }

  await prisma.room.updateMany({ data: { roomStatus: 'VACANT' } });
  // Reset billing periods to OPEN so they can be re-imported
  await prisma.billingPeriod.updateMany({ data: { status: 'OPEN' } });
  // Clear old import sessions/batches
  await prisma.importBatch.deleteMany({});
  await prisma.importSession.deleteMany({});
  await prisma.roomBilling.deleteMany({});
  console.log('  OK: DB cleared, rooms → VACANT, periods reset');
}

// ── Step 2: Base data ───────────────────────────────────────────────────────

async function getBaseData() {
  console.log('\n=== STEP 2: GATHER BASE DATA ===');
  const rooms = await prisma.room.findMany({ orderBy: { roomNo: 'asc' } });
  console.log('  OK: ' + rooms.length + ' rooms');
  return { rooms };
}

// ── Step 3: Create tenants + contracts ───────────────────────────────────────

const THAI_FIRST = ['สมชาย', 'สมหญิง', 'วิชัย', 'นงลัก', 'ประเสริฐ', 'พิชญา', 'ธนา', 'ศิริ', 'อนันต์', 'จิรา', 'ชัยวัฒน์', 'มาลี', 'ประชัน', 'วรพล', 'ฐาปนา', 'นพดล', 'สุชาติ', 'ทรงชัย', 'เอกชัย', 'ธีระ'];
const THAI_LAST  = ['ใจดี', 'สุขสวัสดิ์', 'รุ่งเรือง', 'วิเศษ', 'พลาสุข', 'โพธิ์ทอง', 'เจริญ', 'ดีสุข', 'ชำนาญ', 'เกษม', 'ปราณี', 'ศักดิ์สิทธิ์', 'วัฒนา', 'สุนทร', 'บุญมี', 'ธรรมา', 'พัฒนา', 'สมบัติ', 'ศรีสุข', 'เต็มใจ'];

function pad(num, size) {
  let s = String(num);
  while (s.length < size) s = '0' + s;
  return s;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function createBaseData(rooms) {
  console.log('\n=== STEP 3: CREATE TENANTS + CONTRACTS ===');

  // Group rooms by floor
  const byFloor = {};
  for (const r of rooms) {
    let floor;
    if (r.roomNo.includes('/')) {
      floor = parseInt(r.roomNo.split('/')[1] || '1');
    } else {
      floor = parseInt(String(r.roomNo).substring(0, 1));
    }
    if (!byFloor[floor]) byFloor[floor] = [];
    byFloor[floor].push(r);
  }

  let tenantCount = 0;
  let vacantCount = 0;
  let contractCount = 0;

  for (const [floor, floorRooms] of Object.entries(byFloor)) {
    for (const room of floorRooms) {
      if (Math.random() < 0.12) {
        vacantCount++;
        continue;
      }

      const firstName = THAI_FIRST[tenantCount % THAI_FIRST.length];
      const lastName  = THAI_LAST[tenantCount % THAI_LAST.length];
      const phone     = '08' + pad(randInt(1000000, 9999999), 7);

      const tenant = await prisma.tenant.create({
        data: {
          firstName,
          lastName,
          phone,
          email: null,
          emergencyContact: THAI_FIRST[(tenantCount + 1) % THAI_FIRST.length] + ' ' + THAI_LAST[(tenantCount + 2) % THAI_LAST.length],
          emergencyPhone: '08' + pad(randInt(1000000, 9999999), 7),
        }
      });

      await prisma.roomTenant.create({
        data: {
          roomNo: room.roomNo,
          tenantId: tenant.id,
          role: 'PRIMARY',
          moveInDate: new Date('2025-01-01'),
        }
      });

      const rentAmt = parseFloat(String(room.defaultRentAmount || '2900'));
      await prisma.contract.create({
        data: {
          roomNo: room.roomNo,
          primaryTenantId: tenant.id,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          monthlyRent: rentAmt,
          deposit: rentAmt * 2,
          status: 'ACTIVE',
        }
      });

      await prisma.room.update({
        where: { roomNo: room.roomNo },
        data: { roomStatus: 'OCCUPIED' },
      });

      tenantCount++;
      contractCount++;
    }
  }

  console.log('  OK: ' + tenantCount + ' tenants, ' + contractCount + ' contracts, ' + vacantCount + ' vacant');
  return { tenantCount, contractCount, vacantCount };
}

// ── Step 4: Convert Excel files ─────────────────────────────────────────────

async function convertExcelFiles() {
  console.log('\n=== STEP 4: CONVERT EXCEL FILES ===');

  const script = `
import openpyxl, os, sys
sys.stdout.reconfigure(encoding='utf-8')

SRC = r'C:/Users/bccbo/Downloads/data12months'
OUT = r'D:/tmp/billing_converted'
os.makedirs(OUT, exist_ok=True)

FLOOR_MAP = {
    'ชั้น 1':'ชั้น_1','ชั้น 2':'ชั้น_2','ชั้น 3':'ชั้น_3',
    'ชั้น 4':'ชั้น_4','ชั้น 5':'ชั้น_5','ชั้น 6':'ชั้น_6',
    'ชั้น 7':'ชั้น_7','ชั้น 8':'ชั้น_8',
}

HEADERS = ['room','account_id','rule_code','rent_amount','room_status',
    'water_mode','water_prev','water_curr','water_units','water_units_manual',
    'water_charge','water_fee','water_fee_manual',
    'electric_mode','electric_prev','electric_curr','electric_units','electric_units_manual',
    'electric_charge','electric_fee','electric_fee_manual',
    'furniture_fee','other_fee','total_due','note','check_notes','_helpers']

THAI_LABELS = ['เลขห้อง','บัญชีรับเงิน','กฎ billing','ค่าเช่า (กรอกเอง)','สถานะ',
    'โหมดน้ำ','น้ำก่อน','น้ำหลัง','ใช้น้ำ','units น้ำ(manual)',
    'ค่าน้ำ','ค่าบริการน้ำ','ค่าบริการน้ำ(M)',
    'โหมดไฟ','ไฟก่อน','ไฟหลัง','ใช้ไฟ','units ไฟ(manual)',
    'ค่าไฟ','ค่าบริการไฟ','ค่าบริการไฟ(M)',
    'ค่าเฟอร์','อื่นๆ','รวมเงิน','หมายเหตุ','ตรวจสอบ','(hidden)']

def get_room(row):
    if len(row) <= 1 or row[1] is None: return None
    v = row[1]
    if isinstance(v, float): v = int(v)
    return str(v).strip()

def sf(v):
        if v is None: return 0
        if isinstance(v, (int, float)): return float(v)
        s = str(v).strip()
        return float(s) if s and s not in ('', ' ') else 0

def conv_row(row, acc):
    if not row or len(row) < 19: return None
    room = get_room(row)
    if not room: return None
    rent = sf(row[5]) if len(row) > 5 else 0
    if rent == 0 or rent is None:
        note = row[19] if len(row) > 19 else None
        if note and ('ว่าง' in str(note)): return None
        return None
    wp = int(sf(row[6]))  if row[6]  is not None else 0
    wc = int(sf(row[7]))  if row[7]  is not None else 0
    wu = int(sf(row[8]))  if row[8]  is not None else 0
    wch= sf(row[10])
    ep = int(sf(row[11])) if row[11] is not None else 0
    ec = int(sf(row[12])) if row[12] is not None else 0
    eu = int(sf(row[13])) if row[13] is not None else 0
    ech= sf(row[15])
    furn = sf(row[16]) if len(row) > 16 else 0
    other= sf(row[17]) if len(row) > 17 else 0
    total= sf(row[18]) if len(row) > 18 else 0
    note = str(row[19]) if len(row) > 19 and row[19] is not None else ''
    wm = 'NORMAL' if not(wu == 0 and wch == 0) else 'DISABLED'
    em = 'NORMAL' if not(eu == 0 and ech == 0) else 'DISABLED'
    wf = 50 if wm == 'NORMAL' else 0
    ef = 50 if em == 'NORMAL' else 0
    return [room, acc, 'DEFAULT', float(rent), 'ACTIVE',
        wm, wp, wc, wu, None, wch, wf, None,
        em, ep, ec, eu, None, ech, ef, None,
        furn, other, total, note, None, None]

def make_file(month_num, src_path):
    from openpyxl import Workbook
    wb_src = openpyxl.load_workbook(src_path, read_only=True, data_only=True)
    wb = Workbook()
    wb.remove(wb.active)

    # CONFIG
    ws = wb.create_sheet('CONFIG')
    for row in [
        ['การตั้งค่าการออกบิล', None],
        ['ปี (ค.ศ.)', 2025],
        ['เดือน (1-12)', month_num],
        ['บัญชีรับเงิน (default)', 'ACC_F1'],
        ['กฎ billing (default)', 'DEFAULT'],
        ['โหมดน้ำ (default)', 'NORMAL'],
        ['โหมดไฟ (default)', 'NORMAL'],
        ['อัตราน้ำ fallback (บาท/หน่วย)', 20],
        ['ค่าน้ำขั้นต่ำ fallback (บาท)', 120],
        ['อัตราไฟ fallback (บาท/หน่วย)', 20],
        ['ค่าไฟขั้นต่ำ fallback (บาท)', 65],
    ]: ws.append(row)

    # ACCOUNTS
    ws = wb.create_sheet('ACCOUNTS')
    for row in [
        ['บัญชีรับเงิน (ACCOUNTS)', None, None, None, None, None],
        ['id', 'account_name', 'bank', 'account_number', 'is_default', 'note'],
        ['รหัส', 'ชื่อบัญชี', 'ธนาคาร', 'หมายเลขบัญชี', 'ค่าเริ่มต้น', 'หมายเหตุ'],
        ['ACC_F1','ชั้น 1 - กสิกรไทย','ธนาคารกสิกรไทย','xxx-x-xxxxx-x','YES','ชั้น 1'],
        ['ACC_F2','ชั้น 2 - กสิกรไทย','ธนาคารกสิกรไทย','xxx-x-xxxxx-x','NO','ชั้น 2'],
        ['ACC_F3','ชั้น 3 - กสิกรไทย','ธนาคารกสิกรไทย','xxx-x-xxxxx-x','NO','ชั้น 3'],
        ['ACC_F4','ชั้น 4 - กสิกรไทย','ธนาคารกสิกรไทย','xxx-x-xxxxx-x','NO','ชั้น 4'],
        ['ACC_F5','ชั้น 5 - กสิกรไทย','ธนาคารกสิกรไทย','xxx-x-xxxxx-x','NO','ชั้น 5'],
        ['ACC_F6','ชั้น 6 - กสิกรไทย','ธนาคารกสิกรไทย','xxx-x-xxxxx-x','NO','ชั้น 6'],
        ['ACC_F7','ชั้น 7 - กสิกรไทย','ธนาคารกสิกรไทย','xxx-x-xxxxx-x','NO','ชั้น 7'],
        ['ACC_F8','ชั้น 8 - กสิกรไทย','ธนาคารกสิกรไทย','xxx-x-xxxxx-x','NO','ชั้น 8'],
    ]: ws.append(row)

    # RULES
    ws = wb.create_sheet('RULES')
    ws.append(['กฎการคิดค่าน้ำค่าไฟ (RULES)'] + [None]*28)
    ws.append(['code','description','water_mode','water_rate','water_min_charge','water_flat_amount',
        'water_s1_upto','water_s1_rate','water_s2_upto','water_s2_rate','water_s3_upto','water_s3_rate',
        'water_fee_mode','water_fee_amount','water_fee_per_unit',
        'electric_mode','electric_rate','electric_min_charge','electric_flat_amount',
        'electric_s1_upto','electric_s1_rate','electric_s2_upto','electric_s2_rate','electric_s3_upto','electric_s3_rate',
        'electric_fee_mode','electric_fee_amount','electric_fee_per_unit','note'])
    ws.append(['รหัส','คำอธิบาย','โหมดน้ำ','อัตราน้ำ','ค่าน้ำขั้นต่ำ','ค่าน้ำ(FLAT)',
        's1 ถึง','s1 rate','s2 ถึง','s2 rate','s3 ถึง','s3 rate',
        'ค่าบริการน้ำ','จำนวน(FLAT)','ต่อหน่วย',
        'โหมดไฟ','อัตราไฟ','ค่าไฟขั้นต่ำ','ค่าไฟ(FLAT)',
        's1 ถึง','s1 rate','s2 ถึง','s2 rate','s3 ถึง','s3 rate',
        'ค่าบริการไฟ','จำนวน(FLAT)','ต่อหน่วย','หมายเหตุ'])
    for row in [
        ('DEFAULT','กฎปกติทั่วไป','NORMAL',20,120,None,None,None,None,None,None,None,'FLAT',50,None,'NORMAL',20,65,None,None,None,None,None,None,None,'FLAT',50,None,'กฎมาตรฐาน'),
        ('OWNER','ห้องเจ้าของ','DISABLED',None,None,None,None,None,None,None,None,None,'NONE',None,None,'DISABLED',None,None,None,None,None,None,None,None,None,'NONE',None,None,'ยกเว้นน้ำไฟ'),
        ('NO_WATER','ไม่มีน้ำ','DISABLED',None,None,None,None,None,None,None,None,None,'NONE',None,None,'NORMAL',8,65,None,None,None,None,None,None,None,'FLAT',50,None,None),
        ('NO_ELECTRIC','ไม่มีไฟ','NORMAL',18,120,None,None,None,None,None,None,None,'FLAT',50,None,'DISABLED',None,None,None,None,None,None,None,None,None,'NONE',None,None,None),
    ]: ws.append(list(row))

    # Floor sheets
    for src_name in wb_src.sheetnames:
        canonical = FLOOR_MAP.get(src_name, src_name)
        if not canonical.startswith('ชั้น'): continue
        floor_num = int(canonical.split('_')[1])
        acc = 'ACC_F' + str(floor_num)

        ws = wb.create_sheet(canonical)
        ws.append(['ข้อมูลบิล ' + canonical.replace('_', ' ')])
        ws.append(HEADERS)
        ws.append(THAI_LABELS)

        count = 0
        for row in list(wb_src[src_name].iter_rows(values_only=True))[2:]:
            converted = conv_row(list(row), acc)
            if converted:
                ws.append(converted)
                count += 1
        print('  ' + canonical + ': ' + str(count) + ' rows')

    out_path = os.path.join(OUT, 'month_' + str(month_num) + '.xlsx')
    wb.save(out_path)
    return out_path

if __name__ == '__main__':
    for m in range(1, 13):
        src = os.path.join(SRC, 'เดือน' + str(m) + '.xlsx')
        print('Month ' + str(m) + ':', end=' ')
        try:
            p = make_file(m, src)
            print('OK')
        except Exception as e:
            print('FAILED: ' + str(e))
            import traceback; traceback.print_exc()
`;

  const tmpPath = 'D:/tmp/convert_billing.py';
  fs.writeFileSync(tmpPath, script, 'utf8');
  const { spawn } = require('child_process');
  const child = spawn('python', [tmpPath], { cwd: 'D:/apartment_erp', shell: true });
  let out = '', err = '';
  child.stdout.on('data', d => out += d.toString());
  child.stderr.on('data', d => err += d.toString());
  return new Promise((resolve, reject) => {
    child.on('close', code => code === 0 ? resolve(out) : reject(new Error(err || out)));
  });
}

// ── Step 5: Import months via API ───────────────────────────────────────────

async function importAllMonths(sessionCookie) {
  console.log('\n=== STEP 5: IMPORT MONTHLY DATA ===');
  const outDir = 'D:/tmp/billing_converted';
  const imported = [];

  for (let m = 1; m <= 12; m++) {
    const filePath = path.join(outDir, 'month_' + m + '.xlsx');
    if (!fs.existsSync(filePath)) {
      console.log('  Month ' + m + ': FILE NOT FOUND');
      continue;
    }

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const boundary = crypto.randomBytes(16).toString('hex');
      const body = Buffer.concat([
        Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="month_' + m + '.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'),
        fileBuffer,
        Buffer.from('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="forceImport"\r\n\r\ntrue\r\n--' + boundary + '--\r\n'),
      ]);

      const res = await fetch('http://localhost:3001/api/billing/import/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Cookie': 'auth_session=' + sessionCookie,
        },
        body,
      });

      const data = await res.json();
      if (!data.success) {
        console.log('  Month ' + m + ': Preview failed — ' + (data.error && data.error.message));
        continue;
      }

      const batchId = data.data && data.data.batch && data.data.batch.id;
      if (!batchId) { console.log('  Month ' + m + ': No batch ID'); continue; }

      const batch = data.data.batch;
      console.log('  Month ' + m + ': batch ' + batchId + ' — ' + batch.totalRows + ' rows, ' + batch.validRows + ' valid, ' + batch.invalidRows + ' invalid');

      const execRes = await fetch('http://localhost:3001/api/billing/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': 'auth_session=' + sessionCookie },
        body: JSON.stringify({ batchId }),
      });
      const execData = await execRes.json();
      if (execData.success) {
        console.log('  Month ' + m + ': OK');
        imported.push(m);
      } else {
        console.log('  Month ' + m + ': Commit failed — ' + (execData.error && execData.error.message));
      }
    } catch (e) {
      console.log('  Month ' + m + ': ERROR ' + e.message);
    }
  }

  console.log('\n  Imported: ' + imported.length + '/12 months [' + imported.join(', ') + ']');
  return imported;
}

// ── Step 6: Generate invoices ───────────────────────────────────────────────

async function generateAllInvoices(sessionCookie) {
  console.log('\n=== STEP 6: GENERATE INVOICES ===');
  const periods = await prisma.billingPeriod.findMany({ orderBy: [{ year: 'asc' }, { month: 'asc' }] });
  let totalGen = 0;

  for (const period of periods) {
    const res = await apiPost('/api/billing/wizard', {
      action: 'lock-and-generate',
      periodId: period.id,
    }, sessionCookie);

    if (res.success) {
      const g = res.data.generated || 0;
      console.log('  ' + period.year + '/' + String(period.month).padStart(2,'0') + ': ' + g + ' invoices');
      totalGen += g;
    } else {
      console.log('  ' + period.year + '/' + period.month + ': ' + (res.error && res.error.message));
    }
  }

  console.log('  Total: ' + totalGen + ' invoices');
  return totalGen;
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   FULL SYSTEM SEED                         ║');
  console.log('╚══════════════════════════════════════════╝');

  await cleanDB();
  const { rooms } = await getBaseData();
  await createBaseData(rooms);
  await convertExcelFiles();

  const sessionCookie = await apiLogin();
  console.log('\n  Session ready');
  await importAllMonths(sessionCookie);
  await generateAllInvoices(sessionCookie);

  const stats = {
    tenants:   await prisma.tenant.count(),
    contracts: await prisma.contract.count(),
    periods:   await prisma.billingPeriod.count(),
    billings:  await prisma.roomBilling.count(),
    invoices:  await prisma.invoice.count(),
    occupied:  await prisma.room.count({ where: { roomStatus: 'OCCUPIED' } }),
  };

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   SEED COMPLETE                             ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('  Tenants:      ' + stats.tenants);
  console.log('  Contracts:    ' + stats.contracts);
  console.log('  Occupied:     ' + stats.occupied);
  console.log('  Periods:      ' + stats.periods);
  console.log('  Billings:     ' + stats.billings);
  console.log('  Invoices:     ' + stats.invoices);

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });