'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface RejectDialogProps {
  open: boolean;
  username: string;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function RejectDialog({
  open,
  username,
  loading = false,
  onConfirm,
  onCancel,
}: RejectDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-outline bg-surface-container-lowest p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-container">
            <AlertTriangle className="h-5 w-5 text-error" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-on-surface">ปฏิเสธ {username}</h2>
            <p className="mt-1.5 text-sm text-on-surface-variant">
              ระบุเหตุผลเพิ่มเติมได้ (ไม่บังคับ) ข้อมูลนี้จะถูกบันทึกพร้อมกับรายการ
            </p>
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 rounded-full p-1 text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          className="mt-4 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50"
          placeholder="เหตุผลในการปฏิเสธ (ไม่บังคับ)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
        />

        <div className="mt-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-error bg-error px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-error/90 disabled:opacity-50"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : null}
            ยืนยันปฏิเสธ
          </button>
        </div>
      </div>
    </div>
  );
}
