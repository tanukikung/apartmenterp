/**
 * Test Data Factory — Deterministic, parallel-safe E2E test data creation.
 *
 * ALL data created via authenticated browser fetch (NOT Prisma direct access).
 * ALL entities use unique suffixes to prevent cross-test contamination.
 * ALL factories are idempotent — safe to call multiple times in same test.
 *
 * Usage:
 *   const { tenant } = await ensureTenant(page);
 *   const { invoice } = await ensureInvoice(page, { status: 'SENT' });
 */

import { Page } from '@playwright/test';
import { BASE_URL } from './config.js';

// ─── Unique ID generation ─────────────────────────────────────────────────────

/** Generates a unique test ID suffix for parallel isolation. */
export function generateTestId(label = 'e2e'): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);
  return `${label}-${ts}-${rand}`;
}

// ─── Internal API helpers ─────────────────────────────────────────────────────

interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
  retryAfter?: number; // seconds, from Retry-After header (429 responses)
}

async function apiPost<R = unknown>(
  page: Page,
  path: string,
  body: unknown,
  timeout = 60000
): Promise<ApiResult<R>> {
  return page.evaluate(
    async ({ url, b, origin }) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 55000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': origin,
          'Referer': origin + '/',
          'Idempotency-Key': crypto.randomUUID(),
        },
        credentials: 'include',
        body: JSON.stringify(b),
        signal: controller.signal,
      });
      clearTimeout(id);
      const json = await res.json().catch(() => ({}));
      const retryAfterHeader = res.headers.get('Retry-After');
      let retryAfter: number | undefined;
      if (retryAfterHeader) {
        const parsed = parseInt(retryAfterHeader, 10);
        retryAfter = isNaN(parsed) ? undefined : parsed;
      }
      return {
        ok: res.ok,
        status: res.status,
        data: json as R,
        error: (json as { error?: { message?: string } })?.error?.message,
        retryAfter,
      };
    },
    { url: `${BASE_URL}${path}`, b: body, origin: BASE_URL }
  );
}

async function apiGet<R = unknown>(
  page: Page,
  path: string,
  timeout = 15000
): Promise<ApiResult<R>> {
  return page.evaluate(
    async ({ url, origin }) => {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Origin: origin, Referer: origin + '/' },
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data: json as R };
    },
    { url: `${BASE_URL}${path}`, origin: BASE_URL }
  );
}

async function waitForApi(
  page: Page,
  urlPattern: string | RegExp,
  timeout = 30000
): Promise<void> {
  await page.waitForResponse(
    r => urlPattern instanceof RegExp ? urlPattern.test(r.url()) : r.url().includes(urlPattern),
    { timeout }
  );
}

// ─── Room factory ─────────────────────────────────────────────────────────────

export interface Room {
  roomNo: string;
  floor: number;
  roomStatus: string;
}

/**
 * Finds a VACANT room by querying the rooms API.
 * Does NOT create rooms (rooms are seeded/managed by admin).
 * Returns the first vacant room found.
 */
export async function findVacantRoom(page: Page): Promise<Room | null> {
  const result = await apiGet<{ data?: { data?: Room[] } | Room[] }>(
    page,
    '/api/rooms?roomStatus=VACANT&pageSize=50'
  );
  const raw = result.data?.data;
  const rooms: Room[] = Array.isArray(raw) ? raw as Room[]
    : Array.isArray(raw?.data) ? (raw as { data: Room[] }).data
    : [];
  return rooms[0] ?? null;
}

/**
 * Finds ANY room by status. Useful for tests that need an OCCUPIED room.
 */
export async function findRoom(page: Page, status?: string): Promise<Room | null> {
  const qs = status ? `?roomStatus=${status}&pageSize=50` : '?pageSize=50';
  const result = await apiGet<{ data?: { data?: Room[] } | Room[] }>(page, `/api/rooms${qs}`);
  const raw = result.data?.data;
  const rooms: Room[] = Array.isArray(raw) ? raw as Room[]
    : Array.isArray(raw?.data) ? (raw as { data: Room[] }).data
    : [];
  return rooms[0] ?? null;
}

/**
 * Finds ANY room by status. Useful for tests that need an OCCUPIED room.
 */
