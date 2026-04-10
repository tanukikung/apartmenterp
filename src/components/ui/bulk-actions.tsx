'use client';

import React from 'react';
import { X } from 'lucide-react';

interface BulkAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  icon?: React.ReactNode;
}

interface BulkActionsProps {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
  className?: string;
}

export function BulkActions({ count, actions, onClear, className = '' }: BulkActionsProps) {
  if (count === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary-container/10 px-4 py-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200 ${className}`}
    >
      {/* Selection count */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center rounded-full bg-primary-container min-w-[1.75rem] h-7 px-2 text-xs font-bold text-primary-container">
          {count}
        </span>
        <span className="text-sm font-medium text-on-surface">
          {count === 1 ? 'รายการที่เลือก' : `รายการที่เลือก`}
        </span>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-outline-variant/30" aria-hidden="true" />

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action, idx) => (
          <button
            key={idx}
            onClick={action.onClick}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              action.variant === 'danger'
                ? 'border-error-container/30 bg-error-container/10 text-error hover:bg-error-container/20'
                : 'border-outline bg-surface-container-lowest text-on-surface hover:bg-surface-container'
            }`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

      {/* Clear button */}
      <div className="ml-auto">
        <button
          onClick={onClear}
          aria-label="Clear selection"
          className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-2 py-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <X className="h-3.5 w-3.5" />
          ล้าง
        </button>
      </div>
    </div>
  );
}
