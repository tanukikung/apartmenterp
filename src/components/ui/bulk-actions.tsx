'use client';

import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          layout
          className={`flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary-container/20 via-primary-container/10 to-primary-container/20 px-4 py-3 shadow-sm shadow-primary/10 backdrop-blur-sm ${className}`}
        >
          {/* Selection count with spring pop */}
          <div className="flex items-center gap-2">
            <motion.span
              key={count}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="inline-flex items-center justify-center rounded-full bg-primary min-w-[1.75rem] h-7 px-2 text-xs font-bold text-on-primary shadow-sm shadow-primary/40"
            >
              {count}
            </motion.span>
            <span className="text-sm font-medium text-on-surface">รายการที่เลือก</span>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-outline-variant/30" aria-hidden="true" />

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action, idx) => (
              <motion.button
                key={idx}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={action.onClick}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  action.variant === 'danger'
                    ? 'border-error-container/30 bg-error-container/10 text-error hover:bg-error-container/20'
                    : 'border-outline bg-surface-container-lowest text-on-surface hover:bg-surface-container'
                }`}
              >
                {action.icon}
                {action.label}
              </motion.button>
            ))}
          </div>

          {/* Clear button */}
          <div className="ml-auto">
            <motion.button
              whileHover={{ y: -1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClear}
              aria-label="ล้างการเลือก"
              className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-2 py-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <X className="h-3.5 w-3.5" />
              <span>ล้าง</span>
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
