import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signSessionToken } from '@/lib/auth/session';
import {
  NotFoundError,
  ValidationError,
} from '@/lib/utils/errors';

const sendInvoiceMock = vi.fn();
const logAuditMock = vi.fn(async () => {});

vi.mock('@/lib/service-container', () => ({
  getServiceContainer: () => ({
    invoiceService: {
      sendInvoice: sendInvoiceMock,
    },
    eventBus: { publish: vi.fn(), subscribe: vi.fn() },
  }),
}));

vi.mock('@/modules/audit', () => ({
  logAudit: logAuditMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeAuthCookie(role: 'ADMIN' | 'STAFF' = 'ADMIN'): string {
  const token = signSessionToken({
    sub: `test-${role.toLowerCase()}`,
    username: `${role.toLowerCase()}-user`,
    displayName: `${role} User`,
    role,
    forcePasswordChange: false,
    buildingId: null,
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
        const value = cookieMap[name];
        return value !== undefined ? { value } : undefined;
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

const SUCCESS_RESULT = {
  queued: true,
  invoice: {
    id: 'valid-invoice-id',
    invoiceNumber: 'INV-001',
    roomId: 'room-1',
    billingRecordId: 'billing-1',
    year: 2024,
    month: 3,
    version: 1,
    status: 'SENT' as const,
    subtotal: 5500,
    totalAmount: 5500,
    dueDate: new Date('2024-03-31T00:00:00Z'),
    issuedAt: new Date('2024-03-01T00:00:00Z'),
    sentAt: new Date('2024-03-01T00:00:00Z'),
    sentBy: 'test-admin',
    viewedAt: null,
    paidAt: null,
    createdAt: new Date('2024-03-01T00:00:00Z'),
    updatedAt: new Date('2024-03-01T00:00:00Z'),
  },
  errorMessage: null,
  lineConfigured: true,
  hasLineRecipient: true,
  deliveryStatus: 'PENDING' as const,
  deliveryId: 'delivery-1',
  messageTemplateId: 'msg-1',
  documentTemplateId: 'doc-1',
  documentTemplateHash: 'a'.repeat(64),
  pdfUrl: 'http://localhost/api/invoices/valid-invoice-id/pdf',
};

describe('POST /api/invoices/[id]/send', () => {
  const VALID_ID = 'valid-invoice-id';

  beforeEach(() => {
    vi.clearAllMocks();
    sendInvoiceMock.mockResolvedValue(SUCCESS_RESULT);
  });

  it('returns 401 when no auth cookie is present', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: undefined });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });

    expect(res.status).toBe(401);
    expect(sendInvoiceMock).not.toHaveBeenCalled();
  });

  it('returns 401 when auth cookie is invalid', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: 'auth_session=invalid.tampered.token; role=ADMIN' });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });

    expect(res.status).toBe(401);
    expect(sendInvoiceMock).not.toHaveBeenCalled();
  });

  it('returns 200 when authenticated as ADMIN and the service queues the send', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('ADMIN'), body: {} });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(sendInvoiceMock).toHaveBeenCalledWith(
      VALID_ID,
      { sendToLine: true, channel: 'LINE' },
      'test-admin'
    );
  });

  it('returns 200 when authenticated as STAFF', async () => {
    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('STAFF'), body: {} });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });

    expect(res.status).toBe(200);
    expect(sendInvoiceMock).toHaveBeenCalledWith(
      VALID_ID,
      { sendToLine: true, channel: 'LINE' },
      'test-staff'
    );
  });

  it('returns 404 when the service reports a missing invoice', async () => {
    sendInvoiceMock.mockRejectedValueOnce(new NotFoundError('Invoice', VALID_ID));

    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('ADMIN'), body: {} });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });

    expect(res.status).toBe(404);
  });

  it('returns 409 when LINE delivery is not queueable', async () => {
    sendInvoiceMock.mockResolvedValueOnce({
      ...SUCCESS_RESULT,
      queued: false,
      invoice: null,
      errorMessage: 'LINE is not configured',
      lineConfigured: false,
      hasLineRecipient: false,
      deliveryStatus: 'FAILED',
      messageTemplateId: null,
    });

    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('ADMIN'), body: {} });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('LINE is not configured');
  });

  it('returns 422 when the invoice is already sent or paid', async () => {
    sendInvoiceMock.mockRejectedValueOnce(new ValidationError('Invoice is already sent'));

    const mod = await import('@/app/api/invoices/[id]/send/route');
    const req = makeRequest({ cookie: makeAuthCookie('ADMIN'), body: {} });

    const res: Response = await (mod as any).POST(req, { params: { id: VALID_ID } });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error.message).toContain('already sent');
  });
});
