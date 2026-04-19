// Shared utility functions for move-outs components

import type { MoveOutStatus } from './types';
import { formatDate, formatDateTime } from '@/lib/utils';

// Re-export for backward compatibility
export { formatDate as fmtDate, formatDateTime as fmtDateTime };

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
