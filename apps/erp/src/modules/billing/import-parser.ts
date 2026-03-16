import * as XLSX from 'xlsx';
import { billingImportRowSchema, type BillingImportRow } from './types';

type SheetRow = Record<string, unknown>;
type SummarySourceRow = {
  roomNumber: string;
  year: number;
  month: number;
  declaredTotalAmount?: number;
};

export type BillingWorkbookParseResult = {
  rows: BillingImportRow[];
  summaryRows: SummarySourceRow[];
};

const MONTH_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function cleanHeader(value: string): string {
  return value.replace(/\s+/g, '').trim().toLowerCase();
}

function getValue(row: SheetRow, candidates: string[]): unknown {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const cleanedCandidate = cleanHeader(candidate);
    const found = entries.find(([key]) => cleanHeader(key) === cleanedCandidate);
    if (found) return found[1];
  }
  return undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number(value ?? 0);
}

function toStringValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function parseMonth(value: unknown): number {
  if (typeof value === 'number') return value;
  const raw = toStringValue(value).toLowerCase();
  if (!raw) return Number.NaN;
  if (/^\d+$/.test(raw)) return Number(raw);
  return MONTH_MAP[raw] ?? Number.NaN;
}

function pushAmountRow(
  output: BillingImportRow[],
  base: { roomNumber: string; year: number; month: number },
  typeCode: BillingImportRow['typeCode'],
  amount: unknown,
  description?: string
) {
  const numericAmount = toNumber(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
  output.push(
    billingImportRowSchema.parse({
      ...base,
      typeCode,
      quantity: 1,
      unitPrice: numericAmount,
      description: description || undefined,
    })
  );
}

function parseLineItemRows(rows: SheetRow[]): BillingImportRow[] {
  return rows.map((row) =>
    billingImportRowSchema.parse({
      roomNumber: toStringValue(getValue(row, ['Room', 'room', 'roomNumber', 'RoomNumber'])),
      year: toNumber(getValue(row, ['Year', 'year'])),
      month: parseMonth(getValue(row, ['Month', 'month'])),
      typeCode: toStringValue(getValue(row, ['Type', 'type', 'typeCode', 'TypeCode'])),
      quantity: toNumber(getValue(row, ['Quantity', 'qty', 'quantity'])) || 1,
      unitPrice: toNumber(getValue(row, ['UnitPrice', 'unitPrice', 'price'])),
      description: toStringValue(getValue(row, ['Description', 'description'])) || undefined,
    })
  );
}

function parseSummaryRows(rows: SheetRow[]): BillingWorkbookParseResult {
  const parsed: BillingImportRow[] = [];
  const summaryRows: SummarySourceRow[] = [];

  for (const row of rows) {
    const roomNumber = toStringValue(getValue(row, ['RoomNumber', 'Room', 'UnitNumber', 'RoomNo', 'UnitNo']));
    const year = toNumber(getValue(row, ['Year', 'BillingYear']));
    const month = parseMonth(getValue(row, ['Month', 'BillingMonth']));
    const notes = toStringValue(getValue(row, ['Notes', 'Note', 'Remark', 'Remarks', 'Status']));
    const otherDescription = toStringValue(
      getValue(row, ['OtherDescription', 'Other Notes', 'OtherNote', 'OtherChargeDescription'])
    );
    const declaredTotalAmount = toNumber(getValue(row, ['TotalAmount', 'GrandTotal', 'Total']));

    const base = { roomNumber, year, month };
    summaryRows.push({
      roomNumber,
      year,
      month,
      declaredTotalAmount: Number.isFinite(declaredTotalAmount) ? declaredTotalAmount : undefined,
    });

    pushAmountRow(parsed, base, 'RENT', getValue(row, ['RentAmount', 'Rent']));
    pushAmountRow(
      parsed,
      base,
      'WATER',
      getValue(row, ['WaterAmount', 'WaterCharge']),
      buildUsageDescription('Water', row, ['WaterUsage', 'WaterPrevious', 'WaterCurrent', 'WaterUnitPrice'])
    );
    pushAmountRow(
      parsed,
      base,
      'ELECTRIC',
      getValue(row, ['ElectricAmount', 'ElectricCharge']),
      buildUsageDescription('Electric', row, ['ElectricUsage', 'ElectricPrevious', 'ElectricCurrent', 'ElectricUnitPrice'])
    );
    pushAmountRow(parsed, base, 'FACILITY', getValue(row, ['FurnitureAmount', 'FurnitureCharge', 'FacilityAmount']), 'Furniture charge');
    pushAmountRow(parsed, base, 'PARKING', getValue(row, ['ParkingAmount', 'ParkingCharge']));
    pushAmountRow(parsed, base, 'INTERNET', getValue(row, ['InternetAmount', 'InternetCharge']));
    pushAmountRow(parsed, base, 'FEE_LATE', getValue(row, ['LateFeeAmount', 'LateFee']));
    pushAmountRow(parsed, base, 'OTHER', getValue(row, ['OtherAmount']), otherDescription || notes || undefined);
  }

  return { rows: parsed, summaryRows };
}

function buildUsageDescription(label: string, row: SheetRow, fields: string[]): string | undefined {
  const usage = toStringValue(getValue(row, [fields[0]]));
  const previous = toStringValue(getValue(row, [fields[1]]));
  const current = toStringValue(getValue(row, [fields[2]]));
  const rate = toStringValue(getValue(row, [fields[3]]));

  const parts = [
    usage ? `usage ${usage}` : null,
    previous ? `prev ${previous}` : null,
    current ? `curr ${current}` : null,
    rate ? `rate ${rate}` : null,
  ].filter(Boolean);

  return parts.length ? `${label}: ${parts.join(', ')}` : undefined;
}

function isLineItemTemplate(rows: SheetRow[]): boolean {
  const firstRow = rows[0] || {};
  return Boolean(
    getValue(firstRow, ['Room', 'room', 'roomNumber', 'RoomNumber']) !== undefined &&
      getValue(firstRow, ['Type', 'type', 'typeCode', 'TypeCode']) !== undefined
  );
}

export function parseBillingWorkbookDetailed(buffer: Uint8Array): BillingWorkbookParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const rows = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: null });
  });

  if (!rows.length) return { rows: [], summaryRows: [] };

  if (isLineItemTemplate(rows)) {
    return { rows: parseLineItemRows(rows), summaryRows: [] };
  }

  return parseSummaryRows(rows);
}

export function parseBillingWorkbook(buffer: Uint8Array): BillingImportRow[] {
  return parseBillingWorkbookDetailed(buffer).rows;
}
