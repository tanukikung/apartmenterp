'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Globe,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  Save,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BuildingProfile = {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  logoUrl: string;
  updatedAt: string | null;
};

const DEFAULTS: BuildingProfile = {
  name: '',
  address: '',
  phone: '',
  email: '',
  taxId: '',
  logoUrl: '',
  updatedAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTs(iso: string | null): string {
  if (!iso) return 'Never saved';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldRow({
  label,
  icon,
  children,
}: {
  label: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        {icon}
      </div>
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
        {children}
      </div>
    </div>
  );
}

function LetterheadPreview({ profile }: { profile: BuildingProfile }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Gradient header strip */}
      <div className="h-2 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

      <div className="p-6">
        {/* Logo / Name row */}
        <div className="flex items-center gap-4">
          {profile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logoUrl}
              alt="Building logo"
              className="h-12 w-12 rounded-xl object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm">
              <Building2 className="h-6 w-6 text-white" />
            </div>
          )}
          <div>
            <div className="text-lg font-bold leading-tight text-slate-900">
              {profile.name || <span className="italic text-slate-300">Building Name</span>}
            </div>
            {profile.taxId && (
              <div className="mt-0.5 text-xs text-slate-400">
                Tax ID: {profile.taxId}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-slate-100" />

        {/* Contact grid */}
        <div className="grid gap-2 text-sm text-slate-600">
          {profile.address && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="leading-snug">{profile.address}</span>
            </div>
          )}
          {profile.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{profile.phone}</span>
            </div>
          )}
          {profile.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{profile.email}</span>
            </div>
          )}
          {!profile.address && !profile.phone && !profile.email && (
            <p className="italic text-slate-300">Fill in your contact details to see the preview.</p>
          )}
        </div>

        {/* Footer strip */}
        <div className="mt-5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-400">
          This is a live preview of how your building info will appear on invoices and documents.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BuildingProfilePage() {
  const [fields, setFields] = useState<BuildingProfile>(DEFAULTS);
  const [originalFields, setOriginalFields] = useState<BuildingProfile>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/building', { cache: 'no-store' });
      const json = (await res.json()) as {
        success: boolean;
        data?: BuildingProfile;
        error?: { message?: string };
      };
      if (!json.success || !json.data) throw new Error(json.error?.message ?? 'Failed to load building profile');
      setFields(json.data);
      setOriginalFields(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load building profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/building', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fields.name,
          address: fields.address,
          phone: fields.phone,
          email: fields.email,
          taxId: fields.taxId,
          logoUrl: fields.logoUrl,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'Failed to save building profile');
      // Refresh to get updated timestamp
      await load();
      setMessage('Building profile saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save building profile');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const isDirty =
    fields.name !== originalFields.name ||
    fields.address !== originalFields.address ||
    fields.phone !== originalFields.phone ||
    fields.email !== originalFields.email ||
    fields.taxId !== originalFields.taxId ||
    fields.logoUrl !== originalFields.logoUrl;

  function setField<K extends keyof BuildingProfile>(key: K, value: BuildingProfile[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="admin-page-title flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600" />
              Building Profile
            </h1>
            <p className="admin-page-subtitle">
              Configure your building&apos;s name, address, and contact details for documents.
            </p>
          </div>
        </div>
      </section>

      {/* Alerts */}
      {message && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Two-column layout: form + preview */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Form */}
        <div className="admin-card xl:col-span-3">
          <h2 className="mb-6 text-base font-semibold text-slate-900">Building Information</h2>

          {loading ? (
            <div className="space-y-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded-lg bg-slate-100" />
                    <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <FieldRow label="Building Name" icon={<Building2 className="h-4 w-4" />}>
                <input
                  type="text"
                  className="admin-input w-full"
                  placeholder="Sunset Apartments"
                  value={fields.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="Address" icon={<MapPin className="h-4 w-4" />}>
                <textarea
                  className="admin-input w-full resize-none"
                  rows={3}
                  placeholder="123 Main Street, Bangkok 10100"
                  value={fields.address}
                  onChange={(e) => setField('address', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="Phone Number" icon={<Phone className="h-4 w-4" />}>
                <input
                  type="tel"
                  className="admin-input w-full"
                  placeholder="02-XXX-XXXX"
                  value={fields.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="Email Address" icon={<Mail className="h-4 w-4" />}>
                <input
                  type="email"
                  className="admin-input w-full"
                  placeholder="contact@yourbuilding.com"
                  value={fields.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="Tax ID / เลขที่ผู้เสียภาษี" icon={<ReceiptText className="h-4 w-4" />}>
                <input
                  type="text"
                  className="admin-input w-full font-mono tracking-wider"
                  placeholder="0-1234-56789-01-2"
                  value={fields.taxId}
                  onChange={(e) => setField('taxId', e.target.value)}
                />
              </FieldRow>

              <FieldRow
                label={
                  <>
                    Logo URL{' '}
                    <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>
                  </>
                }
                icon={<Globe className="h-4 w-4" />}
              >
                <input
                  type="url"
                  className="admin-input w-full"
                  placeholder="https://example.com/logo.png"
                  value={fields.logoUrl}
                  onChange={(e) => setField('logoUrl', e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Publicly accessible URL. Will appear on invoice letterhead.
                </p>
              </FieldRow>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="space-y-4 xl:col-span-2">
          <div className="admin-card">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Letterhead Preview</h2>
            <LetterheadPreview profile={fields} />
          </div>

          {/* Last updated */}
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            <Clock className="h-4 w-4 shrink-0 text-slate-400" />
            <span>
              Last saved: <span className="font-medium text-slate-700">{formatTs(fields.updatedAt)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-sm text-slate-500">
          {isDirty ? (
            <span className="font-medium text-amber-600">You have unsaved changes.</span>
          ) : (
            'Building profile is up to date.'
          )}
        </div>
        <div className="flex items-center gap-3">
          {isDirty && (
            <button
              onClick={() => {
                setFields(originalFields);
                setMessage(null);
                setError(null);
              }}
              className="admin-button"
            >
              Discard
            </button>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving || loading || !isDirty}
            className="admin-button admin-button-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </main>
  );
}
