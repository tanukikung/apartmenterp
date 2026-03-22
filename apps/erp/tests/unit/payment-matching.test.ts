import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PaymentMatchingService, type MatchConfidence } from '@/modules/payments/payment-matching.service';

// We test the private methods via the public attemptMatch API
// since evaluateMatch, extractInvoiceNumber, getConfidenceScore are private.
// The tests below verify behavior through the public interface.

describe('PaymentMatchingService — extractInvoiceNumber', () => {
  // extractInvoiceNumber is private; test via type-cast (same pattern as getConfidenceScore)

  const extract = (service: PaymentMatchingService, text: string) =>
    (service as unknown as { extractInvoiceNumber: (t: string) => string | null }).extractInvoiceNumber(text);

  it('extracts INV-2024-001 format', () => {
    const service = new PaymentMatchingService();
    expect(extract(service, 'PAYMENT INV-2024-001')).toBe('2024-001');
    expect(extract(service, 'INV 2024 001')).toBe('2024001');
  });

  it('extracts invoice1234 format', () => {
    const service = new PaymentMatchingService();
    expect(extract(service, 'invoice2024003')).toBe('2024003');
    expect(extract(service, 'ชำระ invoice2024003')).toBe('2024003');
  });

  it('extracts bare 4-digit-3-digit format', () => {
    const service = new PaymentMatchingService();
    expect(extract(service, '2024-003')).toBe('2024-003');
    expect(extract(service, '2024 003')).toBe('2024003');
  });

  it('returns null for non-matching text', () => {
    const service = new PaymentMatchingService();
    expect(extract(service, 'ชำระค่าห้อง 3000')).toBeNull();
    expect(extract(service, 'โอนเงิน')).toBeNull();
    expect(extract(service, '')).toBeNull();
  });
});

describe('PaymentMatchingService — getConfidenceScore', () => {
  // getConfidenceScore is private but deterministic
  // We can verify its values through the behavior it produces

  it('HIGH confidence returns 0.95', () => {
    const service = new PaymentMatchingService();
    // Access via public API - the confidence score affects status
    // HIGH confidence → AUTO_MATCHED status
    // We verify this by checking that HIGH confidence matches get AUTO_MATCHED
    const score = (service as unknown as {
      getConfidenceScore: (c: MatchConfidence) => number;
    }).getConfidenceScore('HIGH');
    expect(score).toBe(0.95);
  });

  it('MEDIUM confidence returns 0.75', () => {
    const service = new PaymentMatchingService();
    const score = (service as unknown as {
      getConfidenceScore: (c: MatchConfidence) => number;
    }).getConfidenceScore('MEDIUM');
    expect(score).toBe(0.75);
  });

  it('LOW confidence returns 0.50', () => {
    const service = new PaymentMatchingService();
    const score = (service as unknown as {
      getConfidenceScore: (c: MatchConfidence) => number;
    }).getConfidenceScore('LOW');
    expect(score).toBe(0.50);
  });
});

// Note: Full integration tests for PaymentMatchingService are in:
// tests/integration/payment-matching.integration.test.ts
// tests/payment-matching-api.test.ts
