import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBillingWorkbook, parseAllFloorRows } from '@/modules/billing/import-parser';

/**
 * Build a workbook buffer with a single ชั้น_1 sheet matching the real
 * billing_template.xlsx structure (parseBillingWorkbook expects ชั้น_\d+ sheet names):
 *   index 0 — title (skipped by parser)
 *   index 1 — English column headers  ← header row
 *   index 2 — Thai translation labels (skipped by parser)
 *   index 3+ — actual data rows
 */
function floorWorkbookBuffer(dataRows: Array<Record<string, unknown>>): Uint8Array {
  // Must match actual billing_template.xlsx column names exactly
  const headers = [
    'room', 'recv_account_override_id', 'account_id', 'rule_override_code', 'rule_code',
    'rent_amount', 'room_status',
    'water_mode', 'water_prev', 'water_curr', 'water_units', 'water_units_manual',
    'water_charge', 'water_fee', 'water_fee_manual',
    'electric_mode', 'electric_prev', 'electric_curr', 'electric_units', 'electric_units_manual',
    'electric_charge', 'electric_fee', 'electric_fee_manual',
    'furniture_fee', 'other_fee', 'total_due', 'note', 'check_notes',
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    ['ข้อมูลบิล ชั้น 1'],       // index 0 — title (skipped by parser)
    headers,                     // index 1 — EN headers (header row)
    headers.map(() => 'Thai'),   // index 2 — TH labels (skipped)
    ...dataRows.map((row) => headers.map((h) => row[h] ?? null)), // index 3+
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ชั้น_1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('parseBillingWorkbook', () => {
  it('parses a normal water+electric row from FLOOR_* sheet', () => {
    const buffer = floorWorkbookBuffer([
      {
        room: '3201',
        account_id: 'ACC_F2',
        rule_code: 'STANDARD',
        rent_amount: 2900,
        water_mode: 'NORMAL',
        water_prev: 2725,
        water_curr: 2734,
        water_units: 9,
        water_charge: 180,
        water_fee: 20,
        electric_mode: 'NORMAL',
        electric_prev: 1756,
        electric_curr: 1820,
        electric_units: 64,
        electric_charge: 596,
        electric_fee: 20,
        furniture_fee: 300,
        other_fee: 0,
        total_due: 4016,
        note: null,
        check_notes: null,
        room_status: 'ACTIVE',
      },
    ]);

    const result = parseBillingWorkbook(buffer);

    expect(result.totalRows).toBe(1);
    expect(result.totalErrors).toBe(0);

    const row = result.floors[0].rows[0];
    expect(row.roomNo).toBe('3201');
    expect(row.waterMode).toBe('NORMAL');
    expect(row.waterPrev).toBe(2725);
    expect(row.waterCurr).toBe(2734);
    expect(row.waterUnits).toBe(9);
    // waterTotal = water_charge + water_fee = 180 + 20 = 200
    expect(row.waterTotal).toBe(200);
    expect(row.electricMode).toBe('NORMAL');
    expect(row.electricUnits).toBe(64);
    // electricTotal = electric_charge + electric_fee = 596 + 20 = 616
    expect(row.electricTotal).toBe(616);
    expect(row.furnitureFee).toBe(300);
    expect(row.totalDue).toBe(4016);
    expect(row.roomStatus).toBe('ACTIVE');
  });

  it('handles MANUAL meter mode', () => {
    const buffer = floorWorkbookBuffer([
      {
        room: '798/1',
        account_id: 'ACC_F1',
        rule_code: 'STANDARD',
        rent_amount: 15500,
        water_mode: 'MANUAL',
        water_units_manual: 12,
        water_charge: 240,
        water_fee: 20,
        water_fee_manual: 20,
        electric_mode: 'MANUAL',
        electric_units_manual: 80,
        electric_charge: 745,
        electric_fee: 20,
        electric_fee_manual: 20,
        total_due: 16525,
        room_status: 'ACTIVE',
      },
    ]);

    const result = parseBillingWorkbook(buffer);

    expect(result.totalRows).toBe(1);
    const row = result.floors[0].rows[0];
    expect(row.waterMode).toBe('MANUAL');
    expect(row.waterUnitsManual).toBe(12);
    expect(row.electricMode).toBe('MANUAL');
    expect(row.electricUnitsManual).toBe(80);
  });

  it('handles account and rule overrides', () => {
    const buffer = floorWorkbookBuffer([
      {
        room: '3201',
        recv_account_override_id: 'ACC_F3',
        account_id: 'ACC_DEFAULT',
        rule_override_code: 'PREMIUM',
        rule_code: 'DEFAULT',
        rent_amount: 3500,
        water_mode: 'NORMAL',
        electric_mode: 'NORMAL',
        total_due: 3500,
        room_status: 'ACTIVE',
      },
    ]);

    const row = parseBillingWorkbook(buffer).floors[0].rows[0];
    expect(row.recvAccountOverrideId).toBe('ACC_F3');
    expect(row.ruleOverrideCode).toBe('PREMIUM');
  });

  it('skips blank rows', () => {
    const buffer = floorWorkbookBuffer([
      { room: '3201', account_id: 'ACC_F2', rule_code: 'STANDARD', rent_amount: 2900, water_mode: 'NORMAL', electric_mode: 'NORMAL', total_due: 2900, room_status: 'ACTIVE' },
      { room: null },   // blank — should be skipped
      { room: '' },     // blank
    ]);

    const result = parseBillingWorkbook(buffer);
    expect(result.totalRows).toBe(1);
  });

  it('ignores non-FLOOR sheets (CONFIG, ACCOUNTS, RULES, etc.)', () => {
    const wb = XLSX.utils.book_new();

    // Add a CONFIG sheet (should be ignored)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ key: 'value' }]), 'CONFIG');

    // Add a proper ชั้น_1 sheet
    const headers = ['room', 'account_id', 'rule_code', 'rent_amount', 'water_mode', 'electric_mode', 'total_due', 'room_status'];
    const ws = XLSX.utils.aoa_to_sheet([
      ['ข้อมูลบิล ชั้น 1'],  // index 0 — title (skipped)
      headers,                  // index 1 — headers (header row)
      headers.map(() => 'Thai'), // index 2 — TH labels (skipped)
      ['3201', 'ACC_F2', 'STANDARD', 2900, 'NORMAL', 'NORMAL', 2900, 'ACTIVE'], // index 3+ — data
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'ชั้น_1');

    const buffer: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const result = parseBillingWorkbook(buffer);

    expect(result.floors).toHaveLength(1);
    expect(result.floors[0].sheetName).toBe('ชั้น_1');
    expect(result.totalRows).toBe(1);
  });

  it('parses multiple ชั้น sheets and aggregates via parseAllFloorRows', () => {
    const wb = XLSX.utils.book_new();
    const headers = ['room', 'account_id', 'rule_code', 'rent_amount', 'water_mode', 'electric_mode', 'total_due', 'room_status'];

    for (const [sheetName, roomNo] of [['ชั้น_2', '3201'], ['ชั้น_3', '3301']]) {
      const ws = XLSX.utils.aoa_to_sheet([
        ['ข้อมูลบิล ชั้น 1'],  // index 0
        headers,                  // index 1
        headers.map(() => 'Thai'), // index 2
        [roomNo, 'ACC_F2', 'STANDARD', 2900, 'NORMAL', 'NORMAL', 2900, 'ACTIVE'], // index 3
        [roomNo + 'b', 'ACC_F2', 'STANDARD', 2900, 'NORMAL', 'NORMAL', 2900, 'ACTIVE'], // index 4
      ]);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const buffer: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const rows = parseAllFloorRows(buffer);

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.floorSheetName).sort()).toEqual(['ชั้น_2', 'ชั้น_2', 'ชั้น_3', 'ชั้น_3'].sort());
  });
});
