'use client';

import { useEffect, useState } from 'react';

type SettingsResponse = {
  billingDay: number;
  dueDay: number;
  overdueDay: number;
  appBaseUrl: string;
  lineChannelIdConfigured: boolean;
  lineAccessTokenConfigured: boolean;
};

export default function AdminSettingsClient() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings').then((response) => response.json());
      if (!res.success) {
        throw new Error(res.error?.message || 'Unable to load settings');
      }
      setSettings(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function saveBillingSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!settings) return;
    setWorking(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingDay: Number(settings.billingDay),
          dueDay: Number(settings.dueDay),
          overdueDay: Number(settings.overdueDay),
        }),
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'Unable to save settings');
      }

      setMessage(res.message || 'Billing settings updated');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings');
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <main className="admin-page">
        <section className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Settings</h1>
            <p className="admin-page-subtitle">Loading operational defaults.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Settings</h1>
          <p className="admin-page-subtitle">Configure billing cadence and review environment-backed integrations.</p>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="admin-card cute-surface">
          <div className="admin-card-header">
            <div className="admin-card-title">Billing Configuration</div>
          </div>
          <form className="grid gap-4 p-4 md:grid-cols-3" onSubmit={saveBillingSettings}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Billing Day</label>
              <input
                className="admin-input"
                type="number"
                min={1}
                max={28}
                value={settings?.billingDay ?? 1}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, billingDay: Number(e.target.value) } : prev))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Due Day</label>
              <input
                className="admin-input"
                type="number"
                min={1}
                max={31}
                value={settings?.dueDay ?? 5}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, dueDay: Number(e.target.value) } : prev))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Overdue Day</label>
              <input
                className="admin-input"
                type="number"
                min={1}
                max={31}
                value={settings?.overdueDay ?? 15}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, overdueDay: Number(e.target.value) } : prev))}
              />
            </div>
            <div className="md:col-span-3">
              <button className="admin-button admin-button-primary" disabled={working}>
                {working ? 'Saving...' : 'Save Billing Settings'}
              </button>
            </div>
          </form>
        </section>

        <section className="admin-card cute-surface">
          <div className="admin-card-header">
            <div className="admin-card-title">Integrations</div>
          </div>
          <div className="grid gap-3 p-4 text-sm text-slate-600">
            <div className="rounded-3xl border border-indigo-100 bg-indigo-50/70 px-4 py-3">
              <div className="font-medium text-slate-900">App Base URL</div>
              <div className="mt-1">{settings?.appBaseUrl || 'Not set in environment'}</div>
            </div>
            <div className="rounded-3xl border border-sky-100 bg-sky-50/70 px-4 py-3">
              <div className="font-medium text-slate-900">LINE Channel ID</div>
              <div className="mt-1">{settings?.lineChannelIdConfigured ? 'Configured' : 'Missing'}</div>
            </div>
            <div className="rounded-3xl border border-amber-100 bg-amber-50/70 px-4 py-3">
              <div className="font-medium text-slate-900">LINE Access Token</div>
              <div className="mt-1">{settings?.lineAccessTokenConfigured ? 'Configured' : 'Missing'}</div>
            </div>
            <div className="rounded-3xl border border-sky-100 bg-sky-50 px-4 py-3 text-sky-800">
              User creation, role assignment, and password reset operations are managed from the Admin Users screen.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
