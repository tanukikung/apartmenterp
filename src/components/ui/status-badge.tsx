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
  /** Animate the dot with a pulsing ring (for "live"/active statuses) */
  pulse?: boolean;
}

// ---------------------------------------------------------------------------
// Variant map
// ---------------------------------------------------------------------------

const VARIANT_STYLES: Record<BadgeVariant, { cls: string; dotCls: string; ringCls: string }> = {
  success: {
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    dotCls: 'bg-emerald-500',
    ringCls: 'bg-emerald-500/40',
  },
  danger: {
    cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
    dotCls: 'bg-red-500',
    ringCls: 'bg-red-500/40',
  },
  warning: {
    cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    dotCls: 'bg-amber-500',
    ringCls: 'bg-amber-500/40',
  },
  info: {
    cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
    dotCls: 'bg-blue-500',
    ringCls: 'bg-blue-500/40',
  },
  neutral: {
    cls: 'bg-surface-container-low text-on-surface-variant border-outline-variant',
    dotCls: 'bg-on-surface-variant',
    ringCls: 'bg-on-surface-variant/30',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusBadge({
  variant = 'neutral',
  children,
  className = '',
  dot = false,
  pulse = false,
}: StatusBadgeProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 hover:scale-[1.03] ${styles.cls} ${className}`}
    >
      {dot && (
        <span className={`relative w-1.5 h-1.5 rounded-full shrink-0 ${styles.dotCls}`}>
          {pulse && (
            <span
              className={`absolute inset-0 rounded-full ${styles.ringCls}`}
              style={{ animation: 'pulse-glow 1.8s ease-in-out infinite' }}
            />
          )}
        </span>
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
