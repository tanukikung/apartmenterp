'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('[admin/error]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-4">
        <div className="text-6xl">⚠️</div>
        <h1 className="text-2xl font-bold text-on-surface">เกิดข้อผิดพลาด</h1>
        <p className="text-on-surface-variant max-w-md">
          {error.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'}
        </p>
        {error.digest && (
          <p className="text-xs text-on-surface-variant/60 font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
        >
          ลองใหม่
        </button>
        <button
          onClick={() => (window.location.href = '/admin/dashboard')}
          className="inline-flex items-center gap-2 rounded-xl border border-outline bg-surface-container-lowest px-5 py-2.5 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
        >
          ไปหน้าแดชบอร์ด
        </button>
      </div>
    </div>
  );
}
