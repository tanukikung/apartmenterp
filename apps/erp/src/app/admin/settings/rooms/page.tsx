'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, DoorOpen } from 'lucide-react';

type RoomConfig = {
  defaultCapacity: number;
  allowedStatuses: string[];
  requireApprovalForCheckout: boolean;
  maintenanceLockDays: number;
};

const DEFAULTS: RoomConfig = {
  defaultCapacity: 2,
  allowedStatuses: ['VACANT', 'OCCUPIED', 'MAINTENANCE', 'SELF_USE', 'UNAVAILABLE'],
  requireApprovalForCheckout: false,
  maintenanceLockDays: 3,
};

export default function SettingsRoomsPage() {
  const [config, setConfig] = useState<RoomConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' }).then((r) => r.json());
        if (!res.success) throw new Error('API error');
        const d = res.data as Record<string, unknown>;
        setConfig({
          defaultCapacity: typeof d.defaultRoomCapacity === 'number' ? d.defaultRoomCapacity : DEFAULTS.defaultCapacity,
          allowedStatuses: DEFAULTS.allowedStatuses,
          requireApprovalForCheckout: typeof d.requireApprovalForCheckout === 'boolean' ? d.requireApprovalForCheckout : DEFAULTS.requireApprovalForCheckout,
          maintenanceLockDays: typeof d.maintenanceLockDays === 'number' ? d.maintenanceLockDays : DEFAULTS.maintenanceLockDays,
        });
      } catch {
        setApiAvailable(false);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultRoomCapacity: config.defaultCapacity,
          requireApprovalForCheckout: config.requireApprovalForCheckout,
          maintenanceLockDays: config.maintenanceLockDays,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error((res.error?.message as string | undefined) ?? 'Save failed');
      setMessage('Room settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link href="/admin/settings" className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Settings
          </Link>
          <span className="text-slate-300">/</span>
          <div>
            <h1 className="admin-page-title">Room Settings</h1>
            <p className="admin-page-subtitle">Configure default room capacity, status rules, and checkout policies.</p>
          </div>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {!apiAvailable ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Settings API not available. Displaying defaults only.
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <form onSubmit={(e) => void save(e)} className="space-y-6">
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-2">
                <DoorOpen className="h-4 w-4 text-indigo-500" /> Room Defaults
              </div>
            </div>
            <div className="grid gap-6 p-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Default Capacity</label>
                <p className="mb-2 text-xs text-slate-500">Maximum occupants when creating a new room</p>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="admin-input"
                  value={config.defaultCapacity}
                  onChange={(e) => setConfig((c) => ({ ...c, defaultCapacity: Number(e.target.value) }))}
                  disabled={!apiAvailable}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Maintenance Lock Days</label>
                <p className="mb-2 text-xs text-slate-500">Days a room stays locked after maintenance begins</p>
                <input
                  type="number"
                  min={0}
                  max={365}
                  className="admin-input"
                  value={config.maintenanceLockDays}
                  onChange={(e) => setConfig((c) => ({ ...c, maintenanceLockDays: Number(e.target.value) }))}
                  disabled={!apiAvailable}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Checkout Approval</label>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="approvalCheckbox"
                    checked={config.requireApprovalForCheckout}
                    onChange={(e) => setConfig((c) => ({ ...c, requireApprovalForCheckout: e.target.checked }))}
                    disabled={!apiAvailable}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  <label htmlFor="approvalCheckbox" className="text-sm text-slate-700">
                    Require admin approval before tenant checkout
                  </label>
                </div>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-3">
            <button type="submit" className="admin-button admin-button-primary" disabled={saving || !apiAvailable}>
              {saving ? 'Saving...' : 'Save Room Settings'}
            </button>
            <Link href="/admin/settings" className="admin-button">Cancel</Link>
          </div>
        </form>
      )}
    </main>
  );
}
