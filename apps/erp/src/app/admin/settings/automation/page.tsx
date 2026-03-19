'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Calendar,
  CheckCircle2,
  Cpu,
  Database,
  RefreshCw,
  Save,
  XCircle,
  Clock,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
type AutomationData = {
  billingCron: string;
  reminderCron: string;
  overdueCron: string;
  backupCron: string;
  descriptions: Record<string, string>;
};

type ApiResp<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
  message?: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Cron parser (client-side, mirrors server logic)
// ────────────────────────────────────────────────────────────────────────────
function parseCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, dom, month, dow] = parts;

  const pad = (n: string) => n.padStart(2, '0');
  const timeStr = (h: string, m: string) => `${pad(h)}:${pad(m)}`;
  const isNum = (s: string) => /^\d+$/.test(s);

  const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = [
    '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  if (expr === '* * * * *') return 'Every minute';

  if (isNum(minute) && isNum(hour) && dom === '*' && month === '*' && dow === '*') {
    return `Daily at ${timeStr(hour, minute)}`;
  }

  if (isNum(minute) && isNum(hour) && dom === '*' && month === '*' && isNum(dow)) {
    const dayName = dowNames[Number(dow)] ?? dow;
    return `Every ${dayName} at ${timeStr(hour, minute)}`;
  }

  if (isNum(minute) && isNum(hour) && isNum(dom) && month === '*' && dow === '*') {
    const suffix =
      dom === '1' ? 'st' : dom === '2' ? 'nd' : dom === '3' ? 'rd' : 'th';
    return `Monthly on the ${dom}${suffix} at ${timeStr(hour, minute)}`;
  }

  if (isNum(minute) && isNum(hour) && isNum(dom) && isNum(month) && dow === '*') {
    const mName = monthNames[Number(month)] ?? month;
    return `${mName} ${dom} at ${timeStr(hour, minute)} each year`;
  }

  const everyMin = minute.match(/^\*\/(\d+)$/);
  if (everyMin && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Every ${everyMin[1]} minutes`;
  }

  const everyHr = hour.match(/^\*\/(\d+)$/);
  if (isNum(minute) && everyHr && dom === '*' && month === '*' && dow === '*') {
    return `Every ${everyHr[1]} hours at minute ${minute}`;
  }

  return expr;
}

// ────────────────────────────────────────────────────────────────────────────
// Validate 5-part cron
// ────────────────────────────────────────────────────────────────────────────
const CRON_REGEX = /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)$/;

function isValidCron(expr: string): boolean {
  return CRON_REGEX.test(expr.trim());
}

// ────────────────────────────────────────────────────────────────────────────
// Quick-schedule presets
// ────────────────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Daily 3am', value: '0 3 * * *' },
  { label: 'Daily 8am', value: '0 8 * * *' },
  { label: 'Daily midnight', value: '0 0 * * *' },
  { label: 'Monthly 1st 3am', value: '0 3 1 * *' },
  { label: 'Weekly Mon 8am', value: '0 8 * * 1' },
  { label: 'Every 6h', value: '0 */6 * * *' },
];

// ────────────────────────────────────────────────────────────────────────────
// Single automation card
// ────────────────────────────────────────────────────────────────────────────
type CardColor = 'blue' | 'amber' | 'red' | 'green';

const COLOR_MAP: Record<
  CardColor,
  { ring: string; iconBg: string; iconText: string; badge: string; badgeText: string }
> = {
  blue: {
    ring: 'border-blue-200',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-600',
    badge: 'bg-blue-50 border-blue-100',
    badgeText: 'text-blue-700',
  },
  amber: {
    ring: 'border-amber-200',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
    badge: 'bg-amber-50 border-amber-100',
    badgeText: 'text-amber-700',
  },
  red: {
    ring: 'border-red-200',
    iconBg: 'bg-red-100',
    iconText: 'text-red-600',
    badge: 'bg-red-50 border-red-100',
    badgeText: 'text-red-700',
  },
  green: {
    ring: 'border-green-200',
    iconBg: 'bg-green-100',
    iconText: 'text-green-600',
    badge: 'bg-green-50 border-green-100',
    badgeText: 'text-green-700',
  },
};

function AutomationCard({
  id,
  icon: Icon,
  title,
  description,
  color,
  value,
  onChange,
  disabled,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  color: CardColor;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const c = COLOR_MAP[color];
  const valid = isValidCron(value);
  const humanDesc = valid ? parseCron(value) : null;

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${c.ring}`}
    >
      {/* Card header */}
      <div className="mb-4 flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}>
          <Icon className={`h-5 w-5 ${c.iconText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      </div>

      {/* Cron input */}
      <div className="space-y-2">
        <label htmlFor={id} className="block text-xs font-medium text-slate-600">
          Cron Expression
        </label>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0 3 * * *"
          className={`admin-input w-full font-mono text-sm disabled:cursor-not-allowed disabled:bg-slate-50 ${
            value && !valid ? 'border-red-300 focus:ring-red-300' : ''
          }`}
        />
        {value && !valid && (
          <p className="text-xs text-red-600">Invalid cron — must be 5 fields (min hour dom mon dow)</p>
        )}

        {/* Quick presets */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              disabled={disabled}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 ${c.badge} ${c.badgeText}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Human-readable next run */}
        {humanDesc && (
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <p className="text-xs text-slate-600">
              <span className="font-medium">Next run: </span>
              {humanDesc}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────────────────
export default function AutomationRulesPage() {
  const [data, setData] = useState<AutomationData | null>(null);
  const [original, setOriginal] = useState<AutomationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // form fields
  const [billingCron, setBillingCron] = useState('0 3 1 * *');
  const [reminderCron, setReminderCron] = useState('0 8 * * *');
  const [overdueCron, setOverdueCron] = useState('0 4 * * *');
  const [backupCron, setBackupCron] = useState('0 3 * * *');

  // ── load ──
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: ApiResp<AutomationData> = await fetch('/api/settings/automation', {
        cache: 'no-store',
      }).then((r) => r.json());

      if (!res.success || !res.data) {
        throw new Error(res.error?.message ?? 'Failed to load automation settings');
      }
      setData(res.data);
      setOriginal(res.data);
      setBillingCron(res.data.billingCron);
      setReminderCron(res.data.reminderCron);
      setOverdueCron(res.data.overdueCron);
      setBackupCron(res.data.backupCron);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty =
    billingCron !== original?.billingCron ||
    reminderCron !== original?.reminderCron ||
    overdueCron !== original?.overdueCron ||
    backupCron !== original?.backupCron;

  const allValid =
    isValidCron(billingCron) &&
    isValidCron(reminderCron) &&
    isValidCron(overdueCron) &&
    isValidCron(backupCron);

  // ── save ──
  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (!allValid) {
        throw new Error('One or more cron expressions are invalid. Please fix them before saving.');
      }

      const res: ApiResp<AutomationData> = await fetch('/api/settings/automation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingCron, reminderCron, overdueCron, backupCron }),
      }).then((r) => r.json());

      if (!res.success) {
        throw new Error(res.error?.message ?? 'Failed to save automation settings');
      }
      setSuccessMsg(res.message ?? 'Automation settings saved.');
      if (res.data) {
        setData(res.data);
        setOriginal(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  // ── reset ──
  function handleReset() {
    if (!original) return;
    setBillingCron(original.billingCron);
    setReminderCron(original.reminderCron);
    setOverdueCron(original.overdueCron);
    setBackupCron(original.backupCron);
    setError(null);
    setSuccessMsg(null);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────
  return (
    <main className="admin-page">
      {/* ── Header ── */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
                <Cpu className="h-5 w-5 text-white" />
              </div>
              <h1 className="admin-page-title">Automation Rules</h1>
            </div>
            <p className="admin-page-subtitle mt-0.5">
              Configure cron schedules for background jobs
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="admin-button flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </section>

      {/* ── Alerts ── */}
      {successMsg && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          {successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-3.5 text-sm font-medium text-red-800">
          <XCircle className="h-5 w-5 shrink-0 text-red-500" />
          {error}
        </div>
      )}

      {/* ── Restart warning ── */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>
          <span className="font-semibold">Changes take effect after server restart.</span>{' '}
          Cron schedules are loaded at startup. Save settings, then restart the application
          server or worker process to apply the new schedule.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          {/* ── 2×2 automation cards ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <AutomationCard
              id="billing-cron"
              icon={Calendar}
              title="Monthly Billing Generation"
              description="Auto-generates invoices on billing day for all active rooms"
              color="blue"
              value={billingCron}
              onChange={setBillingCron}
            />
            <AutomationCard
              id="reminder-cron"
              icon={Bell}
              title="Payment Reminders"
              description="Sends LINE messages to tenants with unpaid invoices"
              color="amber"
              value={reminderCron}
              onChange={setReminderCron}
            />
            <AutomationCard
              id="overdue-cron"
              icon={AlertTriangle}
              title="Overdue Check"
              description="Marks invoices as OVERDUE after their due date has passed"
              color="red"
              value={overdueCron}
              onChange={setOverdueCron}
            />
            <AutomationCard
              id="backup-cron"
              icon={Database}
              title="Database Backup"
              description="Creates an encrypted PostgreSQL backup to the configured destination"
              color="green"
              value={backupCron}
              onChange={setBackupCron}
            />
          </div>

          {/* ── Save bar ── */}
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Cpu className="h-4 w-4 text-slate-400" />
              {isDirty
                ? 'You have unsaved automation changes.'
                : data
                  ? 'Automation schedules are up to date.'
                  : 'Loading…'}
            </div>
            <div className="flex items-center gap-3">
              {isDirty && (
                <button
                  onClick={handleReset}
                  className="admin-button flex items-center gap-2"
                >
                  Reset
                </button>
              )}
              <button
                onClick={() => void handleSave()}
                disabled={saving || loading || !isDirty || !allValid}
                className="admin-button admin-button-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save All'}
              </button>
            </div>
          </div>

          {/* ── Cron reference ── */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Cron Expression Reference</h3>
            <div className="mb-3 rounded-lg bg-slate-800 px-4 py-3 font-mono text-xs text-slate-200">
              ┌───── minute (0-59)
              <br />
              │ ┌─────── hour (0-23)
              <br />
              │ │ ┌───────── day of month (1-31)
              <br />
              │ │ │ ┌─────────── month (1-12)
              <br />
              │ │ │ │ ┌───────────── day of week (0-6, Sun=0)
              <br />
              * * * * *
            </div>
            <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-600">
              {[
                { expr: '0 3 1 * *', desc: 'Monthly on 1st at 03:00' },
                { expr: '0 8 * * *', desc: 'Daily at 08:00' },
                { expr: '0 4 * * *', desc: 'Daily at 04:00' },
                { expr: '0 3 * * *', desc: 'Daily at 03:00' },
                { expr: '0 0 * * 1', desc: 'Every Monday midnight' },
                { expr: '*/30 * * * *', desc: 'Every 30 minutes' },
              ].map(({ expr, desc }) => (
                <div key={expr} className="flex items-center gap-2">
                  <code className="rounded bg-white px-2 py-0.5 font-mono text-slate-700 border border-slate-200">
                    {expr}
                  </code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Related links ── */}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/system-jobs"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <Cpu className="h-4 w-4" />
              View System Jobs
            </Link>
            <Link
              href="/admin/settings/billing-policy"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <Calendar className="h-4 w-4" />
              Billing Calendar
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