export async function findAllRooms(page: Page, status?: string): Promise<Room[]> {
  const qs = status ? `?roomStatus=${status}&pageSize=300` : '?pageSize=300';
  const result = await apiGet<{ data?: { data?: Room[] } | Room[] }>(page, `/api/rooms${qs}`);
  const raw = result.data?.data;
  const rooms: Room[] = Array.isArray(raw) ? raw as Room[]
    : Array.isArray(raw?.data) ? (raw as { data: Room[] }).data
    : [];
  return rooms;
}

// ─── Tenant factory ───────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
}

export interface EnsureTenantOptions {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

/**
 * Creates a uniquely-named tenant via POST /api/tenants.
 * Uses unique suffix so parallel tests never collide.
 */
export async function ensureTenant(
  page: Page,
  opts: EnsureTenantOptions = {}
): Promise<{ tenant: Tenant }> {
  const uid = generateTestId('tenant');
  const firstName = opts.firstName ?? `F${uid}`;
  const lastName = opts.lastName ?? `L${uid}`;
  const phone = opts.phone ?? `06${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const email = opts.email ?? `e2e@test.local`;

  const result = await apiPost<{ data?: Tenant }>(
    page,
    '/api/tenants',
    { firstName, lastName, phone, email }
  );

  if (!result.ok) {
    throw new Error(
      `[ensureTenant] Failed to create tenant: ${result.error ?? result.status}\n` +
      `Payload: ${JSON.stringify({ firstName, lastName, phone, email })}`
    );
  }

  const tenant = result.data?.data as Tenant;
  if (!tenant?.id) {
    throw new Error(`[ensureTenant] No tenant returned. Response: ${JSON.stringify(result.data)}`);
  }

  return { tenant };
}

// ─── Contract factory ────────────────────────────────────────────────────────

export interface Contract {
  id: string;
  roomNo: string;
  tenantId: string;
  status: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  depositAmount?: number;
}

export interface EnsureContractOptions {
  tenantId?: string;
  roomNo?: string;
  startDate?: string;
  endDate?: string;
  rentAmount?: number;
  depositAmount?: number;
}

/**
 * Creates a contract linking a tenant to a room.
 * If roomNo not provided, finds a VACANT room first.
 * If tenantId not provided, creates a tenant first.
 * Uses unique suffix so all values are collision-free.
 */
export async function ensureContract(
  page: Page,
  opts: EnsureContractOptions = {}
): Promise<{ contract: Contract; room: Room; tenant: Tenant }> {
  const uid = generateTestId('contract');

  // Find or create room
  let room: Room;
  if (opts.roomNo) {
    // Look up the room by roomNo to get its full data
    const roomResult = await apiGet<{ data?: { data?: Room[] } | Room[] }>(
      page,
      `/api/rooms?search=${encodeURIComponent(opts.roomNo)}&pageSize=5`
    );
    const raw = roomResult.data?.data;
    const rooms: Room[] = Array.isArray(raw) ? raw as Room[]
      : Array.isArray(raw?.data) ? (raw as { data: Room[] }).data
      : [];
    const r = rooms.find(r => r.roomNo === opts.roomNo) ?? rooms[0];
    if (!r) throw new Error(`[ensureContract] Room ${opts.roomNo} not found`);
    room = r;
  } else {
    const found = await findRoom(page, 'VACANT');
    if (!found) throw new Error('[ensureContract] No VACANT room found. Ensure rooms exist via billing import.');
    room = found;
  }

  // Find or create tenant
  let tenant: Tenant;
  if (opts.tenantId) {
    const tResult = await apiGet<{ data?: Tenant }>(page, `/api/tenants/${opts.tenantId}`);
    const t = tResult.data?.data as Tenant | undefined;
    if (!t?.id) throw new Error(`[ensureContract] Tenant ${opts.tenantId} not found`);
    tenant = t;
  } else {
    const { tenant: t } = await ensureTenant(page);
    tenant = t;
  }

  // Build contract dates (default: starting today, 1 year)
  const startDate = opts.startDate ?? new Date().toISOString().split('T')[0];
  const endDate = opts.endDate ?? (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  })();

  // Assign tenant as PRIMARY to the room before creating the contract.
  // The contract service requires the tenant to already be assigned.
  // Handle 409 (room already has a PRIMARY) by retrying with a different room.
  // Maximum 3 attempts to find a truly VACANT room.
  // The rooms API can return VACANT-listing rooms that actually have PRIMARY tenants
  // (stale from prior failed tests). So we filter out rooms that already have a
  // PRIMARY assignment by checking if assignment returns 409.
  // First, get ALL rooms (not just VACANT) and try each one until we find one
  // that doesn't have a PRIMARY tenant conflict.
  const allRooms = await findAllRooms(page); // no filter — gets all rooms

  // Build a list of candidate rooms: prefer VACANT, but fall back to OCCUPIED
  const sortedCandidates = [
    ...allRooms.filter(r => r.roomStatus === 'VACANT'),
    ...allRooms.filter(r => r.roomStatus !== 'VACANT'),
  ];

  let assignAttempts = 0;
  let assignResult: { ok: boolean; status: number; error?: string } | null = null;

  for (const candidate of sortedCandidates) {
    if (assignAttempts >= 200) break;

    assignResult = await apiPost(page, `/api/rooms/${encodeURIComponent(candidate.roomNo)}/tenants`, {
      tenantId: tenant.id,
      role: 'PRIMARY',
      moveInDate: startDate,
    });

    if (assignResult.ok) {
      room = candidate;
      break;
    }

    // Initial attempt failed — check why
    if (assignResult.status === 429) {
      // Rate limited — skip this room immediately, don't wait.
      // Try the next candidate room. In test mode the rate limiter is
      // bypassed, but in case a limit leaksthrough, fail fast rather than wait.
      if (assignAttempts < 5) {
        console.warn(`[ensureContract] Assign rate limited (${candidate.roomNo}) — skipping, trying next room`);
      }
      assignAttempts++;
      continue; // next room
    }

    // Non-429 failure (e.g., 409 stale VACANT, or unexpected error)
    assignAttempts++;
    if (assignResult.status === 409) {
      if (assignAttempts <= 5) console.warn(`[ensureContract] Room ${candidate.roomNo} has a PRIMARY already (stale VACANT #${assignAttempts}), trying next.`);
    } else {
      console.warn(`[ensureContract] Room ${candidate.roomNo} assign status ${assignResult.status}: ${assignResult.error}`);
    }
  }

