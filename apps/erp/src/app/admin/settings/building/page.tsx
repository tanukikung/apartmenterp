'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Globe,
  Info,
  Mail,
  MapPin,
  Phone,
  Save,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BuildingFields = {
  buildingName: string;
  buildingAddress: string;
  buildingPhone: string;
  buildingEmail: string;
  buildingWebsite: string;
};

type ApiResponse = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { message?: string };
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: BuildingFields = {
  buildingName: '',
  buildingAddress: '',
  buildingPhone: '',
  buildingEmail: '',
  buildingWebsite: '',
};

function extractFields(data: Record<string, unknown>): BuildingFields {
  return {
    buildingName: typeof data.buildingName === 'string' ? data.buildingName : '',
    buildingAddress: typeof data.buildingAddress === 'string' ? data.buildingAddress : '',
    buildingPhone: typeof data.buildingPhone === 'string' ? data.buildingPhone : '',
    buildingEmail: typeof data.buildingEmail === 'string' ? data.buildingEmail : '',
    buildingWebsite: typeof data.buildingWebsite === 'string' ? data.buildingWebsite : '',
  };
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function FieldSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3.5 w-32 rounded bg-slate-200" />
      <div className="h-10 w-full rounded-xl bg-slate-200" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BuildingInfoPage() {
  const [fields, setFields] = useState<BuildingFields>(DEFAULTS);
  const [originalFields, setOriginalFields] = useState<BuildingFields>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: ApiResponse = await fetch('/api/admin/settings', {
        cache: 'no-store',
      }).then((r) => r.json());

      if (res.success && res.data) {
        const loaded = extractFields(res.data);
        setFields(loaded);
        setOriginalFields(loaded);
        setApiAvailable(true);
      } else {
        throw new Error(res.error?.message ?? 'API unavailable');
      }
    } catch {
      setApiAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setField<K extends keyof BuildingFields>(key: K, value: BuildingFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const isDirty = JSON.stringify(fields) !== JSON.stringify(originalFields);

  async function handleSave() {
    if (!apiAvailable) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res: ApiResponse = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.error?.message ?? 'Unable to save settings');
      setOriginalFields(fields);
      setMessage('Building info saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save building info');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setFields(originalFields);
    setError(null);
    setMessage(null);
  }

  return (
    <main className="admin-page">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/admin/settings" className="hover:text-indigo-600 transition-colors">
          Settings
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-700">Building Info</span>
      </nav>

      {/* Page header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="admin-page-title">Building Info</h1>
              {!loading && (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  <Building2 className="mr-1 h-3 w-3" />
                  Identity
                </span>
              )}
            </div>
            <p className="admin-page-subtitle">
              Configure your building name, address, and contact details displayed on invoices and
              communications.
            </p>
          </div>
        </div>
      </section>

      {/* API unavailable notice */}
      {!loading && !apiAvailable && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">API not configured.</span> The{' '}
            <code className="font-mono text-xs">/api/admin/settings</code> endpoint is not
            available. Fields are shown with defaults but cannot be saved.
          </div>
        </div>
      )}

      {/* Alerts */}
      {message && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          {error}
        </div>
      )}

      {/* Form card */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Contact &amp; Identity</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            These details appear on all generated invoices and outgoing communications.
          </p>
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={i === 1 ? 'sm:col-span-2' : ''}>
                <FieldSkeleton />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 p-6">
            {/* Building Name */}
            <div className="sm:col-span-2">
              <label
                htmlFor="buildingName"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"
              >
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                Building Name
              </label>
              <input
                id="buildingName"
                type="text"
                className="admin-input"
                placeholder="e.g. Sunset Residences"
                value={fields.buildingName}
                onChange={(e) => setField('buildingName', e.target.value)}
                disabled={!apiAvailable}
              />
            </div>

            {/* Address */}
            <div className="sm:col-span-2">
              <label
                htmlFor="buildingAddress"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"
              >
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                Address
              </label>
              <textarea
                id="buildingAddress"
                rows={3}
                className="admin-input resize-none"
                placeholder="e.g. 123 Main Street, Bangkok 10110"
                value={fields.buildingAddress}
                onChange={(e) => setField('buildingAddress', e.target.value)}
                disabled={!apiAvailable}
              />
            </div>

            {/* Phone */}
            <div>
              <label
                htmlFor="buildingPhone"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"
              >
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                Phone Number
              </label>
              <input
                id="buildingPhone"
                type="tel"
                className="admin-input"
                placeholder="e.g. +66 2 123 4567"
                value={fields.buildingPhone}
                onChange={(e) => setField('buildingPhone', e.target.value)}
                disabled={!apiAvailable}
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="buildingEmail"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"
              >
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                Email Address
              </label>
              <input
                id="buildingEmail"
                type="email"
                className="admin-input"
                placeholder="e.g. info@sunsetresidences.co.th"
                value={fields.buildingEmail}
                onChange={(e) => setField('buildingEmail', e.target.value)}
                disabled={!apiAvailable}
              />
            </div>

            {/* Website */}
            <div className="sm:col-span-2">
              <label
                htmlFor="buildingWebsite"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"
              >
                <Globe className="h-3.5 w-3.5 text-slate-400" />
                Website{' '}
                <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="buildingWebsite"
                type="url"
                className="admin-input"
                placeholder="e.g. https://www.sunsetresidences.co.th"
                value={fields.buildingWebsite}
                onChange={(e) => setField('buildingWebsite', e.target.value)}
                disabled={!apiAvailable}
              />
            </div>
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-sm text-slate-500">
          {!apiAvailable ? (
            <span className="flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Saving disabled — API endpoint not available
            </span>
          ) : isDirty ? (
            <span className="font-medium text-indigo-700">You have unsaved changes.</span>
          ) : (
            <span className="text-slate-400">All changes saved.</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isDirty && apiAvailable && (
            <button onClick={handleReset} className="admin-button text-sm">
              Reset
            </button>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving || !apiAvailable || !isDirty}
            className="admin-button admin-button-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm text-sky-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
        <p>
          Building name and address are printed on every invoice PDF. Phone and email are included
          in automated LINE messages sent to tenants. Keep these details accurate to avoid
          communication issues.
        </p>
      </div>
    </main>
  );
}
