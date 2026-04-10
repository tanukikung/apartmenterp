// Shared utility functions for move-outs components

import type { MoveOutStatus } from './types';

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtMoney(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0 }) + ' ฿';
}

export function resolveStatusVariant(
  status: MoveOutStatus,
): 'pending' | 'inspection' | 'calculated' | 'confirmed' | 'refunded' | 'cancelled' {
  const map: Record<
    MoveOutStatus,
    'pending' | 'inspection' | 'calculated' | 'confirmed' | 'refunded' | 'cancelled'
  > = {
    PENDING: 'pending',
    INSPECTION_DONE: 'inspection',
    DEPOSIT_CALCULATED: 'calculated',
    CONFIRMED: 'confirmed',
    REFUNDED: 'refunded',
    CANCELLED: 'cancelled',
  };
  return map[status];
}