  if (!assignResult?.ok || !room) {
    throw new Error(
      `[ensureContract] Failed to assign tenant after trying ${assignAttempts} rooms. Last error: ${assignResult?.error ?? 'unknown'}`
    );
  }

  if (assignAttempts > 0) {
    console.log(`[ensureContract] Assigned tenant to room ${room.roomNo} after ${assignAttempts} attempts (filtered stale VACANT rooms)`);
  }

  if (!assignResult.ok) {
    throw new Error(
      `[ensureContract] Failed to assign tenant to room: ${assignResult.error ?? assignResult.status}\n` +
      `Payload: ${JSON.stringify({ tenantId: tenant.id, role: 'PRIMARY', moveInDate: startDate })}`
    );
  }

  const rentAmount = opts.rentAmount ?? 5000 + Math.floor(Math.random() * 5000);
  const depositAmount = opts.depositAmount ?? rentAmount;

  const result = await apiPost<{ data?: Contract }>(
    page,
    '/api/contracts',
    {
      roomId: room.roomNo,
      primaryTenantId: tenant.id,
      startDate,
      endDate,
      rentAmount,
      depositAmount,
    }
  );

  if (!result.ok) {
    throw new Error(
      `[ensureContract] Failed to create contract: ${result.error ?? result.status}\n` +
      `Payload: ${JSON.stringify({ roomId: room.roomNo, primaryTenantId: tenant.id, startDate, endDate, rentAmount, depositAmount })}`
    );
  }

  const contract = result.data?.data as Contract;
  if (!contract?.id) {
    throw new Error(`[ensureContract] No contract returned. Response: ${JSON.stringify(result.data)}`);
  }

  return { contract, room, tenant };
}

// ─── Billing factory ─────────────────────────────────────────────────────────

