/**
 * Generate a billing_template.xlsx for system testing.
 * Creates sheets: CONFIG, ACCOUNTS, RULES, ชั้น_1 … ชั้น_8
 * Uses aoa_to_sheet for reliable cell generation.
 */

const XLSX = require('xlsx');

const WORKBOOK_COLS = [
  'room', 'rent_amount',
  'water_mode', 'water_prev', 'water_curr', 'water_units', 'water_units_manual',
  'water_charge', 'water_fee', 'water_fee_manual',
  'electric_mode', 'electric_prev', 'electric_curr', 'electric_units', 'electric_units_manual',
  'electric_charge', 'electric_fee', 'electric_fee_manual',
  'furniture_fee', 'other_fee', 'total_due',
  'note', 'check_notes', 'room_status',
  'account_id', 'rule_code',
];

const TH_LABELS = [
  'ห้อง', 'ค่าเช่า',
  'โหมดน้ำ', 'น้ำก่อน', 'น้ำหลัง', 'หน่วยน้ำ', 'หน่วยน้ำ (manual)',
  'ค่าน้ำ', 'ค่าบริการน้ำ', 'ค่าบริการน้ำ (manual)',
  'โหมดไฟ', 'ไฟก่อน', 'ไฟหลัง', 'หน่วยไฟ', 'หน่วยไฟ (manual)',
  'ค่าไฟ', 'ค่าบริการไฟ', 'ค่าบริการไฟ (manual)',
  'เฟอร์', 'อื่นๆ', 'รวม',
  'หมายเหตุ', 'ตรวจสอบ', 'สถานะห้อง',
  'บัญชีรับเงิน', 'กฎ billing',
];

const ACCOUNTS_HEADERS = ['id', 'account_name', 'bank', 'account_number', 'is_default', 'note'];
const RULES_HEADERS = [
  'code', 'description',
  'water_mode', 'water_rate', 'water_min_charge', 'water_flat_amount',
  'water_s1_upto', 'water_s1_rate', 'water_s2_upto', 'water_s2_rate', 'water_s3_upto', 'water_s3_rate',
  'water_fee_mode', 'water_fee_amount', 'water_fee_per_unit',
  'electric_mode', 'electric_rate', 'electric_min_charge', 'electric_flat_amount',
  'electric_s1_upto', 'electric_s1_rate', 'electric_s2_upto', 'electric_s2_rate', 'electric_s3_upto', 'electric_s3_rate',
  'electric_fee_mode', 'electric_fee_amount', 'electric_fee_per_unit',
  'note',
];

