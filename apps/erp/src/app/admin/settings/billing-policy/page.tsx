'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Save } from 'lucide-react';

type BillingSettings = {
  billingDay: number;
  dueDay: number;
  overdueDay: number;
};

type ApiResponse = {
  success: boolean;
  data?: BillingSettings;
  error?: { message?: string };
};

const DEFAULTS: BillingSettings = {
  billingDay: 1,
  dueDay: 5,
  overdueDay: 15,
};

function SettingRow({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <div className="font-semibold text-slate-900">{label}</div>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="admin-input w-24 text-center tabular-nums"
      />
    </div>
  );
}

export default function BillingPolicyPage() {
  const [fields, setFields] = useState<BillingSettings>(DEFAULTS);
  const [originalFields, setOriginalFields] = useState<BillingSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await fetch('/api/admin/settings', { cache: 'no-store' }).then((r) =>
        r.json()
      )) as ApiResponse;
      if (!res.success || !res.data) {
        throw new Error(res.error?.message ?? 'Unable to load billing settings');
      }
      setFields(res.data);
      setOriginalFields(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load billing settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = JSON.stringify(fields) !== JSON.stringify(originalFields);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = (await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      }).then((r) => r.json())) as ApiResponse;

      if (!res.success) {
        throw new Error(res.error?.message ?? 'Unable to save billing settings');
      }
      setOriginalFields(fields);
      setMessage('Billing calendar updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save billing settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="admin-page-title">Billing Calendar</h1>
            <p className="admin-page-subtitle">
              This page is connected to the real billing settings API.
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <div className="auth-alert auth-alert-success">{message}</div>
      ) : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="rounded-2xl border border-sky-100 bg-sky-50/60 px-5 py-4 text-sm text-sky-800">
        Only the billing day, due day, and overdue day are supported here. Late fees, grace
        periods, and other policy controls remain deferred until backend support exists.
      </section>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <SettingRow
            label="Billing Day"
            description="Day of the month when billing records are created."
            value={fields.billingDay}
            min={1}
            max={28}
            onChange={(billingDay) => setFields((prev) => ({ ...prev, billingDay }))}
          />
          <SettingRow
            label="Due Day"
            description="Day of the month when invoices become due."
            value={fields.dueDay}
            min={1}
            max={31}
            onChange={(dueDay) => setFields((prev) => ({ ...prev, dueDay }))}
          />
          <SettingRow
            label="Overdue Day"
            description="Day of the month when unpaid invoices are treated as overdue."
            value={fields.overdueDay}
            min={1}
            max={31}
            onChange={(overdueDay) => setFields((prev) => ({ ...prev, overdueDay }))}
          />
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          {isDirty ? 'You have unsaved billing calendar changes.' : 'Billing calendar is up to date.'}
        </div>
        <div className="flex items-center gap-3">
          {isDirty ? (
            <button
              onClick={() => {
                setFields(originalFields);
                setMessage(null);
                setError(null);
              }}
              className="admin-button"
            >
              Reset
            </button>
          ) : null}
          <button
            onClick={() => void handleSave()}
            disabled={saving || loading || !isDirty}
            className="admin-button admin-button-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            These values affect future billing and overdue calculations. Existing invoices are not
            rewritten when you change the calendar.
          </p>
        </div>
      </section>

      {message ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Saved through <code className="rounded bg-emerald-50 px-1">PUT /api/admin/settings</code>
        </div>
      ) : null}
    </main>
  );
}
