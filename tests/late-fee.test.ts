import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateLateFee } from '@/modules/reminders';

/**
 * Unit tests for late fee calculation.
 * Formula: min(daysOverdue * penaltyPerDay, maxPenalty)
 * If daysOverdue <= 0 or penaltyPerDay <= 0, return 0.
 */

describe('calculateLateFee', () => {
  it('returns 0 when daysOverdue is 0', () => {
    expect(calculateLateFee(0, 50, 500)).toBe(0);
  });

  it('returns 0 when daysOverdue is negative', () => {
    expect(calculateLateFee(-3, 50, 500)).toBe(0);
  });

  it('returns 0 when penaltyPerDay is 0', () => {
    expect(calculateLateFee(5, 0, 500)).toBe(0);
  });

  it('returns 0 when penaltyPerDay is negative', () => {
    expect(calculateLateFee(5, -10, 500)).toBe(0);
  });

  it('calculates simple fee without cap', () => {
    // 10 days * 30 per day = 300, no maxPenalty (0)
    expect(calculateLateFee(10, 30, 0)).toBe(300);
  });

  it('caps fee at maxPenalty', () => {
    // 10 days * 30 = 300, but cap is 200
    expect(calculateLateFee(10, 30, 200)).toBe(200);
  });

  it('returns exact fee when under cap', () => {
    // 5 days * 30 = 150, cap is 200 -> no cap applied
    expect(calculateLateFee(5, 30, 200)).toBe(150);
  });

  it('handles large day counts', () => {
    // 60 days * 20 = 1200, cap 500
    expect(calculateLateFee(60, 20, 500)).toBe(500);
  });

  it('returns 0 when maxPenalty is 0 (treated as no cap)', () => {
    // With maxPenalty=0, this means no cap — should return full fee
    expect(calculateLateFee(3, 50, 0)).toBe(150);
  });

  it('handles decimal values', () => {
    expect(calculateLateFee(5, 10.5, 0)).toBeCloseTo(52.5);
  });
});