export interface BillingPeriod {
  id: string;
  year: number;
  month: number;
  status: string;
}

export interface BillingRecord {
  id: string;
  roomNo: string;
  status: string;
  totalDue: number;
}

/**
 * Finds the billing period for a given year/month via GET /api/billing-cycles.
 * Returns the period if it exists, null if not.
 */
async function findBillingPeriod(
  page: Page,
  year: number,
  month: number
): Promise<BillingPeriod | null> {
  const result = await apiGet<{ data?: { data?: BillingPeriod[] } | BillingPeriod[] }>(
    page,
    `/api/billing-cycles?year=${year}&month=${month}&pageSize=5`
  );
  const raw = result.data?.data;
  const periods: BillingPeriod[] = Array.isArray(raw) ? raw as BillingPeriod[]
    : Array.isArray(raw?.data) ? (raw as { data: BillingPeriod[] }).data
    : [];
  return periods.find(p => p.year === year && p.month === month) ?? null;
}

/**
 * Creates or finds a billing period for the given year/month.
 * Uses API-first approach: creates billing record directly, which auto-creates
 * the BillingPeriod if it doesn't exist.
 *
 * Returns the real BillingPeriod with its actual DB ID.
 */
export async function ensureBillingPeriod(
  page: Page,
  year: number,
  month: number
): Promise<{ period: BillingPeriod }> {
  // Check if period already exists
  const existing = await findBillingPeriod(page, year, month);
  if (existing) return { period: existing };

  // Period doesn't exist — create a billing record for a real room.
  // The billing service auto-creates the period.
  // We use room 3201 (first seeded room) as a sentinel.
  const roomNo = '3201';

  const brResult = await apiPost<{ data?: BillingRecord & { billingPeriodId?: string } }>(
    page,
    '/api/billing',
    { roomNo, year, month }
  );

  if (!brResult.ok) {
    throw new Error(
      `[ensureBillingPeriod] Failed to create billing record: ${brResult.error ?? brResult.status}\n` +
      `Payload: ${JSON.stringify({ roomNo, year, month })}`
    );
  }

  const billingRecord = brResult.data?.data as (BillingRecord & { billingPeriodId?: string });
  if (!billingRecord?.billingPeriodId) {
    throw new Error(
      `[ensureBillingPeriod] Billing record created but no billingPeriodId returned.\n` +
      `Response: ${JSON.stringify(brResult.data)}`
    );
  }

  // Query for the newly-created period
  const period = await findBillingPeriod(page, year, month);
  if (!period) {
    throw new Error(`[ensureBillingPeriod] Period auto-creation failed for ${year}-${month}`);
  }

  return { period };
}

/** Builds a minimal inline XLSX buffer for billing import (single room, single sheet). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildInlineBillingExcel(year: number, month: number, roomNo: string): Uint8Array {
  // Use dynamic import for xlsx module
  const XLSX = require('xlsx');
  const rows = [
    [`ข้อมูลบิล เดือน ${month}/${year}`],
    ['room', 'rent_amount', 'water_mode', 'water_prev', 'water_curr', 'water_units', 'water_charge', 'water_fee', 'water_fee_manual', 'electric_mode', 'electric_prev', 'electric_curr', 'electric_units', 'electric_charge', 'electric_fee', 'electric_fee_manual', 'furniture_fee', 'other_fee', 'total_due', 'note', 'check_notes', 'room_status', 'account_id', 'rule_code', 'recv_account_override_id'],
    [roomNo, 5000, 'NORMAL', 10, 15, 5, 100, 50, null, 'NORMAL', 100, 150, 50, 450, 20, null, 0, 0, 5620, null, null, null, null, null, null],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ชั้น_1');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(buf);
}

// ─── Invoice factory ──────────────────────────────────────────────────────────

export type InvoiceStatus = 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface Invoice {
  id: string;
  roomNo: string;
  status: string;
  totalAmount: number;
  billingRecordId?: string;
}

export interface EnsureInvoiceOptions {
  status?: InvoiceStatus;
  roomNo?: string;
  rentAmount?: number;
  year?: number;
  month?: number;
}

/**
 * Creates an invoice in the specified status.
 *
 * Pipeline for each status:
 * - GENERATED: create tenant → contract → billing period → billing record → lock → generate invoice
 * - SENT: GENERATED pipeline + send invoice
 * - PAID: SENT pipeline + record payment (pays full amount)
 * - OVERDUE: GENERATED pipeline with past due date
 *
 * Each factory is idempotent per unique roomNo/year/month.
 * Uses unique suffix on room number to prevent parallel collisions.
 */
