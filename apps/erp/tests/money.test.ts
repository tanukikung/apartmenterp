import { describe, it, expect } from 'vitest';
import { mulCurrency, addCurrency, toCurrencyString } from '@/lib/utils/money';

describe('money utils', () => {
  it('multiplies quantity * unitPrice precisely', () => {
    expect(mulCurrency(2, 19.99)).toBe('39.98');
    expect(mulCurrency(3, '0.1')).toBe('0.30');
    expect(mulCurrency('0.1', '0.2')).toBe('0.02');
  });

  it('adds monetary values accurately', () => {
    expect(addCurrency([19.99, 5.01])).toBe('25.00');
    expect(addCurrency(['0.1', '0.2', '0.3'])).toBe('0.60');
  });

  it('formats currency values', () => {
    expect(toCurrencyString(10)).toBe('10.00');
    expect(toCurrencyString('10.5')).toBe('10.50');
  });
});