// [room, rent, waterPrev, waterCurr, elecPrev, elecCurr, waterCharge, waterFee, elecCharge, elecFee, furn, other, total, note, status]
const FLOOR_DATA = {
  'ชั้น_1': [
    ['101', 15000, 1123, 1156, 1823, 1891, 660, 50, 1360, 120, 0, 0, 3190, null, 'ACTIVE'],
    ['102', 15000, 1156, 1198, 1891, 2012, 840, 50, 2420, 120, 0, 0, 5430, null, 'ACTIVE'],
    ['103', 15000, 1198, 1245, 2012, 2089, 940, 50, 1540, 120, 0, 0, 4650, null, 'ACTIVE'],
    ['104', 15000, null, null, 2089, 2156, 0, 0, 1340, 120, 0, 0, 3460, 'มิเตอร์น้ำเสีย', 'ACTIVE'],
    ['105', 15000, 1245, 1289, 2156, 2234, 880, 50, 1560, 120, 0, 0, 4610, null, 'ACTIVE'],
  ],
  'ชั้น_2': [
    ['201', 15000, 1289, 1334, 2234, 2312, 900, 50, 1560, 120, 0, 0, 4630, null, 'ACTIVE'],
    ['202', 15000, 1334, 1389, 2312, 2478, 1100, 50, 3320, 120, 0, 0, 6590, null, 'ACTIVE'],
    ['203', 15000, 1389, 1445, 2478, 2567, 1120, 50, 1780, 120, 0, 0, 5070, null, 'ACTIVE'],
    ['204', 15000, 1445, 1498, 2567, 2634, 1060, 50, 1340, 120, 0, 0, 4570, null, 'ACTIVE'],
    ['205', 0, 1498, 1523, 2634, 2689, 500, 50, 1100, 120, 0, 0, 2670, 'ห้องว่าง', 'INACTIVE'],
  ],
  'ชั้น_3': [
    ['301', 15000, 1523, 1578, 2689, 2789, 1100, 50, 2000, 120, 0, 0, 5270, null, 'ACTIVE'],
    ['302', 15000, 1578, 1645, 2789, 2967, 1340, 50, 3560, 120, 0, 0, 7070, null, 'ACTIVE'],
    ['303', 15000, 1645, 1712, 2967, 3123, 1340, 50, 3120, 120, 0, 0, 6630, null, 'ACTIVE'],
    ['304', 15000, 1712, 1789, 3123, 3267, 1540, 50, 2880, 120, 0, 0, 6590, null, 'ACTIVE'],
    ['305', 15000, 1789, 1845, 3267, 3345, 1120, 50, 1560, 120, 0, 0, 4850, null, 'ACTIVE'],
  ],
  'ชั้น_4': [
    ['401', 18000, 1845, 1898, 3345, 3423, 1060, 50, 1560, 120, 0, 0, 4790, null, 'ACTIVE'],
    ['402', 18000, 1898, 1967, 3423, 3589, 1380, 50, 3320, 120, 0, 0, 6870, null, 'ACTIVE'],
    ['403', 18000, 1967, 2045, 3589, 3767, 1560, 50, 3560, 120, 0, 0, 7290, null, 'ACTIVE'],
    ['404', 18000, 2045, 2123, 3767, 3956, 1560, 50, 3780, 120, 0, 0, 7510, null, 'ACTIVE'],
    ['405', 18000, 2123, 2189, 3956, 4078, 1320, 50, 2440, 120, 0, 0, 5930, null, 'ACTIVE'],
  ],
  'ชั้น_5': [
    ['501', 18000, 2189, 2256, 4078, 4178, 1340, 50, 2000, 120, 0, 0, 5510, null, 'ACTIVE'],
    ['502', 18000, 2256, 2345, 4178, 4389, 1780, 50, 4220, 120, 0, 0, 8170, null, 'ACTIVE'],
    ['503', 18000, 2345, 2434, 4389, 4567, 1780, 50, 3560, 120, 0, 0, 7510, null, 'ACTIVE'],
    ['504', 18000, 2434, 2512, 4567, 4678, 1560, 50, 2220, 120, 0, 0, 5950, null, 'ACTIVE'],
    ['505', 18000, 2512, 2589, 4678, 4789, 1540, 50, 2220, 120, 0, 0, 5930, null, 'ACTIVE'],
  ],
  'ชั้น_6': [
    ['601', 20000, 2589, 2678, 4789, 4989, 1780, 50, 4000, 120, 0, 0, 7950, null, 'ACTIVE'],
    ['602', 20000, 2678, 2789, 4989, 5267, 2220, 50, 5560, 120, 0, 0, 9950, null, 'ACTIVE'],
    ['603', 20000, 2789, 2898, 5267, 5567, 2180, 50, 6000, 120, 0, 0, 10350, null, 'ACTIVE'],
    ['604', 20000, 2898, 3012, 5567, 5878, 2280, 50, 6220, 120, 0, 0, 10670, null, 'ACTIVE'],
    ['605', 20000, 3012, 3123, 5878, 6178, 2220, 50, 6000, 120, 0, 0, 10390, null, 'ACTIVE'],
  ],
  'ชั้น_7': [
    ['701', 20000, 3123, 3234, 6178, 6478, 2220, 50, 6000, 120, 0, 0, 10390, null, 'ACTIVE'],
    ['702', 20000, 3234, 3345, 6478, 6789, 2220, 50, 6220, 120, 0, 0, 10610, null, 'ACTIVE'],
    ['703', 0, 3345, 3389, 6789, 6890, 880, 50, 2020, 120, 0, 0, 3070, 'ห้องว่าง', 'INACTIVE'],
    ['704', 20000, 3389, 3512, 6890, 7212, 2460, 50, 6440, 120, 0, 0, 11070, null, 'ACTIVE'],
    ['705', 20000, 3512, 3645, 7212, 7567, 2660, 50, 7100, 120, 0, 0, 11930, null, 'ACTIVE'],
  ],
  'ชั้น_8': [
    ['801', 22000, 3645, 3789, 7567, 7967, 2880, 50, 8000, 120, 0, 0, 13050, null, 'ACTIVE'],
    ['802', 22000, 3789, 3956, 7967, 8367, 3340, 50, 8000, 120, 0, 0, 13510, null, 'ACTIVE'],
    ['803', 22000, 3956, 4123, 8367, 8789, 3340, 50, 8440, 120, 0, 0, 13950, null, 'ACTIVE'],
    ['804', 22000, 4123, 4289, 8789, 9234, 3320, 50, 8900, 120, 0, 0, 14390, null, 'ACTIVE'],
    ['805', 0, 4289, 4356, 9234, 9489, 1340, 50, 5100, 120, 0, 0, 6610, 'ห้องว่าง', 'INACTIVE'],
  ],
};