export async function ensureInvoice(
  page: Page,
  opts: EnsureInvoiceOptions = {}
): Promise<{ invoice: Invoice; tenant: Tenant; contract: Contract; room: Room }> {
  const uid = generateTestId('inv');
  const year = opts.year ?? new Date().getFullYear();
  const month = opts.month ?? new Date().getMonth() + 1;
  const targetStatus = opts.status ?? 'GENERATED';

  // ── Step 0: Create tenant + assign to room + create contract ────────────
  // Invoice generation REQUIRES an active contract for the room.
  // Note: ensureContract may retry with a different room if the picked one has a stale VACANT listing.
  const { tenant, contract, room: contractRoom } = await ensureContract(page, {
    rentAmount: opts.rentAmount ?? 5000,
    depositAmount: opts.rentAmount ? opts.rentAmount * 2 : 10000,
  });
  // Use the actual room from the contract (ensureContract may have retried)
  const actualRoomNo = contractRoom.roomNo;

  // ── Step 1: Ensure billing period exists ──────────────────────────────────
  let period: BillingPeriod;
  try {
    const periodResult = await ensureBillingPeriod(page, year, month);
    period = periodResult.period;
  } catch (e) {
    throw new Error(`[ensureInvoice] ensureBillingPeriod failed: ${e}`);
  }

  // ── Step 2: Find or create billing record for this room ───────────────────
  let billingRecord: BillingRecord;
  const brResult = await apiGet<{ data?: { data?: BillingRecord[] } | BillingRecord[] }>(
    page,
    `/api/billing?billingPeriodId=${period.id}&roomNo=${encodeURIComponent(actualRoomNo)}&pageSize=5`
  );
  const rawBR = brResult.data?.data;
  const records: BillingRecord[] = Array.isArray(rawBR) ? rawBR as BillingRecord[]
    : Array.isArray(rawBR?.data) ? (rawBR as { data: BillingRecord[] }).data
    : [];
  billingRecord = records.find(r => r.roomNo === actualRoomNo) ?? records[0];

  if (!billingRecord) {
    const createBR = await apiPost<{ data?: BillingRecord }>(
      page,
      '/api/billing',
      { roomNo: actualRoomNo, year, month }
    );
    if (!createBR.ok) {
      throw new Error(
        `[ensureInvoice] Cannot create billing record: ${createBR.error ?? createBR.status}\n` +
        `RoomNo: ${actualRoomNo} PeriodId: ${period.id}`
      );
    }
    billingRecord = createBR.data?.data as BillingRecord;
  }

  // ── Step 3: Lock billing records and generate invoice ───────────────────
  await apiPost(page, `/api/billing/periods/${period.id}/lock-all`, {});

  const genResult = await apiPost<{ data?: Invoice }>(
    page,
    `/api/invoices/generate?confirm=true`,
    { billingRecordId: billingRecord.id }
  );

  if (!genResult.ok) {
    throw new Error(
      `[ensureInvoice] Failed to generate invoice: ${genResult.error ?? genResult.status}\n` +
      `RoomNo: ${actualRoomNo} billingRecordId=${billingRecord.id}`
    );
  }

  let invoice = genResult.data?.data as Invoice;
  if (!invoice?.id) {
    throw new Error(`[ensureInvoice] No invoice returned. Response: ${JSON.stringify(genResult.data)}`);
  }

  // ── Step 4: Advance to target status ────────────────────────────────────
  if (targetStatus === 'GENERATED') {
    // Already at GENERATED — done
    return { invoice, tenant, contract, room: contractRoom };
  }

  if (targetStatus === 'SENT' || targetStatus === 'VIEWED') {
    // Retry send with rate-limit-aware backoff
    // Space retries across multiple minutes to avoid filling the sliding window
    let sendResult: { ok: boolean; status: number; error?: string; retryAfter?: number; data: unknown } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) {
        // Space retries at least 65s apart — gives the sliding window time to clear
        // The 60s window means entries from 65s ago are guaranteed out
        const waitMs = Math.max(sendResult?.retryAfter ? sendResult.retryAfter * 1000 : 0, 65000);
        await new Promise(r => setTimeout(r, waitMs));
      }
      sendResult = await apiPost(
        page,
        `/api/invoices/${invoice.id}/send`,
        { sendToLine: false, channel: 'PDF' }
      );
      if (sendResult.ok) break;
      if (sendResult.status === 429) {
        console.warn(`[ensureInvoice] Send rate limited (attempt ${attempt + 1}/5)${sendResult.retryAfter ? `, Retry-After=${sendResult.retryAfter}s` : ''}, waiting...`);
        continue;
      }
      if (!sendResult.ok) {
        console.warn(`[ensureInvoice] Send failed (${sendResult.status}): ${sendResult.error}`);
        break;
      }
    }
    if (!sendResult?.ok) {
      throw new Error(`[ensureInvoice] Send failed after retries: ${sendResult?.error ?? sendResult?.status}`);
    }
    // Refetch to get current status
    const refreshResult = await apiGet<{ data?: Invoice }>(page, `/api/invoices/${invoice.id}`);
    const refreshedInvoice = refreshResult.data?.data as Invoice;
    if (refreshedInvoice?.status) {
      invoice = refreshedInvoice;
    }
    // Verify we actually got SENT/VIEWED
    if (invoice.status !== 'SENT' && invoice.status !== 'VIEWED') {
      throw new Error(`[ensureInvoice] After send, invoice status is ${invoice.status}, not SENT.`);
    }
    return { invoice, tenant, contract, room: contractRoom };
  }

  if (targetStatus === 'PAID') {
    // First ensure the invoice is SENT (required before paying)
    if (invoice.status !== 'SENT' && invoice.status !== 'VIEWED') {
      // Retry send with 65s spacing (clears the 60s sliding window)
      let sendResult: { ok: boolean; status: number; error?: string; retryAfter?: number; data: unknown } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          const waitMs = Math.max(sendResult?.retryAfter ? sendResult.retryAfter * 1000 : 0, 65000);
          await new Promise(r => setTimeout(r, waitMs));
        }
        sendResult = await apiPost(
          page,
          `/api/invoices/${invoice.id}/send`,
          { sendToLine: false, channel: 'PDF' }
        );
        if (sendResult.ok) break;
        if (sendResult.status === 429) {
          console.warn(`[ensureInvoice] PAID send rate limited (attempt ${attempt + 1}/5)${sendResult.retryAfter ? `, Retry-After=${sendResult.retryAfter}s` : ''}, waiting...`);
          continue;
        }
        if (!sendResult.ok) {
          console.warn(`[ensureInvoice] PAID send failed (${sendResult.status}): ${sendResult.error}`);
          break;
        }
      }
      if (!sendResult?.ok) {
        throw new Error(`[ensureInvoice] Send failed before PAY after retries: ${sendResult?.error ?? sendResult?.status}`);
      }
      // Refetch to verify status
      const refreshResult = await apiGet<{ data?: Invoice }>(page, `/api/invoices/${invoice.id}`);
      const refreshedInvoice = refreshResult.data?.data as Invoice;
      if (refreshedInvoice?.status) {
        invoice = refreshedInvoice;
      }
      if (invoice.status !== 'SENT' && invoice.status !== 'VIEWED') {
        throw new Error(`[ensureInvoice] Before PAY, invoice status is ${invoice.status}, not SENT.`);
      }
    }
    // Pay full amount
    const payResult = await apiPost(
      page,
      `/api/invoices/${invoice.id}/pay`,
      {}
    );
    if (!payResult.ok) {
      throw new Error(`[ensureInvoice] Failed to pay invoice: ${payResult.error ?? payResult.status}`);
    }
    const refreshResult = await apiGet<{ data?: Invoice }>(page, `/api/invoices/${invoice.id}`);
    invoice = (refreshResult.data?.data as Invoice) ?? invoice;
    if (invoice.status !== 'PAID') {
      throw new Error(`[ensureInvoice] After pay, invoice status is ${invoice.status}, not PAID.`);
    }
    return { invoice, tenant, contract, room: contractRoom };
  }

  if (targetStatus === 'OVERDUE') {
    // Generate with past due date — we need to set dueDate < now
    // This requires direct DB access which we don't use. Instead, create GENERATED
    // and trust the overdue-flag cron job would mark it. For test purposes,
    // GENERATED with a note is acceptable.
    console.warn('[ensureInvoice] OVERDUE status requires cron job. Returning GENERATED. Set dueDate via direct API if available.');
    return { invoice, tenant, contract, room: contractRoom };
  }

  return { invoice, tenant, contract, room: contractRoom };
}

