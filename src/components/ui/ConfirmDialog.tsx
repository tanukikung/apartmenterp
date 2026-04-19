'use client';

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  dangerous = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={onCancel}
          />
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="relative z-10 w-full max-w-sm rounded-2xl border border-outline/30 bg-surface-container-lowest p-6 shadow-2xl ring-1 ring-black/5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <div className="flex items-start gap-4">
              {dangerous && (
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.05, type: 'spring', stiffness: 400, damping: 20 }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-container"
                >
                  <AlertTriangle className="h-5 w-5 text-error" />
                </motion.div>
              )}
              <div className="flex-1 min-w-0">
                <h2 id="confirm-dialog-title" className="text-base font-semibold text-on-surface">
                  {title}
                </h2>
                {description && (
                  <p className="mt-1.5 text-sm text-on-surface-variant">{description}</p>
                )}
              </div>
              <button
                onClick={onCancel}
                className="shrink-0 rounded-full p-1 text-on-surface-variant transition-all hover:bg-surface-container hover:rotate-90"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={onCancel}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                {cancelLabel}
              </motion.button>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={onConfirm}
                disabled={loading}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 ${
                  dangerous
                    ? 'border border-error bg-error text-on-error hover:bg-error/90 shadow-error/30'
                    : 'border border-primary bg-primary text-on-primary hover:bg-primary/90 shadow-primary/30'
                }`}
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : null}
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
