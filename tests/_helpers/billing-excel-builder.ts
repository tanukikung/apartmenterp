/**
 * Billing Excel Builder — Generates minimal XLSX billing data for tests.
 *
 * Used by factories.ts to create billing periods + records without the UI.
 * Can also be used directly in tests that need to simulate billing import.
 */

import type { Page } from '@playwright/test';

// ─── XLSX builder ──────────────────────────────────────────────────────────────

/**
 * Builds a minimal billing Excel file with one room on one floor sheet.
 * Room number is unique to prevent parallel collisions.
 */
export function buildBillingExcel(
  year: number,
  month: number,
  roomNo: string,
  rentAmount = 5000
): Uint8Array {
  // Dynamic import to avoid bundling issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');

  const rows: unknown[][] = [
    // Row 0: title
    [`ข้อมูลบิล ชั้น 1 เดือน ${month}/${year}`],
    // Row 1: English headers
    [
      'room', 'rent_amount',
      'water_mode', 'water_prev', 'water_curr', 'water_units', 'water_charge', 'water_fee', 'water_fee_manual',
      'electric_mode', 'electric_prev', 'electric_curr', 'electric_units', 'electric_charge', 'electric_fee', 'electric_fee_manual',
      'furniture_fee', 'other_fee', 'total_due',
      'note', 'check_notes', 'room_status',
      'account_id', 'rule_code', 'recv_account_override_id',
    ],
    // Row 2: Thai labels (for compatibility with the import parser)
    [
      'room', 'rent_amount',
      'water_mode', 'water_prev', 'water_curr', 'water_units', 'water_charge', 'water_fee', 'water_fee_manual',
      'electric_mode', 'electric_prev', 'electric_curr', 'electric_units', 'electric_charge', 'electric_fee', 'electric_fee_manual',
      'furniture_fee', 'other_fee', 'total_due',
      'note', 'check_notes', 'room_status',
      'account_id', 'rule_code', 'recv_account_override_id',
    ],
    // Row 3+: data (single room)
    [
      roomNo,           // room
      rentAmount,       // rent_amount
      'NORMAL',         // water_mode
      10,               // water_prev
      15,               // water_curr
      5,                // water_units
      100,              // water_charge
      50,               // water_fee
      null,             // water_fee_manual
      'NORMAL',         // electric_mode
      100,              // electric_prev
      150,              // electric_curr
      50,               // electric_units
      450,              // electric_charge
      20,               // electric_fee
      null,             // electric_fee_manual
      0,                // furniture_fee
      0,                // other_fee
      rentAmount + 100 + 50 + 450 + 20, // total_due (≈ 5620 for default 5000 rent)
      null,             // note
      null,             // check_notes
      null,             // room_status
      null,             // account_id
      null,             // rule_code
      null,             // recv_account_override_id
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ชั้น_1');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(buf);
}

/**
 * Builds a billing Excel with multiple rooms spread across 8 floors
 * matching the real seed data layout (239 rooms).
 *
 * For tests that need to verify multi-room billing.
 */
export function buildMultiRoomBillingExcel(
  year: number,
  month: number,
  startRoomNo = 101,
  roomsPerFloor = 30
): Uint8Array[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');

  const buffers: Uint8Array[] = [];

  for (let floor = 1; floor <= 8; floor++) {
    const rows: unknown[][] = [
      [`ข้อมูลบิล ชั้น ${floor} เดือน ${month}/${year}`],
      [
        'room', 'rent_amount',
        'water_mode', 'water_prev', 'water_curr', 'water_units', 'water_charge', 'water_fee', 'water_fee_manual',
        'electric_mode', 'electric_prev', 'electric_curr', 'electric_units', 'electric_charge', 'electric_fee', 'electric_fee_manual',
        'furniture_fee', 'other_fee', 'total_due',
        'note', 'check_notes', 'room_status',
        'account_id', 'rule_code', 'recv_account_override_id',
      ],
      [
        'room', 'rent_amount',
        'water_mode', 'water_prev', 'water_curr', 'water_units', 'water_charge', 'water_fee', 'water_fee_manual',
        'electric_mode', 'electric_prev', 'electric_curr', 'electric_units', 'electric_charge', 'electric_fee', 'electric_fee_manual',
        'furniture_fee', 'other_fee', 'total_due',
        'note', 'check_notes', 'room_status',
        'account_id', 'rule_code', 'recv_account_override_id',
      ],
    ];

    for (let unit = 1; unit <= roomsPerFloor; unit++) {
      const roomNo = String(startRoomNo + floor * 100 + unit);
      const rentAmount = unit <= 5 ? 15500 : unit <= 15 ? 5900 : 5000;
      const elecPrev = 100 + unit * 10;
      const elecCurr = elecPrev + 50 + unit * 5;
      const elecUnits = elecCurr - elecPrev;
      const waterPrev = 10 + unit;
      const waterCurr = waterPrev + 5 + unit;
      const waterUnits = waterCurr - waterPrev;
      const totalDue = rentAmount + waterUnits * 20 + 50 + elecUnits * 9 + 20;

      rows.push([
        roomNo, rentAmount,
        'NORMAL', waterPrev, waterCurr, waterUnits, waterUnits * 20, 50, null,
        'NORMAL', elecPrev, elecCurr, elecUnits, elecUnits * 9, 20, null,
        0, 0, totalDue,
        null, null, null, null, null, null,
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `ชั้น_${floor}`);
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    buffers.push(new Uint8Array(buf));
  }

  return buffers;
}

/**
 * Uploads a billing Excel file to the billing import page and waits for processing.
 * Returns the file chooser promise and a wait for the preview API response.
 */
export async function uploadBillingExcel(
  page: Page,
  buffer: Uint8Array,
  filename = 'billing.xlsx',
  year?: number,
  month?: number
): Promise<void> {
  const url = page.url();
  const isImportPage = url.includes('/billing/import');

  if (!isImportPage) {
    await page.goto(`${page.context()._browser?.options?.baseURL ?? ''}/admin/billing/import`);
  }

  // Select monthly mode if available
  const monthlyTab = page.getByRole('tab', { name: /monthly|รายเดือน/i }).first();
  if (await monthlyTab.isVisible()) {
    await monthlyTab.click();
  }

  // Select period if year/month provided
  if (year && month) {
    const selects = page.locator('select');
    const yearSelect = selects.first();
    const monthSelect = selects.nth(1);
    if (await yearSelect.isVisible()) await yearSelect.selectOption(String(year));
    if (await monthSelect.isVisible()) await monthSelect.selectOption(String(month));
  }

  // Upload file
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    page.locator('input[type="file"]').click(),
  ]);

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const arrayBuffer = await blob.arrayBuffer();
  const file = new File([arrayBuffer], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await fileChooser.setFiles([file]);

  // Wait for upload + parse to complete (API call)
  await page.waitForResponse(
    r => r.url().includes('/api/billing/import/preview') || r.url().includes('/api/billing/import'),
    { timeout: 30000 }
  ).catch(() => {});
}