import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBillingWorkbook, parseBillingWorkbookDetailed } from '@/modules/billing/import-parser';

function workbookBuffer(rows: Array<Record<string, unknown>>): Uint8Array {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function workbookBufferWithSheets(sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('parseBillingWorkbook', () => {
  it('parses summary template rows into billing items', () => {
    const buffer = workbookBuffer([
      {
        Year: 2026,
        Month: 'December',
        RoomNumber: '3201',
        RentAmount: 2900,
        WaterPrevious: 2725,
        WaterCurrent: 2734,
        WaterUsage: 9,
        WaterUnitPrice: 20,
        WaterAmount: 200,
        ElectricPrevious: 1756,
        ElectricCurrent: 1820,
        ElectricUsage: 64,
        ElectricUnitPrice: 9.31,
        ElectricAmount: 596,
        FurnitureAmount: 300,
        OtherAmount: 150,
        OtherDescription: 'Cleaning fee',
      },
    ]);

    const rows = parseBillingWorkbook(buffer);

    expect(rows).toHaveLength(5);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ roomNumber: '3201', year: 2026, month: 12, typeCode: 'RENT', unitPrice: 2900 }),
        expect.objectContaining({ typeCode: 'WATER', unitPrice: 200 }),
        expect.objectContaining({ typeCode: 'ELECTRIC', unitPrice: 596 }),
        expect.objectContaining({ typeCode: 'FACILITY', unitPrice: 300 }),
        expect.objectContaining({ typeCode: 'OTHER', unitPrice: 150, description: 'Cleaning fee' }),
      ])
    );
  });

  it('parses legacy line-item template rows', () => {
    const buffer = workbookBuffer([
      {
        Room: '101',
        Year: 2026,
        Month: 3,
        Type: 'RENT',
        Quantity: 1,
        UnitPrice: 5000,
        Description: 'Monthly rent',
      },
      {
        Room: '101',
        Year: 2026,
        Month: 3,
        Type: 'WATER',
        Quantity: 10,
        UnitPrice: 15,
      },
    ]);

    const rows = parseBillingWorkbook(buffer);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ roomNumber: '101', year: 2026, month: 3, typeCode: 'RENT' });
    expect(rows[1]).toMatchObject({ roomNumber: '101', year: 2026, month: 3, typeCode: 'WATER' });
  });

  it('parses summary rows across multiple sheets and accepts compatibility headers', () => {
    const buffer = workbookBufferWithSheets([
      {
        name: 'Floor2',
        rows: [
          {
            BillingYear: 2026,
            BillingMonth: 'December',
            RoomNo: '3201',
            AccountName: 'Somchai',
            BankName: 'KBank',
            BankAccountNumber: '123-4-56789-0',
            Rent: 2900,
            WaterPrevious: 2725,
            WaterCurrent: 2734,
            WaterUsage: 9,
            WaterUnitPrice: 20,
            WaterCharge: 200,
            ElectricPrevious: 1756,
            ElectricCurrent: 1820,
            ElectricUsage: 64,
            ElectricUnitPrice: 9.31,
            ElectricCharge: 596,
            TotalAmount: 3696,
          },
        ],
      },
      {
        name: 'Floor3',
        rows: [
          {
            Year: 2026,
            Month: 12,
            RoomNumber: '3301',
            RentAmount: 2900,
            OtherAmount: 120,
            OtherChargeDescription: 'Key card',
          },
        ],
      },
    ]);

    const rows = parseBillingWorkbook(buffer);

    expect(rows).toHaveLength(5);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ roomNumber: '3201', typeCode: 'RENT', unitPrice: 2900 }),
        expect.objectContaining({ roomNumber: '3201', typeCode: 'WATER', unitPrice: 200 }),
        expect.objectContaining({ roomNumber: '3201', typeCode: 'ELECTRIC', unitPrice: 596 }),
        expect.objectContaining({ roomNumber: '3301', typeCode: 'RENT', unitPrice: 2900 }),
        expect.objectContaining({ roomNumber: '3301', typeCode: 'OTHER', unitPrice: 120, description: 'Key card' }),
      ])
    );
  });

  it('keeps declared total metadata for preview warnings', () => {
    const buffer = workbookBuffer([
      {
        Year: 2026,
        Month: 'December',
        RoomNumber: '3201',
        RentAmount: 2900,
        WaterAmount: 200,
        ElectricAmount: 596,
        TotalAmount: 3600,
      },
    ]);

    const result = parseBillingWorkbookDetailed(buffer);

    expect(result.rows).toHaveLength(3);
    expect(result.summaryRows).toEqual([
      expect.objectContaining({
        roomNumber: '3201',
        year: 2026,
        month: 12,
        declaredTotalAmount: 3600,
      }),
    ]);
  });
});
