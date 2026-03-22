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
      <main className="space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold text-on-primary">Settings</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">Loading operational defaults.</p>
            </div>
            <div className="flex items-center gap-3"></div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-on-primary">Settings</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">Configure billing cadence and review environment-backed integrations.</p>
          </div>
          <div className="flex items-center gap-3"></div>
        </div>
      </div>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-4 shadow-lg">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
            <div className="relative flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-on-primary">Billing Configuration</h2>
              </div>
              <div className="flex items-center gap-3"></div>
            </div>
          </div>
          <form className="grid gap-4 p-4 md:grid-cols-3" onSubmit={saveBillingSettings}>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">Billing Day</label>
              <input
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                type="number"
                min={1}
                max={28}
                value={settings?.billingDay ?? 1}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, billingDay: Number(e.target.value) } : prev))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">Due Day</label>
              <input
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                type="number"
                min={1}
                max={31}
                value={settings?.dueDay ?? 5}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, dueDay: Number(e.target.value) } : prev))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">Overdue Day</label>
              <input
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                type="number"
                min={1}
                max={31}
                value={settings?.overdueDay ?? 15}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, overdueDay: Number(e.target.value) } : prev))}
              />
            </div>
            <div className="md:col-span-3">
              <button className="inline-flex items-center gap-2 rounded-lg border border-primary bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container" disabled={working}>
                {working ? 'Saving...' : 'Save Billing Settings'}
              </button>
            </div>
          </form>
        </section>

        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-4 shadow-lg">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
            <div className="relative flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-on-primary">Integrations</h2>
              </div>
              <div className="flex items-center gap-3"></div>
            </div>
          </div>
          <div className="grid gap-3 p-4 text-sm text-on-surface-variant">
            <div className="rounded-3xl border border-primary-container bg-primary-container/70 px-4 py-3">
              <div className="font-medium text-on-surface">App Base URL</div>
              <div className="mt-1">{settings?.appBaseUrl || 'Not set in environment'}</div>
            </div>
            <div className="rounded-3xl border border-primary-container bg-primary-container/70 px-4 py-3">
              <div className="font-medium text-on-surface">LINE Channel ID</div>
              <div className="mt-1">{settings?.lineChannelIdConfigured ? 'Configured' : 'Missing'}</div>
            </div>
            <div className="rounded-3xl border border-primary-container bg-primary-container/70 px-4 py-3">
              <div className="font-medium text-on-surface">LINE Access Token</div>
              <div className="mt-1">{settings?.lineAccessTokenConfigured ? 'Configured' : 'Missing'}</div>
            </div>
            <div className="rounded-3xl border border-primary-container bg-primary-container px-4 py-3 text-on-surface-variant">
              User creation, role assignment, and password reset operations are managed from the Admin Users screen.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
