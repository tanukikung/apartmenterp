/**
 * billing-cycles-route.test.ts
 *
 * Tests for GET /api/billing-cycles — the list endpoint.
 *
 * Covers:
 *  1. Auth guard: missing session → 401
 *  2. Returns paginated BillingPeriod list with aggregate stats
 *  3. Status filter is forwarded to Prisma where clause
 *  4. buildingId filter is applied (no-op since BillingPeriod has no buildingId — just verifies no crash)
 *  5. Aggregate stats computed correctly (totalRecords, totalAmount, invoiceCount, pendingInvoices)
 *  6. pendingInvoices counts only GENERATED | SENT | VIEWED | OVERDUE (not PAID)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signSessionToken } from '@/lib/auth/session';

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockCount = vi.fn();
const mockFindMany = vi.fn();
const mockRoomCount = vi.fn();

vi.mock('@/lib/db/client', () => ({
  prisma: {
    billingPeriod: {
      count: mockCount,
      findMany: mockFindMany,
    },
    room: {
      count: mockRoomCount,
    },
  },
}));

// ── Auth cookie helper ────────────────────────────────────────────────────────
function parseCookies(cookieStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of cookieStr.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return result;
}

function makeRequest(overrides: {
  cookie?: string;
  url?: string;
}): Request {
  const cookieMap = parseCookies(overrides.cookie ?? '');
  const req = {
    url: overrides.url ?? 'http://localhost/api/billing-cycles',
    cookies: {
      get: (name: string) => {
        const val = cookieMap[name];
        return val !== undefined ? { value: val } : undefined;
      },
    },
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'cookie' ? (overrides.cookie ?? null) : null,
    },
  };
  return req as unknown as Request;
}

function adminCookie(): string {
  const token = signSessionToken({
    sub: 'user-admin-1',
    role: 'ADMIN',
    username: 'owner',
    displayName: 'Owner',
    forcePasswordChange: false,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `auth_session=${token}`;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makePeriod(overrides: Record<string, unknown> = {}) {
  return {
    id: 'period-1',
    year: 2026,
    month: 3,
    status: 'OPEN',
    dueDay: 25,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    importBatches: [],
    roomBillings: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/billing-cycles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoomCount.mockResolvedValue(0);
  });

  it('returns 401 when no auth session', async () => {
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({});
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it('returns paginated list with aggregate stats', async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([
      makePeriod({
        roomBillings: [
          {
            id: 'rec-1',
            totalDue: '5000.00',
            invoice: { id: 'inv-1', status: 'SENT' },
          },
          {
            id: 'rec-2',
            totalDue: '0',
            invoice: { id: 'inv-2', status: 'PAID' },
          },
        ],
      }),
    ]);

    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({ cookie });
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const cycle = body.data.data[0];
    expect(cycle.totalRecords).toBe(2);
    expect(cycle.totalAmount).toBe(5000);
    expect(cycle.invoiceCount).toBe(2);
    // SENT counts as pending; PAID does not
    expect(cycle.pendingInvoices).toBe(1);
  });

  it('counts pendingInvoices correctly: GENERATED+SENT+VIEWED+OVERDUE are pending, PAID is not', async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([
      makePeriod({
        roomBillings: [
          { id: 'r1', totalDue: '0', invoice: { id: 'i1', status: 'GENERATED' } },
          { id: 'r2', totalDue: '0', invoice: { id: 'i2', status: 'SENT' } },
          { id: 'r3', totalDue: '0', invoice: { id: 'i3', status: 'VIEWED' } },
          { id: 'r4', totalDue: '0', invoice: { id: 'i4', status: 'OVERDUE' } },
          { id: 'r5', totalDue: '0', invoice: { id: 'i5', status: 'PAID' } },
          { id: 'r6', totalDue: '0', invoice: null },
        ],
      }),
    ]);

    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({ cookie });
    const res = await GET(req as never);
    const body = await res.json();

    const cycle = body.data.data[0];
    // GENERATED + SENT + VIEWED + OVERDUE = 4 pending; PAID excluded; null invoice excluded
    expect(cycle.pendingInvoices).toBe(4);
    expect(cycle.invoiceCount).toBe(5);
  });

  it('passes status filter to Prisma where clause', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({
      cookie,
      url: 'http://localhost/api/billing-cycles?status=LOCKED',
    });
    await GET(req as never);

    const whereArg = mockCount.mock.calls[0][0].where;
    expect(whereArg.status).toBe('LOCKED');
  });

  it('does not crash with unknown query params', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({
      cookie,
      url: 'http://localhost/api/billing-cycles?buildingId=bldg-99',
    });
    const res = await GET(req as never);
    expect(res.status).toBe(200);
  });

  it('returns correct pagination metadata', async () => {
    mockCount.mockResolvedValue(45);
    mockFindMany.mockResolvedValue(Array.from({ length: 20 }, (_, i) =>
      makePeriod({ id: `period-${i}`, roomBillings: [] })
    ));

    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({
      cookie,
      url: 'http://localhost/api/billing-cycles?page=2&pageSize=20',
    });
    const res = await GET(req as never);
    const body = await res.json();

    expect(body.data.total).toBe(45);
    expect(body.data.page).toBe(2);
    expect(body.data.pageSize).toBe(20);
    expect(body.data.totalPages).toBe(3);
  });

  it('returns 400 for status=IMPORTED (not a BillingPeriodStatus value)', async () => {
    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({
      cookie,
      url: 'http://localhost/api/billing-cycles?status=IMPORTED',
    });
    const res = await GET(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_STATUS');
  });

  it('returns 400 for status=INVOICED (not a BillingPeriodStatus value)', async () => {
    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({
      cookie,
      url: 'http://localhost/api/billing-cycles?status=INVOICED',
    });
    const res = await GET(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_STATUS');
  });

  it('returns 200 for status=OPEN', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({
      cookie,
      url: 'http://localhost/api/billing-cycles?status=OPEN',
    });
    const res = await GET(req as never);
    expect(res.status).toBe(200);
  });

  it('returns 200 for status=LOCKED', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({
      cookie,
      url: 'http://localhost/api/billing-cycles?status=LOCKED',
    });
    const res = await GET(req as never);
    expect(res.status).toBe(200);
  });

  it('returns 200 for status=CLOSED', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({
      cookie,
      url: 'http://localhost/api/billing-cycles?status=CLOSED',
    });
    const res = await GET(req as never);
    expect(res.status).toBe(200);
  });
});