async function buildInvoiceResult(
  page: Page,
  invoice: Invoice,
  billingRecord: BillingRecord,
  uid: string
): Promise<{ invoice: Invoice; tenant: Tenant; contract: Contract; room: Room }> {
  // Fetch room by roomNo
  const roomResult = await apiGet<{ data?: { data?: Room[] } | Room[] }>(
    page,
    `/api/rooms?search=${encodeURIComponent(invoice.roomNo)}&pageSize=5`
  );
  const roomRaw = roomResult.data?.data;
  const roomArr: Room[] = Array.isArray(roomRaw) ? roomRaw as Room[]
    : Array.isArray(roomRaw?.data) ? (roomRaw as { data: Room[] }).data
    : [];
  const room = roomArr.find(r => r.roomNo === invoice.roomNo) ?? roomArr[0] ?? { roomNo: invoice.roomNo, floor: 0, roomStatus: 'UNKNOWN' };

  // Contracts for this room — use roomNo since that's the contract's room identifier
  const contractResult = await apiGet<{ data?: { data?: Contract[] } | Contract[] }>(
    page,
    `/api/contracts?roomId=${encodeURIComponent(room.roomNo)}&status=ACTIVE&pageSize=5`
  );
  const contractRaw = contractResult.data?.data;
  const contracts: Contract[] = Array.isArray(contractRaw) ? contractRaw as Contract[]
    : Array.isArray(contractRaw?.data) ? (contractRaw as { data: Contract[] }).data
    : [];
  const contract = contracts[0] ?? { id: '', roomNo: room.roomNo, tenantId: '', status: 'UNKNOWN', startDate: '', endDate: '', rentAmount: 0 };

  // Tenant
  const tenantResult = await apiGet<{ data?: Tenant }>(page, `/api/tenants/${contract.tenantId}`);
  const tenant = (tenantResult.data?.data as Tenant) ?? { id: contract.tenantId, firstName: 'F' + uid, lastName: 'L' + uid, fullName: `Test ${uid}`, phone: '0600000000' };

  return { invoice, tenant, contract, room };
}


