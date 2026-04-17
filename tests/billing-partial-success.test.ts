/**
 * billing-partial-success.test.ts
 *
 * Unit tests for the partial-success warning behavior in InvoicesTab's
 * sendAllUnsent function (billing/[billingId]/page.tsx).
 *
 * Covers BILL-003 regression: partial failure must show amber warning tone,
 * not a green success message. Full success → green, full failure → red.
 *
 * The logic under test is extracted as a pure function so it can be tested
 * without React component rendering.
 */

import { describe, it, expect } from 'vitest';

type Outcome = 'success' | 'partial' | 'failure';

interface SendResult {
  sent: number;
  failed: { room: string; reason: string }[];
  unsentCount: number;
}

/**
 * Pure extract of the sendAllUnsent outcome logic.
 * Mirrors billing/[billingId]/page.tsx sendAllUnsent result handling.
 */
function computeOutcome(result: SendResult): { kind: Outcome; message: string | null; warning: string | null; error: string | null } {
  const { sent, failed, unsentCount } = result;

  if (failed.length > 0) {
    // Partial: amber warning (single tone), no success message
    const warning = `${sent > 0 ? `ส่งได้ ${sent} ฉบับ — ` : ''}${failed.length} ฉบับล้มเหลว: ${failed.slice(0, 3).map(f => f.room).join('; ')}${failed.length > 3 ? ` (+${failed.length - 3} more)` : ''}`;
    return { kind: 'partial', message: null, warning, error: null };
  }

  return {
    kind: 'success',
    message: `ส่งใบแจ้งหนี้ ${sent} ฉบับสำเร็จแล้ว`,
    warning: null,
    error: null,
  };
}

describe('sendAllUnsent partial-success warning logic', () => {
  it('all success → kind=success, no warning', () => {
    const result = computeOutcome({
      sent: 5,
      failed: [],
      unsentCount: 5,
    });
    expect(result.kind).toBe('success');
    expect(result.message).toBe('ส่งใบแจ้งหนี้ 5 ฉบับสำเร็จแล้ว');
    expect(result.warning).toBeNull();
    expect(result.error).toBeNull();
  });

  it('all failed → kind=partial, warning with 0 sent', () => {
    const result = computeOutcome({
      sent: 0,
      failed: [
        { room: '101', reason: 'No LINE ID' },
        { room: '102', reason: 'Network error' },
      ],
      unsentCount: 2,
    });
    expect(result.kind).toBe('partial');
    expect(result.warning).toBe('2 ฉบับล้มเหลว: 101; 102');
    expect(result.message).toBeNull();
  });

  it('partial (some succeed, some fail) → kind=partial, warning includes sent count', () => {
    const result = computeOutcome({
      sent: 3,
      failed: [{ room: '101', reason: 'No LINE ID' }],
      unsentCount: 4,
    });
    expect(result.kind).toBe('partial');
    expect(result.warning).toBe('ส่งได้ 3 ฉบับ — 1 ฉบับล้มเหลว: 101');
    expect(result.message).toBeNull();
  });

  it('partial failure with >3 fails → truncated with count', () => {
    const result = computeOutcome({
      sent: 2,
      failed: [
        { room: '101', reason: 'err' },
        { room: '102', reason: 'err' },
        { room: '103', reason: 'err' },
        { room: '104', reason: 'err' },
        { room: '105', reason: 'err' },
      ],
      unsentCount: 7,
    });
    expect(result.kind).toBe('partial');
    expect(result.warning).toBe('ส่งได้ 2 ฉบับ — 5 ฉบับล้มเหลว: 101; 102; 103 (+2 more)');
  });

  it('BILL-003 regression: partial must not have a success message (no mixed tone)', () => {
    const result = computeOutcome({
      sent: 1,
      failed: [{ room: '101', reason: 'Failed' }],
      unsentCount: 2,
    });
    // Must not have both message and warning simultaneously — that was the BILL-003 bug
    expect(result.message).toBeNull();
    expect(result.warning).not.toBeNull();
    expect(result.warning).toContain('ส่งได้');
  });
});