function buildFloorSheet(sheetName, rows) {
  const floorNum = sheetName.replace('ชั้น_', '');
  const titleRow = [`ข้อมูลบิล ชั้น ${floorNum}`];
  const headerRow = WORKBOOK_COLS;
  const labelRow = TH_LABELS;

  const dataRows = rows.map(([room, rent, waterPrev, waterCurr, elecPrev, elecCurr, waterCharge, waterFee, elecCharge, elecFee, furn, other, total, note, status]) => {
    const waterUnits = (waterPrev != null && waterCurr != null) ? waterCurr - waterPrev : 0;
    const electricUnits = (elecPrev != null && elecCurr != null) ? elecCurr - elecPrev : 0;
    return [
      room, rent, 'NORMAL', waterPrev, waterCurr, waterUnits, null,
      waterCharge, waterFee, null,
      'NORMAL', elecPrev, elecCurr, electricUnits, null,
      elecCharge, elecFee, null,
      furn, other, total, note, null, status, null, null,
    ];
  });

  const aoa = [titleRow, headerRow, labelRow, ...dataRows];
  return XLSX.utils.aoa_to_sheet(aoa);
}

function buildAccountsSheet() {
  const titleRow = ['บัญชีรับเงิน'];
  const headerRow = ACCOUNTS_HEADERS;
  const labelRow = ['ID', 'ชื่อบัญชี', 'ธนาคาร', 'เลขบัญชี', 'Default?', 'หมายเหตุ'];
  const dataRows = [
    ['ACC-001', 'บัญชีออมทรัพย์ กสิกร', 'K-Bank', '123-456-7890', 'YES', 'บัญชีหลัก'],
    ['ACC-002', 'บัญชีกระแสรายวัน กรุงไทย', 'KBank', '987-654-3210', 'NO', 'สำรอง'],
  ];
  return XLSX.utils.aoa_to_sheet([titleRow, headerRow, labelRow, ...dataRows]);
}

