'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  LayoutList,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';

const LINE_GREEN = '#06C755';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
      <label htmlFor={id} className="block text-sm font-medium text-[hsl(var(--card-foreground))]">
        {label}
        {hasExistingValue && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}>
            <CheckCircle2 className="h-3 w-3" />
            บันทึกแล้ว
          </span>
        )}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          placeholder={placeholder ?? (hasExistingValue ? '••••••••  (ไม่กรอกเพื่อคงค่าเดิม)' : '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2.5 pr-10 text-sm font-mono text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] transition-colors"
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
      className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95"
    >
      {copied ? <Check className="h-3.5 w-3.5" style={{ color: '#16a34a' }} /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const queryClient = useQueryClient();

  const {
    isLoading,
    data: queryData,
    error: queryError,
  } = useQuery({
    queryKey: ['settings-integrations'],
    queryFn: async () => {
      const res: ApiResp<IntegrationData> = await fetch('/api/settings/integrations', {
        cache: 'no-store',
      }).then((r) => r.json());
      if (!res.success || !res.data) {
        throw new Error(res.error?.message ?? 'ไม่สามารถโหลดการตั้งค่าการเชื่อมต่อได้');
      }
      return res;
    },
  });

  const [data, setData] = useState<IntegrationData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [creatingMenu, setCreatingMenu] = useState(false);
  const [deletingMenu, setDeletingMenu] = useState(false);
  const [menuMsg, setMenuMsg] = useState<string | null>(null);
  const [menuError, setMenuError] = useState(false);

  const [channelId, setChannelId] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'ไม่สามารถโหลดการตั้งค่าได้');
      return;
    }
    if (queryData) {
      setData(queryData.data as IntegrationData);
      setChannelId((queryData.data as IntegrationData).channelId ?? '');
      setError(null);
    }
  }, [queryData, queryError]);

  const load = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['settings-integrations'] });
  }, [queryClient]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (!channelId.trim()) throw new Error('ต้องระบุ Channel ID');
      if (!channelSecret.trim()) throw new Error('ต้องระบุ Channel Secret — กรอกค่าเพื่อบันทึก');
      if (!accessToken.trim()) throw new Error('ต้องระบุ Access Token — กรอกค่าเพื่อบันทึก');

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

      if (!res.success) throw new Error(res.error?.message ?? 'ไม่สามารถบันทึกการตั้งค่าได้');
      setSuccessMsg('บันทึกการตั้งค่า LINE แล้ว');
      setChannelSecret('');
      setAccessToken('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSaving(false);
    }
  }

  async function createRichMenu() {
    setCreatingMenu(true);
    setMenuMsg(null);
    setMenuError(false);
    try {
      const res: ApiResp<{ menuId: string; name: string }> = await fetch('/api/line/rich-menu', {
        method: 'POST',
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message ?? 'ไม่สามารถสร้าง Rich Menu ได้');
      setMenuMsg(`สร้าง Rich Menu สำเร็จ: ${res.data?.name}`);
    } catch (err) {
      setMenuMsg(err instanceof Error ? err.message : 'ไม่สามารถสร้าง Rich Menu ได้');
      setMenuError(true);
    } finally {
      setCreatingMenu(false);
    }
  }

  async function deleteRichMenu() {
    setDeletingMenu(true);
    setMenuMsg(null);
    setMenuError(false);
    try {
      const res: ApiResp = await fetch('/api/line/rich-menu', {
        method: 'DELETE',
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message ?? 'ไม่สามารถลบ Rich Menu ได้');
      setMenuMsg('ลบ Rich Menu แล้ว');
    } catch (err) {
      setMenuMsg(err instanceof Error ? err.message : 'ไม่สามารถลบ Rich Menu ได้');
      setMenuError(true);
    } finally {
      setDeletingMenu(false);
    }
  }

  return (
    <main className="space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var(--glass-border))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/settings"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--glass-border))] glass-card shadow-sm transition-all hover:scale-105 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4 text-[hsl(var(--primary))]" />
            </Link>
            <div className="flex items-center gap-2">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: LINE_GREEN }}
              >
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">การเชื่อมต่อ LINE</h1>
                <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">
                  เชื่อมต่อ LINE Official Account สำหรับการส่งข้อความถึงผู้เช่า
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>
      </section>

      {/* Alerts */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl glass-card" />
          ))}
        </div>
      ) : (
        <>
          {/* Connection status banner */}
          <div
            className={`flex items-center gap-3 rounded-xl border px-5 py-3.5`}
            style={
              data?.connected
                ? { borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)' }
                : { borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)' }
            }
          >
            {data?.connected ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: '#16a34a' }} />
            ) : (
              <XCircle className="h-5 w-5 shrink-0" style={{ color: '#dc2626' }} />
            )}
            <div>
              <p className={`text-sm font-semibold ${data?.connected ? 'text-emerald-600' : 'text-red-600'}`}>
                {data?.connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้ตั้งค่า'}
              </p>
              <p className={`text-xs ${data?.connected ? 'text-emerald-600/70' : 'text-red-600/70'}`}>
                {data?.connected
                  ? 'ข้อมูล LINE พร้อมใช้งานและสามารถส่งข้อความได้'
                  : 'กรอกข้อมูล LINE ด้านล่างเพื่อเปิดใช้งานแชทผู้เช่า'}
              </p>
            </div>
          </div>

          {/* Env override warning */}
          {data?.envOverrideActive && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 px-5 py-4 text-sm" style={{ background: 'rgba(251,191,36,0.1)', color: '#d97706' }}>
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">การตั้งค่าถูกแทนที่ด้วยตัวแปรสภาพแวดล้อม</p>
                <p className="mt-0.5 opacity-80">
                  LINE_CHANNEL_ID, LINE_CHANNEL_SECRET และ LINE_ACCESS_TOKEN ถูกตั้งค่าในสภาพแวดล้อมของเซิร์ฟเวอร์ ค่าเหล่านี้มีลำดับความสำคัญเหนือกว่าค่าที่เก็บในฐานข้อมูล
                </p>
              </div>
            </div>
          )}

          {/* Credentials form card */}
          <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card overflow-hidden">
            <div
              className="flex items-center gap-3 px-6 py-4"
              style={{ background: `linear-gradient(135deg, ${LINE_GREEN}15 0%, ${LINE_GREEN}05 100%)` }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm" style={{ backgroundColor: LINE_GREEN }}>
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[hsl(var(--card-foreground))]">ข้อมูลรับรอง LINE Bot</h2>
                <p className="text-xs text-[hsl(var(--on-surface-variant))]">
                  จาก LINE Developers Console &rarr; Messaging API channel
                </p>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="space-y-1.5">
                <label htmlFor="line-channel-id" className="block text-sm font-medium text-[hsl(var(--card-foreground))]">
                  Channel ID
                  {data?.hasDbChannelId && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}>
                      <CheckCircle2 className="h-3 w-3" />
                      บันทึกแล้ว
                    </span>
                  )}
                </label>
                <input
                  id="line-channel-id"
                  type="text"
                  value={channelId}
                  placeholder="เช่น 1234567890"
                  onChange={(e) => setChannelId(e.target.value)}
                  disabled={data?.envOverrideActive}
                  className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] font-mono focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <SecretInput
                id="line-channel-secret"
                label="Channel Secret"
                value={channelSecret}
                hasExistingValue={data?.hasDbChannelSecret}
                onChange={setChannelSecret}
                disabled={data?.envOverrideActive}
              />

              <SecretInput
                id="line-access-token"
                label="Channel Access Token"
                value={accessToken}
                hasExistingValue={data?.hasDbAccessToken}
                onChange={setAccessToken}
                disabled={data?.envOverrideActive}
              />

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[hsl(var(--card-foreground))]">
                  Webhook URL
                  <span className="ml-2 text-xs font-normal text-[hsl(var(--on-surface-variant))]">(ตั้งค่าใน LINE console)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={data?.webhookUrl ?? ''}
                    readOnly
                    className="flex-1 rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2.5 text-xs text-[hsl(var(--card-foreground))] cursor-default select-all font-mono focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                  />
                  {data?.webhookUrl && <CopyButton text={data.webhookUrl} />}
                </div>
                <p className="text-xs text-[hsl(var(--on-surface-variant))]">
                  วาง URL นี้ใน LINE Developers Console &rarr; Messaging API &rarr; Webhook URL
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-b-xl border-t border-[hsl(var(--glass-border))] px-6 py-4 glass-card">
              <p className="text-xs text-[hsl(var(--on-surface-variant))]">
                {data?.envOverrideActive
                  ? 'ไม่สามารถแก้ไขได้ขณะที่ตัวแปรสภาพแวดล้อมทำงานอยู่'
                  : 'ข้อมูลรับรองถูกเข้ารหัสในฐานข้อมูล'}
              </p>
              <button
                onClick={() => void handleSave()}
                disabled={saving || data?.envOverrideActive}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                style={
                  !saving && !data?.envOverrideActive
                    ? { backgroundColor: LINE_GREEN, color: 'white', border: `1px solid ${LINE_GREEN}` }
                    : { backgroundColor: 'hsl(var(--primary))', color: 'white', border: 'none' }
                }
              >
                <Save className="h-4 w-4" />
                {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
            </div>
          </div>

          {/* Rich Menu card */}
          <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card overflow-hidden">
            <div
              className="flex items-center gap-3 px-6 py-4"
              style={{ background: `linear-gradient(135deg, ${LINE_GREEN}15 0%, ${LINE_GREEN}05 100%)` }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm" style={{ backgroundColor: LINE_GREEN }}>
                <LayoutList className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[hsl(var(--card-foreground))]">LINE Rich Menu</h2>
                <p className="text-xs text-[hsl(var(--on-surface-variant))]">
                  ตั้งค่าเมนูลัดบน LINE Official Account
                </p>
              </div>
            </div>

            <div className="px-6 py-6 space-y-4">
              <p className="text-sm text-[hsl(var(--on-surface-variant))]">
                Rich Menu คือเมนูที่แสดงที่ด้านล่างของหน้าจอ LINE เมื่อผู้ใช้เปิดแชทกับ Bot
                เมนูนี้มี 4 ปุ่ม: ดูยอดค้าง, ยืนยันชำระเงิน, ดูใบแจ้งหนี้ และส่งใบเสร็จ
              </p>

              <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-4 text-center">
                <p className="text-xs text-[hsl(var(--on-surface-variant))] mb-2">ตัวอย่าง Rich Menu</p>
                <div
                  className="inline-grid h-20 w-[260px] divide-x divide-white text-white text-[10px] font-medium rounded-xl overflow-hidden"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <div className="flex items-center justify-center bg-[#06C755]">ดูยอดค้าง</div>
                  <div className="flex items-center justify-center bg-[#00B900]">ยืนยันชำระ</div>
                  <div className="flex items-center justify-center bg-[#06C755]">ดูใบแจ้งหนี้</div>
                  <div className="flex items-center justify-center bg-[#00B900]">ส่งใบเสร็จ</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => void createRichMenu()}
                  disabled={creatingMenu || !data?.connected}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: LINE_GREEN, border: `1px solid ${LINE_GREEN}` }}
                >
                  {creatingMenu ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {creatingMenu ? 'กำลังสร้าง...' : 'สร้าง Rich Menu'}
                </button>
                <button
                  onClick={() => void deleteRichMenu()}
                  disabled={deletingMenu || !data?.connected}
                  className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingMenu ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deletingMenu ? 'กำลังลบ...' : 'ลบ Rich Menu'}
                </button>
              </div>

              {menuMsg && (
                <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${menuError ? 'border-red-500/30' : 'border-emerald-500/30'}`}
                  style={menuError ? { background: 'rgba(239,68,68,0.1)', color: '#dc2626' } : { background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                  {menuError ? <XCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  {menuMsg}
                </div>
              )}
            </div>
          </div>

          {/* Setup instructions */}
          <div className="rounded-xl border border-blue-500/20 px-6 py-5" style={{ background: 'rgba(99,102,241,0.05)' }}>
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              <h3 className="text-sm font-semibold text-[hsl(var(--card-foreground))]">คู่มือตั้งค่า LINE Bot</h3>
            </div>
            <ol className="space-y-2 text-sm text-[hsl(var(--on-surface-variant))]">
              {[
                'ไปที่ developers.line.biz แล้วสร้าง Messaging API channel',
                'คัดลอก Channel ID และ Channel Secret จากแท็บ Basic settings',
                'สร้าง Channel Access Token จากแท็บ Messaging API',
                'วาง Webhook URL ที่แสดงด้านบนใน LINE แล้วเปิดใช้งาน Use webhook',
                'เปิด Long-term channel access token ใน Messaging API settings',
                'ตั้งค่าชื่อ Bot, ไอคอน และข้อความต้อนรับใน LINE Developers Console',
              ].map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'hsl(var(--primary))', color: 'white' }}>
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </main>
  );
}