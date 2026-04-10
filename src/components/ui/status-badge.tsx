'use client';

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface StatusBadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean; // show a small colored dot before the text
}

// ---------------------------------------------------------------------------
// Variant map
// ---------------------------------------------------------------------------

const VARIANT_STYLES: Record<BadgeVariant, { cls: string; dotCls: string }> = {
  success: {
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotCls: 'bg-emerald-500',
  },
  danger: {
    cls: 'bg-red-50 text-red-700 border-red-200',
    dotCls: 'bg-red-500',
  },
  warning: {
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    dotCls: 'bg-amber-500',
  },
  info: {
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
    dotCls: 'bg-blue-500',
  },
  neutral: {
    cls: 'bg-surface-container-low text-on-surface-variant border-outline-variant',
    dotCls: 'bg-on-surface-variant',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusBadge({ variant = 'neutral', children, className = '', dot = false }: StatusBadgeProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${styles.cls} ${className}`}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dotCls}`} />
      )}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helper to map domain statuses to variants
// ---------------------------------------------------------------------------

// Room statuses
export function roomStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'VACANT': return 'success';
    case 'OCCUPIED': return 'info';
    case 'MAINTENANCE': return 'warning';
    case 'OWNER_USE': return 'neutral';
    default: return 'neutral';
  }
}

// Invoice statuses
export function invoiceStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'PAID': return 'success';
    case 'OVERDUE': return 'danger';
    case 'GENERATED': return 'info';
    case 'SENT':
    case 'VIEWED': return 'warning';
    case 'CANCELLED': return 'neutral';
    default: return 'neutral';
  }
}

// Generic helpers
export function statusVariant(status: string): BadgeVariant {
  const lower = status.toLowerCase();
  if (['paid', 'active', 'occupied', 'matched', 'success', 'confirmed'].includes(lower)) return 'success';
  if (['overdue', 'failed', 'cancelled', 'rejected', 'danger', 'error'].includes(lower)) return 'danger';
  if (['pending', 'sent', 'viewed', 'processing', 'warning', 'review'].includes(lower)) return 'warning';
  if (['draft', 'inactive', 'vacant', 'info'].includes(lower)) return 'info';
  return 'neutral';
}
