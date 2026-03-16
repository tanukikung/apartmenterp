'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  MessageSquare,
  Save,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RuleKey =
  | 'autoGenerateInvoices'
  | 'sendLineReminderBeforeDue'
  | 'sendLineNoticeOnOverdue'
  | 'autoCloseTickets';

type AutomationRules = Record<RuleKey, boolean>;

type RuleDefinition = {
  key: RuleKey;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
};

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

const RULE_DEFS: RuleDefinition[] = [
  {
    key: 'autoGenerateInvoices',
    title: 'Auto-generate invoices on import',
    description:
      'Automatically create invoices for all rooms when a billing cycle import batch is processed successfully.',
    icon: <FileText className="h-5 w-5" />,
    iconBg: 'bg-indigo-50 border-indigo-200',
    iconColor: 'text-indigo-600',
  },
  {
    key: 'sendLineReminderBeforeDue',
    title: 'Send LINE reminder 3 days before due date',
    description:
      'Send an automated LINE message to tenants with unpaid invoices 3 days before the payment due date.',
    icon: <Bell className="h-5 w-5" />,
    iconBg: 'bg-blue-50 border-blue-200',
    iconColor: 'text-blue-600',
  },
  {
    key: 'sendLineNoticeOnOverdue',
    title: 'Send LINE notice on overdue',
    description:
      'Send an automated LINE overdue notice to tenants the day their invoice becomes past due.',
    icon: <MessageSquare className="h-5 w-5" />,
    iconBg: 'bg-amber-50 border-amber-200',
    iconColor: 'text-amber-600',
  },
  {
    key: 'autoCloseTickets',
    title: 'Auto-close tickets after 30 days',
    description:
      'Automatically close maintenance tickets that have been open for more than 30 days without any status update.',
    icon: <Clock className="h-5 w-5" />,
    iconBg: 'bg-slate-50 border-slate-200',
    iconColor: 'text-slate-600',
  },
];

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_RULES: AutomationRules = {
  autoGenerateInvoices: false,
  sendLineReminderBeforeDue: false,
  sendLineNoticeOnOverdue: false,
  autoCloseTickets: false,
};

// ---------------------------------------------------------------------------
// Toggle switch component
// ---------------------------------------------------------------------------

function ToggleSwitch({
  enabled,
  onChange,
  disabled,
  id,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        enabled
          ? 'border-indigo-600 bg-indigo-600'
          : 'border-slate-300 bg-slate-200',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
          enabled ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rule card component
// ---------------------------------------------------------------------------

function RuleCard({
  def,
  enabled,
  onChange,
  disabled,
}: {
  def: RuleDefinition;
  enabled: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  const switchId = `rule-${def.key}`;
  return (
    <div
      className={[
        'flex items-start gap-4 rounded-2xl border p-5 transition-colors',
        enabled
          ? 'border-indigo-200 bg-indigo-50/40'
          : 'border-slate-200 bg-white',
        disabled ? 'opacity-75' : '',
      ].join(' ')}
    >
      {/* Icon */}
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${def.iconBg} ${def.iconColor}`}
      >
        {def.icon}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <label
          htmlFor={switchId}
          className="cursor-pointer text-base font-semibold text-slate-900 leading-snug"
        >
          {def.title}
        </label>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">{def.description}</p>
      </div>

      {/* Toggle */}
      <div className="shrink-0 pt-0.5">
        <ToggleSwitch
          id={switchId}
          enabled={enabled}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AutomationRulesPage() {
  const [rules, setRules] = useState<AutomationRules>(DEFAULT_RULES);
  const [originalRules, setOriginalRules] = useState<AutomationRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/automation', { cache: 'no-store' }).then((r) =>
        r.json()
      );
      if (res.success && res.data) {
        const loaded = { ...DEFAULT_RULES, ...(res.data.rules ?? res.data) } as AutomationRules;
        setRules(loaded);
        setOriginalRules(loaded);
        setApiAvailable(true);
      } else {
        throw new Error(res.error?.message || 'API unavailable');
      }
    } catch {
      // API not available — keep defaults, disable save
      setApiAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setRule(key: RuleKey, value: boolean) {
    setRules((prev) => ({ ...prev, [key]: value }));
  }

  const isDirty = JSON.stringify(rules) !== JSON.stringify(originalRules);

  async function handleSave() {
    if (!apiAvailable) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.error?.message || 'Unable to save settings');
      setOriginalRules(rules);
      setMessage('Automation rules saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save automation rules');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setRules(originalRules);
    setError(null);
    setMessage(null);
  }

  const enabledCount = Object.values(rules).filter(Boolean).length;

  return (
    <main className="admin-page">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/admin/settings" className="hover:text-indigo-600 transition-colors">
          Settings
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-700">Automation Rules</span>
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
              <h1 className="admin-page-title">Automation Rules</h1>
              {!loading && (
                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  <Zap className="mr-1 h-3 w-3" />
                  {enabledCount} active
                </span>
              )}
            </div>
            <p className="admin-page-subtitle">
              Configure automated billing, notifications, and ticket management behaviors.
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
            <code className="font-mono text-xs">/api/settings/automation</code> endpoint is not
            available. The current rule states are shown below but cannot be saved. Configure the
            endpoint or update rules directly via system settings.
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

      {/* Rule cards */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="h-11 w-11 rounded-2xl bg-slate-200" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-48 rounded bg-slate-200" />
                <div className="h-3 w-80 rounded bg-slate-100" />
              </div>
              <div className="h-6 w-11 rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {RULE_DEFS.map((def) => (
            <RuleCard
              key={def.key}
              def={def}
              enabled={rules[def.key]}
              onChange={(val) => setRule(def.key, val)}
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
              Saving disabled — configure via system settings
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
          LINE-based automations require valid LINE Messaging API credentials configured under{' '}
          <Link
            href="/admin/settings/integrations"
            className="font-semibold underline underline-offset-2 hover:text-sky-900"
          >
            LINE Integration
          </Link>
          . Invoice auto-generation depends on a configured billing policy. Rules are applied on
          the next scheduled system check.
        </p>
      </div>
    </main>
  );
}
