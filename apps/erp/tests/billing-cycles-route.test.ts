/**
 * billing-cycles-route.test.ts
 *
 * Tests for GET /api/billing-cycles — the new list endpoint added in Phase 6.
 *
 * Covers:
 *  1. Auth guard: missing session → 401
 *  2. Returns paginated BillingCycle list with aggregate stats
 *  3. Status filter is forwarded to Prisma where clause
 *  4. buildingId filter is applied
 *  5. Aggregate stats computed correctly (totalRecords, totalAmount, invoiceCount, pendingInvoices)
 *  6. pendingInvoices counts only GENERATED | SENT | VIEWED | OVERDUE (not PAID)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { signSessionToken } from '@/lib/auth/session';

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockCount = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@/lib/db/client', () => ({
  prisma: {
    billingCycle: {
      count: mockCount,
      findMany: mockFindMany,
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
function makeCycle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cycle-1',
    year: 2026,
    month: 3,
    status: 'OPEN',
    building: { id: 'bldg-1', name: 'Building A' },
    billingDate: null,
    dueDate: null,
    overdueDate: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    importBatches: [],
    billingRecords: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/billing-cycles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      makeCycle({
        billingRecords: [
          {
            id: 'rec-1',
            subtotal: '5000.00',
            invoices: [
              { id: 'inv-1', status: 'SENT' },
              { id: 'inv-2', status: 'PAID' },
            ],
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
    expect(cycle.totalRecords).toBe(1);
    expect(cycle.totalAmount).toBe(5000);
    expect(cycle.invoiceCount).toBe(2);
    // SENT counts as pending; PAID does not
    expect(cycle.pendingInvoices).toBe(1);
  });

  it('counts pendingInvoices correctly: GENERATED+SENT+VIEWED+OVERDUE are pending, PAID is not', async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([
      makeCycle({
        billingRecords: [
          {
            id: 'rec-1',
            subtotal: '0',
            invoices: [
              { id: 'i1', status: 'GENERATED' },
              { id: 'i2', status: 'SENT' },
              { id: 'i3', status: 'VIEWED' },
              { id: 'i4', status: 'OVERDUE' },
              { id: 'i5', status: 'PAID' },
              { id: 'i6', status: 'DRAFT' },
            ],
          },
        ],
      }),
    ]);

    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({ cookie });
    const res = await GET(req as never);
    const body = await res.json();

    const cycle = body.data.data[0];
    // GENERATED + SENT + VIEWED + OVERDUE = 4 pending; PAID and DRAFT excluded
    expect(cycle.pendingInvoices).toBe(4);
    expect(cycle.invoiceCount).toBe(6);
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

  it('passes buildingId filter to Prisma where clause', async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const cookie = adminCookie();
    const { GET } = await import('@/app/api/billing-cycles/route');
    const req = makeRequest({
      cookie,
      url: 'http://localhost/api/billing-cycles?buildingId=bldg-99',
    });
    await GET(req as never);

    const whereArg = mockCount.mock.calls[0][0].where;
    expect(whereArg.buildingId).toBe('bldg-99');
  });

  it('returns correct pagination metadata', async () => {
    mockCount.mockResolvedValue(45);
    mockFindMany.mockResolvedValue(Array.from({ length: 20 }, (_, i) =>
      makeCycle({ id: `cycle-${i}`, billingRecords: [] })
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
});
