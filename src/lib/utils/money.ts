import Decimal from 'decimal.js';

export function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

export function mulCurrency(
  a: number | string | Decimal,
  b: number | string | Decimal,
  scale: number = 2
): string {
  return toDecimal(a).mul(toDecimal(b)).toFixed(scale);
}

export function addCurrency(
  values: Array<number | string | Decimal>,
  scale: number = 2
): string {
  let sum = new Decimal(0);
  for (const v of values) {
    sum = sum.add(toDecimal(v));
  }
  return sum.toFixed(scale);
}

export function toCurrencyString(value: number | string | Decimal, scale: number = 2): string {
  return toDecimal(value).toFixed(scale);
}
