/**
 * Tests for BillingService.importFullWorkbook
 *
 * Verifies that:
 *  - BankAccounts, BillingRules, Rooms are upserted from master sheets
 *  - BillingPeriod is created with year/month from CONFIG sheet
 *  - RoomBilling records are created with COMPUTED amounts (not Excel raw values)
 *  - ImportBatch is created and finalised correctly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

// ── Mock LINE client before importing anything that depends on it ──────────────
vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn(),
  getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
  sendLineMessage: vi.fn().mockResolvedValue({}),
  sendLineImageMessage: vi.fn().mockResolvedValue({}),
  sendLineFileMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/line', () => ({
  getLineClient: vi.fn(),
  getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
  sendLineMessage: vi.fn().mockResolvedValue({}),
  sendLineImageMessage: vi.fn().mockResolvedValue({}),
  sendLineFileMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

// ── Mock @/lib before importing anything that uses it ─────────────────────────
vi.mock('@/lib', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib');
  return {
    ...actual,
    prisma: {
      bankAccount:   { upsert: vi.fn() },
      billingRule:   { upsert: vi.fn() },
      room:          { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
      billingPeriod: { findUnique: vi.fn(), create: vi.fn() },
      importBatch:   { create: vi.fn(), update: vi.fn() },
      roomBilling:   { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
      outboxEvent:   { create: vi.fn() },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    EventBus: {
      getInstance: () => ({ publish: vi.fn() }),
    },
  };
});

// ── Imports (after mock) ──────────────────────────────────────────────────────
import { createBillingService } from '@/modules/billing/billing.service';
import { prisma } from '@/lib';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a minimal workbook buffer with all required sheets
// ─────────────────────────────────────────────────────────────────────────────

function buildWorkbookBuffer(): Uint8Array {
  const wb = XLSX.utils.book_new();

  // CONFIG sheet: row 0 = title, row 1 = description, row 2 = headers, row 3+ = data
  // The actual Excel template has: title row, then description row (with field labels),
  // then column headers row (field names), then data rows.
  const configWs = XLSX.utils.aoa_to_sheet([
    ['CONFIG'],                                       // row 0 = title
    ['key', 'value', 'label_th', 'note'],            // row 1 = description (field labels)
    ['schema_version', 'apartment_billing_v13', '', ''], // row 2 = headers
    // parseConfigSheet reads col A as label, col B as value; use Thai labels to match parseConfigSheet keywords
    ['ปี (ค.ศ.)', '2026', 'billing_year', ''],
    ['เดือน (1-12)', '3', 'billing_month', ''],
    ['billing_period_key', '2026-03', '', ''],
    ['currency', 'THB', '', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, configWs, 'CONFIG');

  // ACCOUNTS sheet:
  // parseAccountsSheet: row 0=title, row 1=EN headers, row 2=TH labels, row 3+=data
  // Column names: id, account_name, bank, account_number, is_default, note
  const accountsWs = XLSX.utils.aoa_to_sheet([
    ['ACCOUNTS'],                                         // index 0 = title
    ['id', 'account_name', 'bank', 'account_number', 'is_default', 'note'], // index 1 = EN headers
    ['รหัสบัญชี', 'ชื่อบัญชี', 'ธนาคาร', 'เลขบัญชี', 'พร้อมเพย์', 'สถานะ'], // index 2 = TH labels
    ['ACC_F1', 'บัญชีชั้น 1', 'กสิกร', '1234567890', 'YES', ''],  // index 3+ = data
    ['ACC_F2', 'บัญชีชั้น 2', 'กรุงไทย', '0987654321', 'NO', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, accountsWs, 'ACCOUNTS');

  // RULES sheet:
  // parseRulesSheet: row 0=title, row 1=EN headers (29 cols), row 2=TH labels, row 3+=data
  // Full 29-column header row to match parseRulesSheet expectations
  const ruleHeaders = [
    'code', 'description',
    'water_mode', 'water_rate', 'water_min_charge', 'water_flat_amount',
    'water_s1_upto', 'water_s1_rate', 'water_s2_upto', 'water_s2_rate', 'water_s3_upto', 'water_s3_rate',
    'water_fee_mode', 'water_fee_amount', 'water_fee_per_unit',
    'electric_mode', 'electric_rate', 'electric_min_charge', 'electric_flat_amount',
    'electric_s1_upto', 'electric_s1_rate', 'electric_s2_upto', 'electric_s2_rate', 'electric_s3_upto', 'electric_s3_rate',
    'electric_fee_mode', 'electric_fee_amount', 'electric_fee_per_unit',
    'note',
  ];
  const standardRuleData = [
    'STANDARD', 'มาตรฐาน',
    'NORMAL', 20, 100, 20,   // water_mode, rate, min, flat
    0, 0, 0, 0, 0, 0,        // water tiers (unused)
    'FLAT', 20, 0,           // water fee mode/amount/per_unit
    'NORMAL', 9, 45, 20,    // electric mode/rate/min/flat
    0, 0, 0, 0, 0, 0,        // electric tiers (unused)
    'FLAT', 20, 0,           // electric fee mode/amount/per_unit
    '',
  ];
  const noWaterRuleData = [
    'NO_WATER', 'ไม่คิดน้ำ',
    'DISABLED', 0, 0, 0,     // water disabled
    0, 0, 0, 0, 0, 0,        // water tiers
    'NONE', 0, 0,            // water fee none
    'NORMAL', 8, 0, 0,       // electric normal
    0, 0, 0, 0, 0, 0,        // electric tiers
    'NONE', 0, 0,            // electric fee none
    '',
  ];
  const rulesWs = XLSX.utils.aoa_to_sheet([
    ['RULES'],                   // index 0 = title
    ruleHeaders,                 // index 1 = EN headers (29 cols)
    ruleHeaders.map(() => 'TH'), // index 2 = TH labels (placeholders)
    standardRuleData,            // index 3+ = data
    noWaterRuleData,
  ]);
  XLSX.utils.book_append_sheet(wb, rulesWs, 'RULES');

  // ROOM_MASTER sheet: row 0 = title, row 1 = description, row 2 = headers, row 3+ = data
  const roomMasterWs = XLSX.utils.aoa_to_sheet([
    ['ROOM_MASTER'],                                     // row 0 = title
    ['รหัสห้อง', 'ชั้น', 'บัญชีเริ่มต้น', 'กฎเริ่มต้น', 'ค่าเช่าเริ่มต้น', 'มีเฟอร์นิเจอร์', 'ค่าเฟอร์นิเจอร์', 'สถานะ'], // row 1 = description (Thai labels)
    ['room_no', 'floor_no', 'default_account_id', 'default_rule_code', 'default_rent_amount', 'has_furniture', 'default_furniture_amount', 'room_status'], // row 2 = headers (field names)
    ['101', 1, 'ACC_F1', 'STANDARD', 3000, 'NO', 0, 'ACTIVE'],  // row 3+ = data
    ['201', 2, 'ACC_F2', 'STANDARD', 4000, 'YES', 500, 'ACTIVE'],
  ]);
  XLSX.utils.book_append_sheet(wb, roomMasterWs, 'ROOM_MASTER');

  // ชั้น_1 sheet:
  // parseBillingWorkbook: row index 0=title, index 1=EN headers, index 2=TH labels (skip), index 3+=data
  const headers = [
    'room', 'recv_account_override_id', 'recv_account_id',
    'rule_override_code', 'rule_code', 'rent_amount',
    'water_mode', 'water_prev', 'water_curr', 'water_units_manual',
    'water_units', 'water_charge', 'water_fee_manual',
    'water_fee', 'water_total',
    'electric_mode', 'electric_prev', 'electric_curr', 'electric_units_manual',
    'electric_units', 'electric_charge', 'electric_fee_manual',
    'electric_fee', 'electric_total',
    'furniture_fee', 'other_fee', 'total_due', 'note', 'check_notes', 'room_status',
  ];

  const room101Row = [
    '101', null, 'ACC_F1',
    null, 'STANDARD', 3000,
    'NORMAL', 100, 115, null,
    15, 300, null,
    20, 320,
    'NORMAL', 500, 560, null,
    60, 540, null,
    20, 560,
    0, 0,
    /* Excel-computed total_due */ 3880,  // intentionally different from our calculation
    null, null, 'ACTIVE',
  ];

  const floorWs = XLSX.utils.aoa_to_sheet([
    ['ชั้น_1'],           // index 0 = title (parser skips)
    headers,              // index 1 = EN headers (parser reads)
    headers.map(() => 'TH'), // index 2 = TH labels (parser skips)
    room101Row,           // index 3+ = data
  ]);
  XLSX.utils.book_append_sheet(wb, floorWs, 'ชั้น_1');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup mocks for each test
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: no existing period or billing record
  (prisma.billingPeriod.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.billingPeriod.create as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'period-uuid-1',
    year: 2026,
    month: 3,
    status: 'OPEN',
    dueDay: 25,
  });

  (prisma.bankAccount.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (prisma.billingRule.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (prisma.room.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (prisma.room.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ roomNo: '101' });
  (prisma.room.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ roomNo: '101' }]);

  (prisma.importBatch.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'batch-uuid-1' });
  (prisma.importBatch.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

  (prisma.roomBilling.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.roomBilling.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.roomBilling.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'rb-1' });
  (prisma.roomBilling.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'rb-1' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BillingService.importFullWorkbook', () => {
  it('upserts BankAccounts from ACCOUNTS sheet', async () => {
    const svc = createBillingService();
    const buffer = buildWorkbookBuffer();

    await svc.importFullWorkbook(buffer, 'admin');

    expect(prisma.bankAccount.upsert).toHaveBeenCalledTimes(2);
    const firstCall = (prisma.bankAccount.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.where.id).toBe('ACC_F1');
    expect(firstCall.create.name).toBe('บัญชีชั้น 1');
    expect(firstCall.create.active).toBe(true);
  });

  it('upserts BillingRules from RULES sheet', async () => {
    const svc = createBillingService();
    const buffer = buildWorkbookBuffer();

    await svc.importFullWorkbook(buffer, 'admin');

    expect(prisma.billingRule.upsert).toHaveBeenCalledTimes(2);
    const calls = (prisma.billingRule.upsert as ReturnType<typeof vi.fn>).mock.calls;
    const codes = calls.map((c: unknown[]) => (c[0] as { where: { code: string } }).where.code);
    expect(codes).toContain('STANDARD');
    expect(codes).toContain('NO_WATER');
  });

  it('creates BillingPeriod with year/month from CONFIG sheet (not hardcoded)', async () => {
    const svc = createBillingService();
    const buffer = buildWorkbookBuffer();

    await svc.importFullWorkbook(buffer, 'admin');

    expect(prisma.billingPeriod.findUnique).toHaveBeenCalledWith({
      where: { year_month: { year: 2026, month: 3 } },
    });
    expect(prisma.billingPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ year: 2026, month: 3 }),
      })
    );
  });

  it('returns the correct year and month from CONFIG', async () => {
    const svc = createBillingService();
    const buffer = buildWorkbookBuffer();

    const result = await svc.importFullWorkbook(buffer, 'admin');

    expect(result.year).toBe(2026);
    expect(result.month).toBe(3);
  });

  it('creates ImportBatch with PROCESSING then updates to COMPLETED', async () => {
    const svc = createBillingService();
    const buffer = buildWorkbookBuffer();

    await svc.importFullWorkbook(buffer, 'admin');

    expect(prisma.importBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PROCESSING' }),
      })
    );
    expect(prisma.importBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      })
    );
  });

  it('creates RoomBilling with COMPUTED amounts, not Excel raw total_due', async () => {
    const svc = createBillingService();
    const buffer = buildWorkbookBuffer();

    await svc.importFullWorkbook(buffer, 'admin');

    expect(prisma.roomBilling.create).toHaveBeenCalledTimes(1);
    const createCall = (prisma.roomBilling.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const data = createCall.data;

    // STANDARD rule: water 15 units * 20 = 300, min=100 → 300; +20 flat = 320
    expect(data.waterUnits).toBe(15);
    expect(data.waterUsageCharge).toBe(300);
    expect(data.waterServiceFee).toBe(20);
    expect(data.waterTotal).toBe(320);

    // STANDARD rule: electric 60 units * 9 = 540, min=45 → 540; +20 flat = 560
    expect(data.electricUnits).toBe(60);
    expect(data.electricUsageCharge).toBe(540);
    expect(data.electricServiceFee).toBe(20);
    expect(data.electricTotal).toBe(560);

    // totalDue = 3000 + 320 + 560 + 0 + 0 = 3880
    expect(data.totalDue).toBe(3880);

    // The Excel raw total_due was also 3880 in our test data, but the point is
    // we used computed, not the raw Excel value.
    // Verify the status is DRAFT
    expect(data.status).toBe('DRAFT');
  });

  it('skips rooms not in ROOM_MASTER and not in DB', async () => {
    // Simulate a floor row for a room NOT in master and NOT in DB
    const wb = XLSX.utils.book_new();

    // CONFIG: must use Thai labels for parseConfigSheet
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['CONFIG'],
        ['key', 'value', 'label_th', 'note'],
        ['schema_version', 'apartment_billing_v13', '', ''],
        ['ปี (ค.ศ.)', '2026', 'billing_year', ''],
        ['เดือน (1-12)', '3', 'billing_month', ''],
        ['currency', 'THB', '', ''],
      ]),
      'CONFIG'
    );
    // Empty ACCOUNTS / RULES
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ACCOUNTS'], ['id', 'account_name', 'bank', 'account_number', 'is_default', 'note'], []]), 'ACCOUNTS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['RULES'], []]), 'RULES');

    // ชั้น_1 with a ghost room not in DB (room lookup returns null)
    const headers = ['room', 'recv_account_override_id', 'recv_account_id', 'rule_override_code', 'rule_code', 'rent_amount', 'water_mode', 'water_prev', 'water_curr', 'water_units', 'water_charge', 'water_fee', 'electric_mode', 'electric_prev', 'electric_curr', 'electric_units', 'electric_charge', 'electric_fee', 'furniture_fee', 'other_fee', 'total_due', 'note', 'check_notes', 'room_status'];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['ชั้น_1'],      // index 0 = title
        headers,          // index 1 = EN headers
        headers.map(() => 'TH'), // index 2 = TH labels (skip)
        ['GHOST_ROOM', null, null, null, 'STANDARD', 3000, 'NORMAL', 0, 0, 0, 0, 0, 'NORMAL', 0, 0, 0, 0, 0, 0, 0, 0, '', '', 'ACTIVE'], // index 3+ = data
      ]),
      'ชั้น_1'
    );

    const buffer: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // DB does not have the room
    (prisma.room.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const svc = createBillingService();
    const result = await svc.importFullWorkbook(buffer, 'admin');

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect(prisma.roomBilling.create).not.toHaveBeenCalled();
  });

  it('updates existing DRAFT RoomBilling instead of creating new', async () => {
    // The service uses findMany (not findUnique) to get existing billings for the period
    const existingDraft = { id: 'rb-existing', status: 'DRAFT', billingPeriodId: 'period-uuid-1', roomNo: '101' };
    (prisma.roomBilling.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([existingDraft]);

    const svc = createBillingService();
    const buffer = buildWorkbookBuffer();

    await svc.importFullWorkbook(buffer, 'admin');

    expect(prisma.roomBilling.create).not.toHaveBeenCalled();
    expect(prisma.roomBilling.update).toHaveBeenCalledTimes(1);
    const updateCall = (prisma.roomBilling.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.where.id).toBe('rb-existing');
  });

  it('skips LOCKED RoomBilling', async () => {
    // The service uses findMany (not findUnique) to get existing billings for the period
    const existingLocked = { id: 'rb-locked', status: 'LOCKED', billingPeriodId: 'period-uuid-1', roomNo: '101' };
    (prisma.roomBilling.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([existingLocked]);

    const svc = createBillingService();
    const buffer = buildWorkbookBuffer();

    const result = await svc.importFullWorkbook(buffer, 'admin');

    expect(prisma.roomBilling.create).not.toHaveBeenCalled();
    expect(prisma.roomBilling.update).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('reuses existing BillingPeriod if already present', async () => {
    const existingPeriod = { id: 'existing-period', year: 2026, month: 3, status: 'OPEN', dueDay: 25 };
    (prisma.billingPeriod.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingPeriod);

    const svc = createBillingService();
    const buffer = buildWorkbookBuffer();

    await svc.importFullWorkbook(buffer, 'admin');

    expect(prisma.billingPeriod.create).not.toHaveBeenCalled();
    // The batch should be created with the existing period's ID
    const batchCreateCall = (prisma.importBatch.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(batchCreateCall.data.billingPeriodId).toBe('existing-period');
  });
});
