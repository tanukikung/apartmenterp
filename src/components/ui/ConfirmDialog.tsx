'use client';

import { useEffect, ReactNode, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ConfirmDialogPreview {
  before: Record<string, string>;
  after: Record<string, string>;
  labels?: Record<string, string>;
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
  loading?: boolean;
  /** Show before→after preview of the change */
  preview?: ConfirmDialogPreview;
  /** Require a reason string before confirming */
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void;
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
  preview,
  reasonRequired = false,
  reasonLabel = 'เหตุผล',
  reasonPlaceholder = 'ระบุเหตุผล...',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');

  // Reset reason when dialog closes
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  const canConfirm = !reasonRequired || reason.trim().length >= 5;

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
            className="relative z-10 w-full max-w-md rounded-2xl border border-outline/30 bg-surface-container-lowest p-6 shadow-2xl ring-1 ring-black/5"
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

            {/* Phase 8.5: Before → After preview */}
            {preview && (
              <div className="mt-4 rounded-xl border border-[hsl(var(--color-border))] overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-[hsl(var(--color-border))]">
                  <div className="bg-red-500/5 px-3 py-2">
                    <p className="text-xs font-semibold text-red-500 mb-1">ก่อน</p>
                    {Object.entries(preview.before).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-1.5 text-xs">
                        <span className="text-on-surface-variant">{preview.labels?.[k] ?? k}:</span>
                        <span className="font-medium text-red-400 line-through">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-emerald-500/5 px-3 py-2">
                    <p className="text-xs font-semibold text-emerald-500 mb-1">หลัง</p>
                    {Object.entries(preview.after).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-1.5 text-xs">
                        <span className="text-on-surface-variant">{preview.labels?.[k] ?? k}:</span>
                        <span className="font-medium text-emerald-600">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Phase 8.5: Reason input */}
            {reasonRequired && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  {reasonLabel} <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={reasonPlaceholder}
                  rows={2}
                  className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/40"
                />
                <p className="mt-1 text-xs text-on-surface-variant">
                  {reason.trim().length < 5 && reason.trim().length > 0
                    ? `ต้องระบุอย่างน้อย 5 ตัวอักษร (${reason.trim().length}/5)`
                    : `${reason.trim().length} ตัวอักษร`}
                </p>
              </div>
            )}

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
                onClick={() => onConfirm(reason.trim() || undefined)}
                disabled={loading || !canConfirm}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
