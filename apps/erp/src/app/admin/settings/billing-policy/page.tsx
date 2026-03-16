'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Info,
  Percent,
  Receipt,
  Save,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PolicyFields = {
  billingDay: number;
  dueDays: number;
  lateFeePercent: number;
  gracePeriodDays: number;
  overdueThresholdDays: number;
};

type ApiResponse = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { message?: string };
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: PolicyFields = {
  billingDay: 1,
  dueDays: 7,
  lateFeePercent: 5,
  gracePeriodDays: 3,
  overdueThresholdDays: 30,
};

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function extractFields(data: Record<string, unknown>): PolicyFields {
  return {
    billingDay: toInt(data.billingDay, DEFAULTS.billingDay),
    dueDays: toInt(data.dueDays, DEFAULTS.dueDays),
    lateFeePercent: toInt(data.lateFeePercent, DEFAULTS.lateFeePercent),
    gracePeriodDays: toInt(data.gracePeriodDays, DEFAULTS.gracePeriodDays),
    overdueThresholdDays: toInt(data.overdueThresholdDays, DEFAULTS.overdueThresholdDays),
  };
}

// ---------------------------------------------------------------------------
// Field definition type
// ---------------------------------------------------------------------------

type FieldDef = {
  key: keyof PolicyFields;
  label: string;
  description: string;
  min: number;
  max: number;
  unit: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
};

const FIELD_DEFS: FieldDef[] = [
  {
    key: 'billingDay',
    label: 'Billing Day',
    description: 'Day of month when the billing cycle starts and invoices are generated.',
    min: 1,
    max: 28,
    unit: 'of month',
    icon: <Calendar className="h-4 w-4" />,
    iconBg: 'bg-indigo-50 border-indigo-200',
    iconColor: 'text-indigo-600',
  },
  {
    key: 'dueDays',
    label: 'Payment Due Days',
    description: 'Number of days after the billing date until payment is due.',
    min: 1,
    max: 90,
    unit: 'days',
    icon: <Receipt className="h-4 w-4" />,
    iconBg: 'bg-blue-50 border-blue-200',
    iconColor: 'text-blue-600',
  },
  {
    key: 'lateFeePercent',
    label: 'Late Fee Rate',
    description: 'Percentage of the outstanding balance charged as a late fee after the due date.',
    min: 0,
    max: 100,
    unit: '%',
    icon: <Percent className="h-4 w-4" />,
    iconBg: 'bg-amber-50 border-amber-200',
    iconColor: 'text-amber-600',
  },
  {
    key: 'gracePeriodDays',
    label: 'Grace Period',
    description: 'Days after the due date before late fees are applied to the invoice.',
    min: 0,
    max: 30,
    unit: 'days',
    icon: <Calendar className="h-4 w-4" />,
    iconBg: 'bg-emerald-50 border-emerald-200',
    iconColor: 'text-emerald-600',
  },
  {
    key: 'overdueThresholdDays',
    label: 'Delinquency Threshold',
    description: 'Days overdue before an account is marked as delinquent in the system.',
    min: 1,
    max: 365,
    unit: 'days',
    icon: <AlertTriangle className="h-4 w-4" />,
    iconBg: 'bg-red-50 border-red-200',
    iconColor: 'text-red-600',
  },
];

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function RowSkeleton() {
  return (
    <div className="animate-pulse flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="h-10 w-10 rounded-2xl bg-slate-200 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-40 rounded bg-slate-200" />
        <div className="h-3 w-64 rounded bg-slate-100" />
      </div>
      <div className="h-10 w-24 rounded-xl bg-slate-200 shrink-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Policy field row
// ---------------------------------------------------------------------------

function PolicyRow({
  def,
  value,
  onChange,
  disabled,
}: {
  def: FieldDef;
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={[
        'flex items-center gap-4 rounded-2xl border p-5 transition-colors',
        disabled ? 'opacity-75 border-slate-200 bg-white' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      {/* Icon */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${def.iconBg} ${def.iconColor}`}
      >
        {def.icon}
      </div>

      {/* Label + description */}
      <div className="min-w-0 flex-1">
        <label
          htmlFor={`field-${def.key}`}
          className="text-sm font-semibold text-slate-900 leading-snug cursor-pointer"
        >
          {def.label}
        </label>
        <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{def.description}</p>
      </div>

      {/* Number input + unit */}
      <div className="flex shrink-0 items-center gap-2">
        <input
          id={`field-${def.key}`}
          type="number"
          min={def.min}
          max={def.max}
          step={1}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            if (!Number.isNaN(parsed)) {
              onChange(Math.min(def.max, Math.max(def.min, parsed)));
            }
          }}
          className="admin-input w-24 text-center tabular-nums"
        />
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">{def.unit}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BillingPolicyPage() {
  const [fields, setFields] = useState<PolicyFields>(DEFAULTS);
  const [originalFields, setOriginalFields] = useState<PolicyFields>(DEFAULTS);
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

  function setField(key: keyof PolicyFields, value: number) {
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
      setMessage('Billing policy saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save billing policy');
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
        <span className="font-medium text-slate-700">Billing Policy</span>
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
              <h1 className="admin-page-title">Billing Policy</h1>
              {!loading && (
                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  <Receipt className="mr-1 h-3 w-3" />
                  {FIELD_DEFS.length} rules
                </span>
              )}
            </div>
            <p className="admin-page-subtitle">
              Define billing cycle rules, late fee rates, penalty thresholds, and invoice rounding
              behaviour.
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
            available. Values below are defaults and cannot be saved.
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

      {/* Policy rows */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {FIELD_DEFS.map((def) => (
            <PolicyRow
              key={def.key}
              def={def}
              value={fields[def.key]}
              onChange={(val) => setField(def.key, val)}
              disabled={!apiAvailable}
            />
          ))}
        </div>
      )}

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
          Changes to billing policy apply from the next generated invoice onwards. Existing invoices
          are not retroactively updated. Ensure the{' '}
          <Link
            href="/admin/settings/automation"
            className="font-semibold underline underline-offset-2 hover:text-sky-900"
          >
            Automation Rules
          </Link>{' '}
          are configured to match your chosen billing cycle for consistent reminder timing.
        </p>
      </div>
    </main>
  );
}
