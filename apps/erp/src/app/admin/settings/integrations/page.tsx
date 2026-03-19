'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  MessageSquare,
  RefreshCw,
  Save,
  XCircle,
  AlertTriangle,
  Info,
  Copy,
  Check,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
type IntegrationData = {
  channelId: string;
  channelSecret: string;
  accessToken: string;
  webhookUrl: string;
  envOverrideActive: boolean;
  connected: boolean;
  hasDbChannelId: boolean;
  hasDbChannelSecret: boolean;
  hasDbAccessToken: boolean;
};

type ApiResp<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
  message?: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────
function SecretInput({
  id,
  label,
  value,
  placeholder,
  onChange,
  disabled,
  hasExistingValue,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hasExistingValue?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {hasExistingValue && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Saved
          </span>
        )}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          placeholder={placeholder ?? (hasExistingValue ? '••••••••  (leave blank to keep current)' : '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          className="admin-input w-full pr-10 font-mono text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────────────────
const LINE_GREEN = '#06C755';

export default function IntegrationsPage() {
  // ── state ──
  const [data, setData] = useState<IntegrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // form fields — empty = don't overwrite existing secret
  const [channelId, setChannelId] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');

  // ── load ──
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: ApiResp<IntegrationData> = await fetch('/api/settings/integrations', {
        cache: 'no-store',
      }).then((r) => r.json());

      if (!res.success || !res.data) {
        throw new Error(res.error?.message ?? 'Failed to load integration settings');
      }
      setData(res.data);
      setChannelId(res.data.channelId ?? '');
      // Never pre-fill secret/token — they show as masked in the API
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── save ──
  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (!channelId.trim()) {
        throw new Error('Channel ID is required');
      }
      if (!channelSecret.trim()) {
        throw new Error('Channel Secret is required — enter the value to save it');
      }
      if (!accessToken.trim()) {
        throw new Error('Access Token is required — enter the value to save it');
      }

      const res: ApiResp<{ saved: boolean; webhookUrl: string }> = await fetch(
        '/api/settings/integrations',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: channelId.trim(),
            channelSecret: channelSecret.trim(),
            accessToken: accessToken.trim(),
            webhookUrl: data?.webhookUrl ?? '',
          }),
        },
      ).then((r) => r.json());

      if (!res.success) {
        throw new Error(res.error?.message ?? 'Failed to save settings');
      }
      setSuccessMsg('LINE integration settings saved successfully.');
      // Clear secrets from form after save
      setChannelSecret('');
      setAccessToken('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
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
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: LINE_GREEN }}
              >
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <h1 className="admin-page-title">LINE Integration</h1>
            </div>
            <p className="admin-page-subtitle mt-0.5">
              Connect your LINE Official Account for tenant messaging
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

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Connection status banner ── */}
          <div
            className={`flex items-center gap-3 rounded-2xl border px-5 py-3.5 ${
              data?.connected
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            {data?.connected ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-red-500" />
            )}
            <div>
              <p
                className={`text-sm font-semibold ${
                  data?.connected ? 'text-emerald-800' : 'text-red-800'
                }`}
              >
                {data?.connected ? 'Connected' : 'Not Configured'}
              </p>
              <p
                className={`text-xs ${
                  data?.connected ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {data?.connected
                  ? 'LINE credentials are active and ready for messaging'
                  : 'Set your LINE credentials below to enable tenant chat'}
              </p>
            </div>
          </div>

          {/* ── Env override warning ── */}
          {data?.envOverrideActive && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">Configuration overridden by environment variables</p>
                <p className="mt-0.5 text-amber-800">
                  LINE_CHANNEL_ID, LINE_CHANNEL_SECRET, and LINE_ACCESS_TOKEN are set in the
                  server environment. These take priority over database-stored values. Changes saved
                  here will be stored but won&apos;t activate until environment variables are
                  removed.
                </p>
              </div>
            </div>
          )}

          {/* ── Credentials form card ── */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Card header */}
            <div
              className="flex items-center gap-3 rounded-t-2xl px-6 py-4"
              style={{ background: `linear-gradient(135deg, ${LINE_GREEN}15 0%, ${LINE_GREEN}05 100%)` }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: LINE_GREEN }}
              >
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">LINE Bot Credentials</h2>
                <p className="text-xs text-slate-500">
                  From the LINE Developers Console &rarr; Messaging API channel
                </p>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              {/* Channel ID */}
              <div className="space-y-1.5">
                <label htmlFor="line-channel-id" className="block text-sm font-medium text-slate-700">
                  Channel ID
                  {data?.hasDbChannelId && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                </label>
                <input
                  id="line-channel-id"
                  type="text"
                  value={channelId}
                  placeholder="e.g. 1234567890"
                  onChange={(e) => setChannelId(e.target.value)}
                  disabled={data?.envOverrideActive}
                  className="admin-input w-full font-mono text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>

              {/* Channel Secret */}
              <SecretInput
                id="line-channel-secret"
                label="Channel Secret"
                value={channelSecret}
                hasExistingValue={data?.hasDbChannelSecret}
                onChange={setChannelSecret}
                disabled={data?.envOverrideActive}
              />

              {/* Access Token */}
              <SecretInput
                id="line-access-token"
                label="Channel Access Token"
                value={accessToken}
                hasExistingValue={data?.hasDbAccessToken}
                onChange={setAccessToken}
                disabled={data?.envOverrideActive}
              />

              {/* Webhook URL (readonly) */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Webhook URL
                  <span className="ml-2 text-xs font-normal text-slate-400">(set this in LINE console)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={data?.webhookUrl ?? ''}
                    readOnly
                    className="admin-input flex-1 cursor-default select-all bg-slate-50 font-mono text-xs text-slate-600"
                  />
                  {data?.webhookUrl && <CopyButton text={data.webhookUrl} />}
                </div>
                <p className="text-xs text-slate-400">
                  Paste this URL into LINE Developers Console &rarr; Messaging API &rarr; Webhook URL
                </p>
              </div>
            </div>

            {/* Card footer */}
            <div className="flex items-center justify-between rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <p className="text-xs text-slate-500">
                {data?.envOverrideActive
                  ? 'Editing disabled while environment variables are active'
                  : 'Credentials are encrypted in the database'}
              </p>
              <button
                onClick={() => void handleSave()}
                disabled={saving || data?.envOverrideActive}
                className="admin-button admin-button-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                style={
                  !saving && !data?.envOverrideActive
                    ? { backgroundColor: LINE_GREEN, borderColor: LINE_GREEN }
                    : {}
                }
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Credentials'}
              </button>
            </div>
          </div>

          {/* ── Setup instructions ── */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-6 py-5">
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              <h3 className="text-sm font-semibold text-blue-900">LINE Bot Setup Guide</h3>
            </div>
            <ol className="space-y-2 text-sm text-blue-800">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-700">
                  1
                </span>
                Go to{' '}
                <a
                  href="https://developers.line.biz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-2 hover:text-blue-600"
                >
                  developers.line.biz
                </a>{' '}
                and create a Messaging API channel
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-700">
                  2
                </span>
                Copy the <strong>Channel ID</strong> and <strong>Channel Secret</strong> from the
                Basic settings tab
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-700">
                  3
                </span>
                Issue a <strong>Channel Access Token</strong> from the Messaging API tab
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-700">
                  4
                </span>
                Paste the <strong>Webhook URL</strong> shown above into LINE and enable Use webhook
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-700">
                  5
                </span>
                Save credentials here, then verify with the Test Connection button in{' '}
                <Link href="/admin/chat" className="font-medium underline underline-offset-2">
                  Chat
                </Link>
              </li>
            </ol>
          </div>
        </>
      )}
    </main>
  );
}
