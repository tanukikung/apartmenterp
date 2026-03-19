import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBillingWorkbook, parseAllFloorRows } from '@/modules/billing/import-parser';

/**
 * Build a workbook buffer with a single FLOOR_1 sheet matching the real
 * apartment_excel_template.xlsx structure:
 *   row 0  — title
 *   row 1  — instructions
 *   row 2  — English headers
 *   row 3  — Thai translation labels
 *   row 4+ — data rows
 */
function floorWorkbookBuffer(dataRows: Array<Record<string, unknown>>): Uint8Array {
  const headers = [
    'room', 'recv_account_override_id', 'recv_account_id', 'recv_account_name',
    'recv_bank_name', 'recv_bank_account_no', 'recv_promptpay',
    'rule_override_code', 'rule_code', 'rent_amount',
    'water_mode', 'water_prev', 'water_curr', 'water_units_manual',
    'water_units', 'water_usage_charge', 'water_service_fee_manual',
    'water_service_fee', 'water_total',
    'electric_mode', 'electric_prev', 'electric_curr', 'electric_units_manual',
    'electric_units', 'electric_usage_charge', 'electric_service_fee_manual',
    'electric_service_fee', 'electric_total',
    'furniture_fee', 'other_fee', 'total_due', 'note', 'check_notes', 'room_status',
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    ['FLOOR_1 — title row'],                         // row 0
    ['Instructions row'],                             // row 1
    headers,                                          // row 2 — EN headers
    headers.map(() => 'Thai label'),                  // row 3 — TH labels
    ...dataRows.map((row) => headers.map((h) => row[h] ?? null)), // row 4+
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'FLOOR_1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('parseBillingWorkbook', () => {
  it('parses a normal water+electric row from FLOOR_* sheet', () => {
    const buffer = floorWorkbookBuffer([
      {
        room: '3201',
        rule_code: 'STANDARD',
        recv_account_id: 'ACC_F2',
        rent_amount: 2900,
        water_mode: 'NORMAL',
        water_prev: 2725,
        water_curr: 2734,
        water_units: 9,
        water_usage_charge: 180,
        water_service_fee: 20,
        water_total: 200,
        electric_mode: 'NORMAL',
        electric_prev: 1756,
        electric_curr: 1820,
        electric_units: 64,
        electric_usage_charge: 596,
        electric_service_fee: 20,
        electric_total: 616,
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
    expect(row.waterTotal).toBe(200);
    expect(row.electricMode).toBe('NORMAL');
    expect(row.electricUnits).toBe(64);
    expect(row.electricTotal).toBe(616);
    expect(row.furnitureFee).toBe(300);
    expect(row.totalDue).toBe(4016);
    expect(row.roomStatus).toBe('ACTIVE');
  });

  it('handles MANUAL meter mode', () => {
    const buffer = floorWorkbookBuffer([
      {
        room: '798/1',
        rule_code: 'STANDARD',
        recv_account_id: 'ACC_F1',
        rent_amount: 15500,
        water_mode: 'MANUAL',
        water_units_manual: 12,
        water_service_fee: 20,
        water_total: 260,
        electric_mode: 'MANUAL',
        electric_units_manual: 80,
        electric_service_fee: 20,
        electric_total: 765,
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
        recv_account_id: 'ACC_F3',
        rule_override_code: 'PREMIUM',
        rule_code: 'PREMIUM',
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
      { room: '3201', rule_code: 'STANDARD', recv_account_id: 'ACC_F2', rent_amount: 2900, water_mode: 'NORMAL', electric_mode: 'NORMAL', total_due: 2900, room_status: 'ACTIVE' },
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

    // Add a proper FLOOR_1 sheet
    const ws = XLSX.utils.aoa_to_sheet([
      ['title'],
      ['instructions'],
      ['room','recv_account_id','rule_code','rent_amount','water_mode','electric_mode','total_due','room_status'],
      ['Thai'],
      ['3201','ACC_F2','STANDARD',2900,'NORMAL','NORMAL',2900,'ACTIVE'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'FLOOR_1');

    const buffer: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const result = parseBillingWorkbook(buffer);

    expect(result.floors).toHaveLength(1);
    expect(result.floors[0].sheetName).toBe('FLOOR_1');
    expect(result.totalRows).toBe(1);
  });

  it('parses multiple FLOOR sheets and aggregates via parseAllFloorRows', () => {
    const wb = XLSX.utils.book_new();

    for (const [sheetName, roomNo] of [['FLOOR_2', '3201'], ['FLOOR_3', '3301']]) {
      const ws = XLSX.utils.aoa_to_sheet([
        ['title'], ['instructions'],
        ['room','recv_account_id','rule_code','rent_amount','water_mode','electric_mode','total_due','room_status'],
        ['Thai'],
        [roomNo, 'ACC_F2', 'STANDARD', 2900, 'NORMAL', 'NORMAL', 2900, 'ACTIVE'],
        [roomNo + 'b', 'ACC_F2', 'STANDARD', 2900, 'NORMAL', 'NORMAL', 2900, 'ACTIVE'],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const buffer: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const rows = parseAllFloorRows(buffer);

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.floorSheetName).sort()).toEqual(['FLOOR_2', 'FLOOR_2', 'FLOOR_3', 'FLOOR_3'].sort());
  });
});
