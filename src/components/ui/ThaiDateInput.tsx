'use client';

import React from 'react';

interface ThaiDateInputProps {
  value: string; // ISO YYYY-MM-DD
  onChange: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  /** Show the Thai Buddhist-year label next to the input. Default true. */
  showThaiLabel?: boolean;
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatThai(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = THAI_MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

/**
 * Wrapper around <input type="date"> that shows a Thai Buddhist-year formatted
 * label next to the native picker. The underlying value stays ISO (YYYY-MM-DD)
 * so backends and Prisma continue to work untouched.
 */
export function ThaiDateInput({
  value,
  onChange,
  required = false,
  disabled = false,
  min,
  max,
  id,
  ariaLabel,
  className = '',
  showThaiLabel = true,
}: ThaiDateInputProps) {
  const thaiLabel = formatThai(value);

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        aria-label={ariaLabel}
        className={className}
      />
      {showThaiLabel && thaiLabel && (
        <span className="text-xs text-on-surface-variant whitespace-nowrap">
          ({thaiLabel})
        </span>
      )}
    </div>
  );
}
