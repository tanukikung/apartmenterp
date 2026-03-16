'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  Info,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Save,
  Send,
  Server,
  X,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineConfig {
  configured: boolean;
  channelId?: string;
}

interface IntegrationsData {
  line: LineConfig;
}

interface EditForm {
  channelId: string;
  channelSecret: string;
  accessToken: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mask(val: string | undefined | null, visibleEnd = 4): string {
  if (!val) return '—';
  if (val.length <= visibleEnd) return '•'.repeat(val.length);
  return '•'.repeat(Math.max(val.length - visibleEnd, 6)) + val.slice(-visibleEnd);
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

function StatusPill({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
      <span className="h-2 w-2 rounded-full bg-red-400" />
      Not Configured
    </span>
  );
}

// ---------------------------------------------------------------------------
// Coming-soon card
// ---------------------------------------------------------------------------

function ComingSoonCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white/50 p-5 opacity-60 select-none">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-400">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">{title}</span>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Coming soon
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({ channelId: '', channelSecret: '', accessToken: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [webhookCopied, setWebhookCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build webhook URL client-side (window only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(window.location.origin + '/api/line/webhook');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/integrations', { cache: 'no-store' });
      if (!res.ok) throw new Error('not ok');
      const json = await res.json();
      if (!json.success && !json.data && !json.line) throw new Error('unexpected shape');
      const payload: IntegrationsData = json.data ?? json;
      setData(payload);
      setApiAvailable(true);
    } catch {
      // Graceful fallback
      setData({ line: { configured: false } });
      setApiAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Edit
  // ---------------------------------------------------------------------------

  function startEdit() {
    setForm({ channelId: '', channelSecret: '', accessToken: '' });
    setSaveError(null);
    setSaveSuccess(false);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/settings/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line: form }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error?.message ?? json.message ?? 'Failed to save');
      }
      setSaveSuccess(true);
      setEditing(false);
      // Reload to get updated status
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save configuration');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Test
  // ---------------------------------------------------------------------------

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/line/test-message', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success !== false) {
        setTestResult({ ok: true, message: json.message ?? 'Test message sent successfully.' });
      } else {
        setTestResult({
          ok: false,
          message: json.error?.message ?? json.message ?? 'Test failed.',
        });
      }
    } catch {
      setTestResult({ ok: false, message: 'Network error — could not reach test endpoint.' });
    } finally {
      setTesting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Copy webhook
  // ---------------------------------------------------------------------------

  function copyWebhook() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setWebhookCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setWebhookCopied(false), 2000);
    });
  }

  const lineConf = data?.line;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/admin/settings" className="hover:text-indigo-600 transition-colors">
          Settings
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-700">Integrations</span>
      </nav>

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
            <h1 className="admin-page-title">Integrations</h1>
            <p className="admin-page-subtitle">Connect external services to your ERP.</p>
          </div>
        </div>
      </section>

      {/* API unavailable notice */}
      {!loading && !apiAvailable && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">API not reachable.</span> The{' '}
            <code className="font-mono text-xs">/api/settings/integrations</code> endpoint did not
            respond. Showing default state — saving may not persist.
          </span>
        </div>
      )}

      {/* Save success */}
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          LINE configuration saved successfully.
        </div>
      )}

      {/* ── LINE Card ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green-100 text-green-600">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">LINE Messaging API</div>
              <p className="text-sm text-slate-500">
                Send automated invoices, reminders, and notices to tenants via LINE.
              </p>
            </div>
          </div>
          {!loading && lineConf && <StatusPill configured={lineConf.configured} />}
          {loading && <div className="h-6 w-28 animate-pulse rounded-full bg-slate-200" />}
        </div>

        {/* Card body */}
        <div className="divide-y divide-slate-100">
          {/* Current config display */}
          {loading ? (
            <div className="space-y-3 px-6 py-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : !editing ? (
            <div className="px-6 py-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <span className="text-sm font-medium text-slate-500">Channel ID</span>
                <span className="font-mono text-sm text-slate-800">
                  {lineConf?.channelId ? mask(lineConf.channelId, 6) : '—'}
                </span>

                <span className="text-sm font-medium text-slate-500">Channel Secret</span>
                <span className="font-mono text-sm text-slate-800">{'•'.repeat(32)}</span>

                <span className="text-sm font-medium text-slate-500">Access Token</span>
                <span className="font-mono text-sm text-slate-800">{'•'.repeat(48)}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={startEdit}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Configuration
                </button>

                <button
                  onClick={() => void handleTest()}
                  disabled={testing || !lineConf?.configured}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {testing ? 'Sending…' : 'Send Test Message'}
                </button>
              </div>

              {/* Test result */}
              {testResult && (
                <div
                  className={[
                    'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium',
                    testResult.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700',
                  ].join(' ')}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                  )}
                  {testResult.message}
                </div>
              )}
            </div>
          ) : (
            /* Edit form */
            <div className="px-6 py-5 space-y-4">
              {saveError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  {saveError}
                </div>
              )}

              <div className="grid gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Channel ID
                  </label>
                  <input
                    type="text"
                    value={form.channelId}
                    onChange={(e) => setForm((f) => ({ ...f, channelId: e.target.value }))}
                    placeholder="Enter your LINE Channel ID"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Channel Secret
                  </label>
                  <input
                    type="password"
                    value={form.channelSecret}
                    onChange={(e) => setForm((f) => ({ ...f, channelSecret: e.target.value }))}
                    placeholder="Enter your LINE Channel Secret"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Channel Access Token
                  </label>
                  <input
                    type="password"
                    value={form.accessToken}
                    onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
                    placeholder="Enter your LINE Channel Access Token"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => void handleSave()}
                  disabled={saving || !form.channelId || !form.channelSecret || !form.accessToken}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? 'Saving…' : 'Save Configuration'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Webhook URL section */}
          <div className="px-6 py-5">
            <p className="mb-2 text-sm font-semibold text-slate-700">Webhook URL</p>
            <p className="mb-3 text-xs text-slate-500">
              Paste this URL into your LINE Developers console under{' '}
              <span className="font-medium text-slate-600">Messaging API → Webhook settings</span>.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <code className="block truncate font-mono text-sm text-slate-700">
                  {webhookUrl || 'Loading…'}
                </code>
              </div>
              <button
                onClick={copyWebhook}
                disabled={!webhookUrl}
                className={[
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors',
                  webhookCopied
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600',
                ].join(' ')}
                title="Copy webhook URL"
              >
                {webhookCopied ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Instructions accordion */}
          <div className="px-6 py-4">
            <button
              onClick={() => setInstructionsOpen((o) => !o)}
              className="flex w-full items-center justify-between text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                How to configure LINE Messaging API
              </span>
              {instructionsOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {instructionsOpen && (
              <ol className="mt-4 space-y-3 pl-1">
                {[
                  'Go to the LINE Developers Console at developers.line.biz and log in.',
                  'Create a new provider or select an existing one.',
                  'Create a new channel — choose "Messaging API" as the channel type.',
                  'Copy the Channel ID and Channel Secret from the "Basic settings" tab.',
                  'Go to the "Messaging API" tab and issue a Channel Access Token (long-lived).',
                  'Paste all three values into the Edit Configuration form above.',
                  'Copy the Webhook URL shown above and paste it into the "Webhook URL" field in the Messaging API tab.',
                  'Enable "Use webhook" toggle in the LINE console.',
                  'Click "Send Test Message" here to verify the connection.',
                ].map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-600">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* ── Other integrations ────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
          Other Integrations
        </h2>
        <div className="flex flex-col gap-3">
          <ComingSoonCard
            icon={<Server className="h-5 w-5" />}
            title="AWS S3"
            description="Store uploaded receipts, floor plans, and tenant documents in Amazon S3."
          />
          <ComingSoonCard
            icon={<Database className="h-5 w-5" />}
            title="Redis Cache"
            description="Speed up dashboard queries and API responses with a Redis caching layer."
          />
          <ComingSoonCard
            icon={<Mail className="h-5 w-5" />}
            title="SMTP Email"
            description="Send invoice PDFs and overdue notices via your own SMTP mail server."
          />
        </div>
      </div>
    </main>
  );
}
