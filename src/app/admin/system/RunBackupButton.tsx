'use client';

import React, { useState } from 'react';

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as {
      message?: string;
      error?: string | { message?: string };
    };
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message;
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error;
    }
    if (
      record.error &&
      typeof record.error === 'object' &&
      typeof record.error.message === 'string' &&
      record.error.message.trim()
    ) {
      return record.error.message;
    }
  }
  return fallback;
}

export function RunBackupButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/system/backup/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        setMessage('สำรองข้อมูลเรียบร้อยแล้ว');
      } else {
        setMessage(extractMessage(json, 'ไม่สามารถเริ่มการสำรองข้อมูลได้'));
      }
    } catch {
      setMessage('ไม่สามารถเริ่มการสำรองข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button disabled={loading} onClick={handleClick} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50">
        {loading ? 'กำลังรัน...' : 'สำรองข้อมูลตอนนี้'}
      </button>
      {message ? <span className="text-xs text-[var(--on-surface-variant)]">{message}</span> : null}
    </div>
  );
}
