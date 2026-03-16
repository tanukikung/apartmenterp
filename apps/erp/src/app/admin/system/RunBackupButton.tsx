'use client';

import React, { useState } from 'react';

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
        setMessage('Backup triggered successfully');
      } else {
        setMessage(json?.error || 'Backup trigger failed');
      }
    } catch {
      setMessage('Backup trigger failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button disabled={loading} onClick={handleClick} className="admin-button admin-button-primary disabled:opacity-50">
        {loading ? 'Running...' : 'Run Backup Now'}
      </button>
      {message ? <span className="text-xs text-slate-600">{message}</span> : null}
    </div>
  );
}