function buildRulesSheet() {
  const titleRow = ['กฎ Billing'];
  const headerRow = RULES_HEADERS;
  const labelRow = ['รหัส', 'คำอธิบาย', 'โหมดน้ำ', 'อัตราน้ำ', 'ขั้นต่ำน้ำ', 'น้ำคงที่',
    'ขอบเขต S1', 'อัตรา S1', 'ขอบเขต S2', 'อัตรา S2', 'ขอบเขต S3', 'อัตรา S3',
    'โหมดค่าน้ำ', 'ค่าน้ำคงที่', 'ค่าน้ำต่อหน่วย',
    'โหมดไฟ', 'อัตราไฟ', 'ขั้นต่ำไฟ', 'ไฟคงที่',
    'ขอบเขต S1', 'อัตรา S1', 'ขอบเขต S2', 'อัตรา S2', 'ขอบเขต S3', 'อัตรา S3',
    'โหมดค่าไฟ', 'ค่าไฟคงที่', 'ค่าไฟต่อหน่วย', 'หมายเหตุ'];
  const dataRows = [
    ['DEFAULT', 'กฎมาตรฐาน',
      'NORMAL', 12.5, 20, 0, 50, 1.5, 100, 2.5, 99999, 4.5,
      'PER_UNIT', 5, 0,
      'NORMAL', 5.5, 20, 0, 100, 3.5, 500, 4.5, 99999, 6.5,
      'PER_UNIT', 5, 0, 'กฎ default'],
    ['FLAT_WATER', 'กฎน้ำคงที่',
      'FLAT', 0, 0, 200, 0, 0, 0, 0, 0, 0,
      'NONE', 0, 0,
      'NORMAL', 5.5, 20, 0, 100, 3.5, 500, 4.5, 99999, 6.5,
      'PER_UNIT', 5, 0, 'น้ำคงที่ 200 บาท'],
  ];
  return XLSX.utils.aoa_to_sheet([titleRow, headerRow, labelRow, ...dataRows]);
}

function buildConfigSheet() {
  const rows = [
    ['ปี (ค.ศ.)', 2026],
    ['เดือน (1-12)', 5],
    ['บัญชีรับเงิน (default)', 'ACC-001'],
    ['กฎ billing (default)', 'DEFAULT'],
    ['โหมดน้ำ (default)', 'NORMAL'],
    ['โหมดไฟ (default)', 'NORMAL'],
    ['อัตราน้ำ fallback (บาท/หน่วย)', 12.5],
    ['ค่าน้ำขั้นต่ำ fallback (บาท)', 20],
    ['อัตราไฟ fallback (บาท/หน่วย)', 5.5],
    ['ค่าไฟขั้นต่ำ fallback (บาท)', 20],
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

// Build workbook
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, buildConfigSheet(), 'CONFIG');
XLSX.utils.book_append_sheet(wb, buildAccountsSheet(), 'ACCOUNTS');
XLSX.utils.book_append_sheet(wb, buildRulesSheet(), 'RULES');

Object.entries(FLOOR_DATA).forEach(([sheetName, rows]) => {
  XLSX.utils.book_append_sheet(wb, buildFloorSheet(sheetName, rows), sheetName);
});

const outPath = 'public/billing_template.xlsx';
XLSX.writeFile(wb, outPath);

// Verify by reading back
const rb = XLSX.readFile(outPath);
console.log('=== Verification ===');
console.log('Sheets:', rb.SheetNames.join(', '));

const floor1 = rb.Sheets['ชั้น_1'];
const ref = floor1['!ref'];
console.log('ชั้น_1 !ref:', ref);
console.log('A1 (title):', JSON.stringify(floor1['A1']));
console.log('A2 (header):', JSON.stringify(floor1['A2']));
console.log('B4 (rent):', JSON.stringify(floor1['B4']));
console.log('D5 (water_prev):', JSON.stringify(floor1['D5']));

const config = rb.Sheets['CONFIG'];
console.log('\nCONFIG rows:', config['!ref']);
console.log('A1:', JSON.stringify(config['A1']));
console.log('B2:', JSON.stringify(config['B2']));

// Count total rows
let total = 0;
rb.SheetNames.filter(n => /^ชั้น_/.test(n)).forEach(name => {
  const s = rb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(s, { header: 1 });
  const dataRows = data.length - 3; // subtract title + header + TH label
  total += dataRows;
  console.log(`${name}: ${dataRows} rooms, !ref=${s['!ref']}`);
});
console.log('\nTotal rooms:', total);
console.log('Written to:', outPath);