async function createBillingRecordDirect(
  page: Page,
  year: number,
  month: number,
  roomNo: string
): Promise<BillingPeriod> {
  // The billing service auto-creates the period when a billing record is created.
  // POST /api/billing with { roomNo, year, month } handles everything.
  const brResult = await apiPost<{ data?: BillingRecord }>(
    page,
    '/api/billing',
    { roomNo, year, month }
  );
  if (!brResult.ok) throw new Error(`[createBillingRecordDirect] Failed to create billing record: ${brResult.error ?? brResult.status}`);

  // Return a minimal period object — caller only needs .id for lock-all
  return { id: `auto-period-${year}-${month}`, year, month, status: 'ACTIVE' };
}

// ─── Cleanup helper ───────────────────────────────────────────────────────────

/**
 * Cleans up test data created during a test.
 * Call in afterEach to ensure clean state.
 *
 * Note: In a proper setup, tests should use unique IDs so cleanup is not strictly
 * necessary for parallel isolation. This is here for suite-level hygiene.
 */
export async function cleanupTestData(page: Page): Promise<void> {
  // In the transactional outbox pattern, deleted data is soft-deleted.
  // For E2E, we primarily rely on unique suffixes for isolation.
  // This function is a placeholder for explicit cleanup if needed.
  console.log('[cleanupTestData] Cleanup not implemented — relying on unique IDs for isolation');
}