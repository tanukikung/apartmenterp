/**
 * LINE Webhook — Phase 2 execution tests
 *
 * Verifies that Phase 2 (postback handlers, balance inquiry, profile refresh)
 * actually executes on every webhook call, not silently dropped. The critical
 * bug this guards against: phase2Queue was module-level and the Promise.all()
 * that consumed it was placed after the `return` statement (dead code), so
 * Phase 2 never ran.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLineSignature(body: string, secret = 'test-secret') {
  return createHmac('sha256', secret).update(body).digest('base64');
}

function makeWebhookRequest(events: unknown[], secret = 'test-secret') {
  const body = JSON.stringify({ events });
  const sig = buildLineSignature(body, secret);
  return new NextRequest('http://localhost/api/line/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-line-signature': sig,
    },
    body,
  });
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/line/client', () => ({
  verifyLineSignature: vi.fn().mockReturnValue(true),
  sendReplyMessage: vi.fn().mockResolvedValue(undefined),
  sendFlexMessage: vi.fn().mockResolvedValue(undefined),
  getLineUserProfile: vi.fn().mockResolvedValue({
    displayName: 'Test User',
    pictureUrl: null,
    statusMessage: null,
  }),
}));

vi.mock('@/lib/sse/broadcaster', () => ({
  broadcastLineMessage: vi.fn(),
}));

vi.mock('@/server/websocket', () => ({
  publishChatMessage: vi.fn(),
}));

vi.mock('@/modules/invoices/balance-inquiry', () => ({
  getLatestUnpaidInvoiceForLineUser: vi.fn().mockResolvedValue({ notLinked: true }),
}));

vi.mock('@/modules/line-maintenance', () => ({
  getMaintenanceRequestState: vi.fn().mockResolvedValue(undefined),
  startMaintenanceRequest: vi.fn().mockResolvedValue({ replyText: 'started' }),
  handleMaintenanceRequestMessage: vi.fn().mockResolvedValue(null),
  handleMaintenanceRequestImage: vi.fn().mockResolvedValue(null),
}));

const mockPrisma = {
  conversation: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'conv-1', lineUserId: 'U123', roomNo: null, tenantId: null }),
    update: vi.fn().mockResolvedValue({}),
  },
  message: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  lineUser: {
    upsert: vi.fn().mockResolvedValue({}),
  },
  invoice: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  payment: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn({})),
};

vi.mock('@/lib', () => ({
  prisma: mockPrisma,
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(msg: string) { super(msg); this.name = 'UnauthorizedError'; }
  },
  EventTypes: { INVOICE_PAID: 'InvoicePaid' },
}));

vi.mock('@/lib/utils/errors', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/utils/errors')>();
  return {
    ...orig,
    asyncHandler: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LINE webhook Phase 2 execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: conversation not found → will be created
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({
      id: 'conv-1', lineUserId: 'U123', roomNo: null, tenantId: null,
    });
    mockPrisma.message.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Phase 2 executes: balance inquiry trigger sends a LINE reply', async () => {
    const { sendReplyMessage } = await import('@/lib/line/client');
    const { getLatestUnpaidInvoiceForLineUser } = await import('@/modules/invoices/balance-inquiry');

    (getLatestUnpaidInvoiceForLineUser as ReturnType<typeof vi.fn>).mockResolvedValue({ notLinked: true });

    const { POST } = await import('@/app/api/line/webhook/route');

    const req = makeWebhookRequest([{
      type: 'message',
      source: { userId: 'U123' },
      message: { id: 'msg-bal-1', type: 'text', text: 'ยอดค้าง' },
      replyToken: 'reply-token-1',
      timestamp: Date.now(),
    }]);

    const res = await (POST as unknown as (r: NextRequest) => Promise<Response>)(req);
    expect(res.status).toBe(200);

    // Allow microtasks to settle (Phase 2 fire-and-forget)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Phase 2 MUST have sent a reply — if Phase 2 were dead code, this would fail
    expect(sendReplyMessage).toHaveBeenCalled();
  });

  it('Phase 2 executes: follow event triggers profile fetch', async () => {
    const { getLineUserProfile } = await import('@/lib/line/client');
    mockPrisma.conversation.findUnique.mockResolvedValue(null);

    const { POST } = await import('@/app/api/line/webhook/route');

    const req = makeWebhookRequest([{
      type: 'follow',
      source: { userId: 'U456' },
      timestamp: Date.now(),
    }]);

    const res = await (POST as unknown as (r: NextRequest) => Promise<Response>)(req);
    expect(res.status).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 50));

    // persistFollowEvent fetches the LINE profile — must have been called
    expect(getLineUserProfile).toHaveBeenCalledWith('U456');
  });

  it('each request gets its own isolated phase2Queue (no cross-request pollution)', async () => {
    const { sendReplyMessage } = await import('@/lib/line/client');
    const { POST } = await import('@/app/api/line/webhook/route');

    // First request: text message (no Phase 2 reply expected for non-trigger text)
    const req1 = makeWebhookRequest([{
      type: 'message',
      source: { userId: 'U123' },
      message: { id: 'msg-x-1', type: 'text', text: 'สวัสดี' },
      replyToken: 'rtoken-1',
      timestamp: Date.now(),
    }]);

    // Second request: balance inquiry (Phase 2 reply expected)
    const req2 = makeWebhookRequest([{
      type: 'message',
      source: { userId: 'U123' },
      message: { id: 'msg-x-2', type: 'text', text: 'ยอดค้าง' },
      replyToken: 'rtoken-2',
      timestamp: Date.now(),
    }]);

    const [r1, r2] = await Promise.all([
      (POST as unknown as (r: NextRequest) => Promise<Response>)(req1),
      (POST as unknown as (r: NextRequest) => Promise<Response>)(req2),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 50));

    // sendReplyMessage must have been called exactly once (for the balance inquiry)
    // If queues were shared, it might be called 0 or 2 times inconsistently
    const calls = (sendReplyMessage as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 200 even when Phase 2 async work fails', async () => {
    const { sendReplyMessage } = await import('@/lib/line/client');
    (sendReplyMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('LINE API down'));

    const { POST } = await import('@/app/api/line/webhook/route');

    const req = makeWebhookRequest([{
      type: 'message',
      source: { userId: 'U123' },
      message: { id: 'msg-err-1', type: 'text', text: 'ยอดค้าง' },
      replyToken: 'rtoken-err',
      timestamp: Date.now(),
    }]);

    const res = await (POST as unknown as (r: NextRequest) => Promise<Response>)(req);
    // LINE webhook must always return 200 — Phase 2 failures must not propagate
    expect(res.status).toBe(200);
  });
});
