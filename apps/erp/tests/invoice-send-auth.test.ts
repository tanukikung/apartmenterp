/**
 * invoice-send-auth.test.ts
 *
 * Hardening tests for POST /api/invoices/[id]/send covering:
 *  1. Missing auth session → 401 Unauthorized
 *  2. Authenticated as ADMIN → proceeds (mock delivery created)
 *  3. Invalid/non-existent invoice ID → 404 Not Found
 *  4. LINE not configured → delivery created with status FAILED + correct error
 *  5. lineUserId never exposed in response meta (PII guard)
 *  6. documentTemplateId + hash snapshot persisted in InvoiceDelivery
 *
 * These verify the requireRole guard added in the final hardening pass and
 * ensure mismatched IDs fail safely through the service layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signSessionToken } from '@/lib/auth/session';
import { mockPrismaClient } from './mocks/prisma';

// ── Shared Prisma instance ────────────────────────────────────────────────────
// Both @/lib/db/client and @/lib must expose the SAME instance so test-level
// mock setups (invoice.findUnique, invoiceDelivery.create, etc.) affect the
// route, which imports from @/lib.
const sharedPrisma = mockPrismaClient();

vi.mock('@/lib/db/client', () => ({
  prisma: sharedPrisma,
}));

vi.mock('@/lib', () => ({
  prisma: sharedPrisma,
  isLineConfigured: vi.fn(() => false), // LINE not configured by default
}));

// ── Invoice service mock ──────────────────────────────────────────────────────
vi.mock('@/modules/invoices/invoice.service', () => ({
  getInvoiceService: () => ({
    markInvoiceSent: vi.fn(async (id: string) => {
      if (id === 'not-found-id') {
        const { NotFoundError } = await import('@/lib/utils/errors');
        throw new NotFoundError('Invoice', id);
      }
      return {
        id,
        invoiceNumber: 'INV-001',
        status: 'SENT',
        totalAmount: 5500,
        dueDate: new Date('2024-03-31').toISOString(),
        room: { id: 'room-1', roomNumber: '101', roomTenants: [] },
      };
    }),
  }),
}));

// ── Outbox mock ───────────────────────────────────────────────────────────────
vi.mock('@/lib/outbox', () => ({
  getOutboxProcessor: () => ({
    writeOne: vi.fn(async () => {}),
  }),
}));

// ── Audit log mock ────────────────────────────────────────────────────────────
vi.mock('@/modules/audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAuthCookie(role: 'ADMIN' | 'STAFF' = 'ADMIN'): string {
  const token = signSessionToken({
    sub: `test-${role.toLowerCase()}`,
    username: `${role.toLowerCase()}-user`,
    displayName: `${role} User`,
    role,
    forcePasswordChange: false,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `auth_session=${token}; role=${role}`;
}

function parseCookies(cookieStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of cookieStr.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
  }
  return result;
}

function makeRequest(overrides: { cookie?: string; body?: unknown }): any {
  const cookieMap = parseCookies(overrides.cookie ?? '');
  return {
    url: 'http://localhost/api/invoices/test-id/send',
    nextUrl: new URL('http://localhost/api/invoices/test-id/send'),
    method: 'POST',
    cookies: {
      get: (name: string) => {
        const val = cookieMap[name];
        return val !== undefined ? { value: val } : undefined;
      },
    },
    headers: {
      get: (key: string) => {
        if (key.toLowerCase() === 'cookie') return overrides.cookie ?? null;
        if (key.toLowerCase() === 'content-type') return 'application/json';
        return null;
      },
    },
    json: vi.fn(async () => overrides.body ?? {}),
  };
}

/** Reset shared prisma mocks to safe defaults before each test. */
function resetPrismaMocks() {
  sharedPrisma.invoice.findUnique.mockResolvedValue(null);
  sharedPrisma.invoiceDelivery.create.mockResolvedValue({ id: 'delivery-default' });
  sharedPrisma.documentTemplate.findFirst.mockResolvedValue(null);
  sharedPrisma.messageTemplate.findFirst.mockResolvedValue(null);
  sharedPrisma.messageTemplate.findUnique.mockResolvedValue(null);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/invoices/[id]/send — auth guard', () => {
  const VALID_ID = 'valid-invoice-id';

  beforeEach(() => {
    vi.clearAllMocks();
    resetPrismaMocks();
    sharedPrisma.invoice.findUnique.mockResolvedValue({
      id: VALID_ID,
      room: { roomTenants: [] },
    });
  });

  it('returns 401 when no auth cookie is present', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: undefined });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });
    expect(res.status).toBe(401);
  });

  it('returns 401 when auth cookie is invalid/tampered', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: 'auth_session=invalid.tampered.token; role=ADMIN' });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });
    expect(res.status).toBe(401);
  });

  it('returns 200 when authenticated as ADMIN with valid invoice', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('ADMIN'), body: {} });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 200 when authenticated as STAFF', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('STAFF'), body: {} });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/invoices/[id]/send — 404 on invalid ID', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPrismaMocks();
  });

  it('returns 404 when invoice ID does not exist', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('ADMIN'), body: {} });

    // 'not-found-id' triggers NotFoundError in the mocked service
    const res: Response = await (mod as any).POST(req, { params: { id: 'not-found-id' } });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/invoices/[id]/send — LINE not configured state', () => {
  const INVOICE_ID = 'line-test-invoice';

  beforeEach(() => {
    vi.clearAllMocks();
    resetPrismaMocks();
    sharedPrisma.invoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      room: { roomTenants: [] }, // no tenant → no lineUserId
    });
  });

  it('creates delivery with FAILED status when LINE is not configured', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('ADMIN'), body: {} });

    const res: Response = await (mod as any).POST(req, { params: { id: INVOICE_ID } });
    expect(res.status).toBe(200);

    const json = await res.json();
    // LINE not configured → delivery is FAILED
    expect(json.meta.deliveryStatus).toBe('FAILED');
    expect(json.meta.lineConfigured).toBe(false);
    // lineUserId must NOT be exposed in response
    expect(json.meta.lineUserId).toBeUndefined();
    // hasLineRecipient replaces lineUserId
    expect(typeof json.meta.hasLineRecipient).toBe('boolean');
  });

  it('does NOT expose lineUserId in response meta (PII guard)', async () => {
    sharedPrisma.invoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      room: {
        roomTenants: [
          {
            tenant: { lineUserId: 'U_SENSITIVE_LINE_ID' },
            role: 'PRIMARY',
            moveOutDate: null,
          },
        ],
      },
    });

    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('ADMIN'), body: {} });

    const res: Response = await (mod as any).POST(req, { params: { id: INVOICE_ID } });
    const json = await res.json();

    const bodyStr = JSON.stringify(json);
    expect(bodyStr).not.toContain('U_SENSITIVE_LINE_ID');
    expect(json.meta?.lineUserId).toBeUndefined();
  });

  it('persists documentTemplateId + SHA-256 hash snapshot in InvoiceDelivery', async () => {
    const TEMPLATE_ID = 'tmpl-abc-123';
    const TEMPLATE_BODY = 'กรุณาชำระเงิน\nThank you';

    sharedPrisma.documentTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      body: TEMPLATE_BODY,
    });

    const createSpy = vi.fn().mockResolvedValue({ id: 'delivery-snap' });
    sharedPrisma.invoiceDelivery.create = createSpy;

    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('ADMIN'), body: {} });

    await (mod as any).POST(req, { params: { id: INVOICE_ID } });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentTemplateId: TEMPLATE_ID,
          documentTemplateHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
  });
});
