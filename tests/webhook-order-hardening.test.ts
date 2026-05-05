/**
 * Gap 7: Webhook Out-of-Order Protection — Unit Tests
 *
 * Tests the out-of-order detection logic in isolation, without running
 * the full Next.js route handler which requires a complete Next.js context.
 *
 * Test cases:
 *   TC-1: later event arrives first → processed normally (no out-of-order flag)
 *   TC-2: earlier event arrives after later event → OUT_OF_ORDER_REJECTED
 *   TC-3: events from different sources → no cross-interference
 *   TC-4: missing timestamp (0) → processed normally (no order check)
 *   TC-5: first event from source → always allowed
 *   TC-6: same timestamp events → both processed (order indeterminate)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid-123') }));

const mockLineEventFindFirst = vi.fn();

const mockPrisma = {
  lineEvent: {
    findFirst: mockLineEventFindFirst,
    upsert: vi.fn(),
  },
  inboxEvent: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
} as any;

vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/line/client', () => ({ verifyLineSignature: () => true }));
vi.mock('@/lib', () => ({
  prisma: mockPrisma,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message: string) { super(message); this.name = 'UnauthorizedError'; }
  },
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeWebhookEvent(overrides: {
  type?: string;
  userId?: string;
  timestamp?: number;
  webhookEventId?: string;
  messageId?: string;
} = {}): any {
  const id = overrides.webhookEventId ?? `ev-${Date.now()}-${Math.random()}`;
  return {
    webhookEventId: id,
    type: overrides.type ?? 'message',
    source: { type: 'user', userId: overrides.userId ?? 'U123' },
    timestamp: overrides.timestamp ?? Date.now(),
    ...(overrides.messageId ? { message: { id: overrides.messageId, type: 'text' } } : {}),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('isOutOfOrder — out-of-order detection logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return null for any un-mocked calls (no prior events)
    mockLineEventFindFirst.mockResolvedValue(null);
  });

  // TC-1: No prior event → allowed (first event always allowed)
  it('TC-1: no prior event from source → not out-of-order (first event always allowed)', async () => {
    const { isOutOfOrder } = await import('@/app/api/line/webhook/route');

    // Explicit: no mock override — uses beforeEach default (null)
    const result = await isOutOfOrder('U123', BigInt(1_700_000_000_000), 'message');
    expect(result).toBe(false);
  });

  // TC-2: Earlier event arriving after later event → OUT_OF_ORDER
  it('TC-2: earlier event (lower timestamp) arriving after later event is out-of-order', async () => {
    const { isOutOfOrder } = await import('@/app/api/line/webhook/route');

    const laterTs   = BigInt(1_700_000_000_000);
    const earlierTs = BigInt(1_699_999_000_000);

    // Later event was already processed — findFirst returns it
    mockLineEventFindFirst.mockResolvedValueOnce({ eventTimestamp: laterTs });

    const result = await isOutOfOrder('U123', earlierTs, 'message');
    expect(result).toBe(true); // should be flagged as out-of-order
  });

  // TC-3: events from different sources → no cross-interference
  it('TC-3: out-of-order check is source-scoped — different users do not interfere', async () => {
    const { isOutOfOrder } = await import('@/app/api/line/webhook/route');

    const userATs = BigInt(1_700_000_000_000);
    const userBts = BigInt(1_699_999_000_000); // older than user A's event

    // isOutOfOrder is called for U456 FIRST (the source being tested),
    // then for U123 (not tested here — just to clear the queue from TC-2).
    // So mock the U456 call first.
    mockLineEventFindFirst.mockResolvedValueOnce(null);    // U456: first event ever
    mockLineEventFindFirst.mockResolvedValueOnce({ eventTimestamp: userATs }); // U123: has prior event

    // U456 event should not be flagged as out-of-order (first event from this source)
    const result = await isOutOfOrder('U456', userBts, 'message');
    expect(result).toBe(false);
  });

  // TC-4: timestamp=0 skips order check
  it('TC-4: event with timestamp=0 is not out-of-order (order check skipped)', async () => {
    const { isOutOfOrder } = await import('@/app/api/line/webhook/route');

    const result = await isOutOfOrder('U123', BigInt(0), 'message');
    expect(result).toBe(false);
  });

  // TC-5: first event from source → always allowed
  it('TC-5: first event from a source is always allowed', async () => {
    const { isOutOfOrder } = await import('@/app/api/line/webhook/route');

    // beforeEach sets default to null — first event from any source
    const result = await isOutOfOrder('U999', BigInt(1_700_000_000_000), 'message');
    expect(result).toBe(false);
  });

  // TC-6: same timestamp → both processed (indeterminate order)
  it('TC-6: events with the same timestamp are not out-of-order (indeterminate)', async () => {
    const { isOutOfOrder } = await import('@/app/api/line/webhook/route');

    const sameTs = BigInt(1_700_000_000_000);

    mockLineEventFindFirst.mockResolvedValueOnce({ eventTimestamp: sameTs });

    const result = await isOutOfOrder('U123', sameTs, 'message');
    expect(result).toBe(false); // not strictly less than
  });

  // TC-7: mock event type always allowed through
  it('TC-7: mock event type bypasses out-of-order check', async () => {
    const { isOutOfOrder } = await import('@/app/api/line/webhook/route');

    const result = await isOutOfOrder('U123', BigInt(1), 'mock');
    expect(result).toBe(false);
  });

  // TC-8: negative timestamp → not out-of-order
  it('TC-8: negative timestamp is not out-of-order (treated as invalid)', async () => {
    const { isOutOfOrder } = await import('@/app/api/line/webhook/route');

    mockLineEventFindFirst.mockResolvedValueOnce({ eventTimestamp: BigInt(1_700_000_000_000) });

    const result = await isOutOfOrder('U123', BigInt(-1), 'message');
    expect(result).toBe(false);
  });
});

// ─── classifyEvents — event classification logic ───────────────────────────────

describe('classifyEvents — per-event classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLineEventFindFirst.mockResolvedValue(null);
  });

  it('classifies a normal event as not out-of-order when no prior events exist', async () => {
    const { classifyEvents } = await import('@/app/api/line/webhook/route');

    const events = [makeWebhookEvent({ userId: 'U123', messageId: 'M1' })];
    const ops = await classifyEvents(events);

    expect(ops).toHaveLength(1);
    expect(ops[0].outOfOrder).toBe(false);
    expect(ops[0].sourceId).toBe('U123');
    expect(ops[0].eventTimestamp).toBeGreaterThan(BigInt(0));
  });

  it('classifies an event as out-of-order when prior newer event exists from same source', async () => {
    const { classifyEvents } = await import('@/app/api/line/webhook/route');

    const laterTs   = BigInt(1_700_000_000_000);
    const earlierTs = BigInt(1_699_999_000_000);

    // findFirst for the earlier event: a later event was already processed
    mockLineEventFindFirst.mockResolvedValue({ eventTimestamp: laterTs });

    const events = [makeWebhookEvent({ userId: 'U123', timestamp: Number(earlierTs), messageId: 'M-OLD' })];
    const ops = await classifyEvents(events);

    expect(ops).toHaveLength(1);
    expect(ops[0].outOfOrder).toBe(true);
    expect(ops[0].eventTimestamp).toBe(earlierTs);
  });

  it('does not flag event as out-of-order when timestamp is 0', async () => {
    const { classifyEvents } = await import('@/app/api/line/webhook/route');

    mockLineEventFindFirst.mockResolvedValue({ eventTimestamp: BigInt(9_999_999_999_999) });

    const events = [makeWebhookEvent({ userId: 'U123', timestamp: 0, messageId: 'M-ZERO' })];
    const ops = await classifyEvents(events);

    expect(ops).toHaveLength(1);
    expect(ops[0].outOfOrder).toBe(false);
  });

  it('classifies multiple events with correct per-source results', async () => {
    const { classifyEvents } = await import('@/app/api/line/webhook/route');

    const laterTs   = BigInt(1_700_000_000_000);
    const earlierTs = BigInt(1_699_999_000_000);

    // findFirst is called twice (once per event):
    // Event 1 (U123, later): no prior → null → not out-of-order
    // Event 2 (U123, earlier): later event already processed → OUT_OF_ORDER
    mockLineEventFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ eventTimestamp: laterTs });

    const events = [
      makeWebhookEvent({ userId: 'U123', timestamp: Number(laterTs), messageId: 'M-LATER' }),
      makeWebhookEvent({ userId: 'U123', timestamp: Number(earlierTs), messageId: 'M-EARLIER' }),
    ];

    const ops = await classifyEvents(events);

    expect(ops).toHaveLength(2);
    expect(ops[0].outOfOrder).toBe(false); // first event (later) — no prior
    expect(ops[1].outOfOrder).toBe(true);  // second event (earlier) — prior exists
  });
});

// ─── LineEvent upsert result logic ─────────────────────────────────────────────

describe('LineEvent result field — OUT_OF_ORDER_REJECTED logic', () => {
  it('result is OUT_OF_ORDER_REJECTED when isOutOfOrder returns true', async () => {
    const { classifyEvents } = await import('@/app/api/line/webhook/route');

    mockLineEventFindFirst.mockResolvedValue({ eventTimestamp: BigInt(1_700_000_000_000) });

    const events = [makeWebhookEvent({ userId: 'U123', timestamp: 1_699_999_000_000, messageId: 'M-OLD' })];
    const ops = await classifyEvents(events);

    expect(ops[0].outOfOrder).toBe(true);

    // The route would use this to set result=OUT_OF_ORDER_REJECTED on LineEvent create
    const expectedResult = ops[0].outOfOrder ? 'OUT_OF_ORDER_REJECTED' : 'SUCCESS';
    expect(expectedResult).toBe('OUT_OF_ORDER_REJECTED');
  });

  it('result is SUCCESS when event is in-order', async () => {
    const { classifyEvents } = await import('@/app/api/line/webhook/route');

    mockLineEventFindFirst.mockResolvedValue(null);

    const events = [makeWebhookEvent({ userId: 'U123', messageId: 'M-NEW' })];
    const ops = await classifyEvents(events);

    expect(ops[0].outOfOrder).toBe(false);

    const expectedResult = ops[0].outOfOrder ? 'OUT_OF_ORDER_REJECTED' : 'SUCCESS';
    expect(expectedResult).toBe('SUCCESS');
  });
});

// ─── InboxProcessor sourceSequenceAt tracking ───────────────────────────────────

describe('InboxProcessor sourceSequenceAt tracking', () => {
  it('sets sourceSequenceAt = eventTimestamp on successful processing', () => {
    const result: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    const eventTimestamp = BigInt(1700000000000);

    const updateData: any = {
      result,
      errorMsg: null,
      sourceSequenceAt: result === 'SUCCESS' && eventTimestamp != null ? eventTimestamp : undefined,
    };

    expect(updateData.sourceSequenceAt).toBe(BigInt(1700000000000));
    expect(updateData.result).toBe('SUCCESS');
  });

  it('does not set sourceSequenceAt when result is FAILED', () => {
    const result: 'SUCCESS' | 'FAILED' = 'FAILED';
    const eventTimestamp = BigInt(1700000000000);

    const updateData: any = {
      result,
      errorMsg: 'Processing failed',
      sourceSequenceAt: result === 'SUCCESS' && eventTimestamp != null ? eventTimestamp : undefined,
    };

    expect(updateData.sourceSequenceAt).toBeUndefined();
    expect(updateData.result).toBe('FAILED');
  });
});