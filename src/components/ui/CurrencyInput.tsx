'use client';

import React, { useEffect, useState } from 'react';

interface CurrencyInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
  allowDecimal?: boolean;
}

/**
 * Thai Baht input with live thousand-separator formatting.
 * - Stores the underlying number via `onChange(value | null)`.
 * - Renders the typed value with `.toLocaleString('th-TH')` while editing.
 * - Accepts digits, one decimal dot, and commas (which are stripped).
 *
 * Example:
 *   <CurrencyInput value={amount} onChange={setAmount} />
 */
export function CurrencyInput({
  value,
  onChange,
  placeholder = '0.00',
  className = '',
  required = false,
  disabled = false,
  ariaLabel,
  id,
  allowDecimal = true,
}: CurrencyInputProps) {
  const [raw, setRaw] = useState<string>(() => formatForEdit(value, allowDecimal));

  // Sync when external value changes
  useEffect(() => {
    const next = formatForEdit(value, allowDecimal);
    setRaw((prev) => (numericallyEqual(prev, next) ? prev : next));
  }, [value, allowDecimal]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target.value.replace(/,/g, '');
    // Guard: only digits and up to one dot
    if (!/^-?\d*(\.\d*)?$/.test(input)) return;
    setRaw(input);
    if (input === '' || input === '-') {
      onChange(null);
      return;
    }
    const n = parseFloat(input);
    if (Number.isFinite(n)) onChange(n);
  }

  function handleBlur() {
    // On blur, reformat cleanly
    setRaw(formatForEdit(value, allowDecimal));
  }

  // Show formatted value when not focused; raw while typing
  return (
    <input
      id={id}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={displayValue(raw)}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

function displayValue(raw: string): string {
  if (raw === '' || raw === '-') return raw;
  // Split out the integer portion for thousand-separator formatting.
  const [intPart, decPart] = raw.split('.');
  const n = parseInt(intPart.replace('-', ''), 10);
  if (!Number.isFinite(n)) return raw;
  const sign = intPart.startsWith('-') ? '-' : '';
  const intFmt = n.toLocaleString('en-US');
  return decPart !== undefined ? `${sign}${intFmt}.${decPart}` : `${sign}${intFmt}`;
}

function formatForEdit(value: number | null, allowDecimal: boolean): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (allowDecimal) {
    // Preserve up to 2 decimals when meaningful
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(Math.trunc(value));
}

function numericallyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const na = parseFloat(a.replace(/,/g, ''));
  const nb = parseFloat(b.replace(/,/g, ''));
  if (Number.isNaN(na) && Number.isNaN(nb)) return true;
  return na === nb;
}
