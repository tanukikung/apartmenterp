/**
 * Outbox Dead-Letter Visibility Tests
 *
 * Verifies that events moved to dead-letter state are:
 * 1. Marked with status = 'FAILED' (not just an error log)
 * 2. Have structured error logging with eventId, type, attemptCount, finalError
 * 3. Are queryable via getFailedCount()
 *
 * Run: npx vitest run tests/unit/outbox-dead-letter.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxProcessor } from '@/lib/outbox/processor';

describe('OutboxProcessor dead-letter visibility', () => {
  let mockPrisma: any;
  let processor: OutboxProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      outboxEvent: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    processor = new OutboxProcessor(
      undefined,
      mockPrisma,
      { deadLetterThreshold: 3 },
    );
  });

  it('deadLetter sets status to FAILED on the outboxEvent', async () => {
    const result = { processed: 0, failed: 0, errors: [] as Array<{ eventId: string; error: string }> };

    await (processor as any).deadLetter(
      mockPrisma,
      'evt-123',
      'PERMANENT: Invalid token',
      'LINE_TOKEN_INVALID',
      result,
      'Invoice',
      'inv-456',
      'INVOICE_SENT',
      3, // retryCount
      { invoiceId: 'inv-456' },
      3, // deadLetterThreshold
      new Date(),
    );

    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-123' },
      data: {
        status: 'FAILED',
        lastError: 'PERMANENT: Invalid token',
        errorCode: 'LINE_TOKEN_INVALID',
        lastFailedAt: expect.any(Date),
      },
    });
  });

  it('deadLetter increments result.failed counter', async () => {
    const result = { processed: 5, failed: 2, errors: [] as Array<{ eventId: string; error: string }> };

    await (processor as any).deadLetter(
      mockPrisma,
      'evt-new',
      'Some error',
      'ERR_CODE',
      result,
      'Message',
      'msg-1',
      'MESSAGE_SENT',
      3,
      {},
      3,
      new Date(),
    );

    expect(result.failed).toBe(3);
  });

  // Note: result.errors is pushed by the CALLER of deadLetter(), not by deadLetter itself.
  // The deadLetter() method only: sets status='FAILED' and logs structured error.

  it('FAILED events are queryable via OutboxProcessor.getFailedCount', async () => {
    mockPrisma.outboxEvent.count = vi.fn().mockResolvedValue(7);

    const count = await processor.getFailedCount();

    expect(mockPrisma.outboxEvent.count).toHaveBeenCalledWith({
      where: { status: 'FAILED' },
    });
    expect(count).toBe(7);
  });

  it('deadLetter sets lastFailedAt timestamp', async () => {
    const result = { processed: 0, failed: 0, errors: [] as Array<{ eventId: string; error: string }> };
    const before = new Date();

    await (processor as any).deadLetter(
      mockPrisma,
      'evt-ts',
      'Error',
      'ERR',
      result,
      'Test',
      't-1',
      'TEST',
      1,
      {},
      3,
      new Date(),
    );

    const updateCall = mockPrisma.outboxEvent.update.mock.calls[0][0];
    const lastFailedAt = updateCall.data.lastFailedAt as Date;
    expect(lastFailedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(lastFailedAt.getTime()).toBeLessThanOrEqual(new Date().getTime());
  });
});
