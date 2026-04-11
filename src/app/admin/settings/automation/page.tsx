'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
// Cron parser
// ────────────────────────────────────────────────────────────────────────────
function parseCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, dom, month, dow] = parts;

  const pad = (n: string) => n.padStart(2, '0');
  const timeStr = (h: string, m: string) => `${pad(h)}:${pad(m)}`;
  const isNum = (s: string) => /^\d+$/.test(s);

  const dowNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const monthNames = [
    '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];

  if (expr === '* * * * *') return 'ทุกนาที';

  if (isNum(minute) && isNum(hour) && dom === '*' && month === '*' && dow === '*') {
    return `ทุกวันเวลา ${timeStr(hour, minute)}`;
  }

  if (isNum(minute) && isNum(hour) && dom === '*' && month === '*' && isNum(dow)) {
    const dayName = dowNames[Number(dow)] ?? dow;
    return `ทุก${dayName}เวลา ${timeStr(hour, minute)}`;
  }

  if (isNum(minute) && isNum(hour) && isNum(dom) && month === '*' && dow === '*') {
    const suffix = dom === '1' ? 'วัน' : dom === '2' ? 'วัน' : dom === '3' ? 'วัน' : 'วัน';
    return `รายเดือน${suffix}ที่ ${dom} เวลา ${timeStr(hour, minute)}`;
  }

  if (isNum(minute) && isNum(hour) && isNum(dom) && isNum(month) && dow === '*') {
    const mName = monthNames[Number(month)] ?? month;
    return `${mName} ${dom} เวลา ${timeStr(hour, minute)} ทุกปี`;
  }

  const everyMin = minute.match(/^\*\/(\d+)$/);
  if (everyMin && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `ทุก ${everyMin[1]} นาที`;
  }

  const everyHr = hour.match(/^\*\/(\d+)$/);
  if (isNum(minute) && everyHr && dom === '*' && month === '*' && dow === '*') {
    return `ทุก ${everyHr[1]} ชั่วโมง นาทีที่ ${minute}`;
  }

  return expr;
}

const CRON_REGEX = /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)$/;

function isValidCron(expr: string): boolean {
  return CRON_REGEX.test(expr.trim());
}

const PRESETS = [
  { label: 'ทุกวัน 03:00 น.', value: '0 3 * * *' },
  { label: 'ทุกวัน 08:00 น.', value: '0 8 * * *' },
  { label: 'ทุกวัน 00:00 น.', value: '0 0 * * *' },
  { label: 'รายเดือน วันที่ 1 03:00 น.', value: '0 3 1 * *' },
  { label: 'ทุกวันจันทร์ 08:00 น.', value: '0 8 * * 1' },
  { label: 'ทุก 6 ชม.', value: '0 */6 * * *' },
];

// ────────────────────────────────────────────────────────────────────────────
// Automation card
// ────────────────────────────────────────────────────────────────────────────
type CardColor = 'blue' | 'amber' | 'red' | 'green';

const COLOR_MAP: Record<CardColor, { ring: string; iconBg: string; iconText: string; badge: string; badgeText: string }> = {
  blue: { ring: 'border-blue-200', iconBg: 'bg-blue-100', iconText: 'text-blue-600', badge: 'bg-blue-50 border-blue-100', badgeText: 'text-blue-700' },
  amber: { ring: 'border-amber-200', iconBg: 'bg-amber-100', iconText: 'text-amber-600', badge: 'bg-amber-50 border-amber-100', badgeText: 'text-amber-700' },
  red: { ring: 'border-red-200', iconBg: 'bg-red-100', iconText: 'text-red-600', badge: 'bg-red-50 border-red-100', badgeText: 'text-red-700' },
  green: { ring: 'border-green-200', iconBg: 'bg-green-100', iconText: 'text-green-600', badge: 'bg-green-50 border-green-100', badgeText: 'text-green-700' },
};

function AutomationCard({
  id, icon: Icon, title, description, color, value, onChange, disabled,
}: {
  id: string; icon: React.ElementType; title: string; description: string;
  color: CardColor; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  const c = COLOR_MAP[color];
  const valid = isValidCron(value);
  const humanDesc = valid ? parseCron(value) : null;

  return (
    <div className={`rounded-2xl border bg-[var(--surface-container-lowest)] p-5 shadow-sm transition-shadow hover:shadow-md ${c.ring}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}>
          <Icon className={`h-5 w-5 ${c.iconText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--on-surface)]">{title}</h3>
          <p className="mt-0.5 text-xs text-[var(--on-surface-variant)]">{description}</p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={id} className="block text-xs font-medium text-[var(--on-surface-variant)]">
          นิพจน์ Cron
        </label>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0 3 * * *"
          className={`w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 font-mono text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 disabled:cursor-not-allowed disabled:opacity-50 ${
            value && !valid ? 'border-[var(--error-container)]' : ''
          }`}
        />
        {value && !valid && (
          <p className="text-xs text-[var(--on-error-container)]">Cron ไม่ถูกต้อง — ต้องมี 5 ฟิลด์ (นาที ชม. วัน เดือน วันในสัปดาห์)</p>
        )}

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

        {humanDesc && (
          <div className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-container)] px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--on-surface-variant)]" />
            <p className="text-xs text-[var(--on-surface-variant)]">
              <span className="font-medium">รอบถัดไป: </span>{humanDesc}
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
  const queryClient = useQueryClient();

  // useQuery for automation settings
  const {
    isLoading,
    data: queryData,
    error: queryError,
  } = useQuery({
    queryKey: ['settings-automation'],
    queryFn: async () => {
      const res: ApiResp<AutomationData> = await fetch('/api/settings/automation', { cache: 'no-store' }).then((r) => r.json());
      if (!res.success || !res.data) {
        throw new Error(res.error?.message ?? 'ไม่สามารถโหลดการตั้งค่าอัตโนมัติได้');
      }
      return res;
    },
  });

  // Local state mirroring original behaviour
  const [data, setData] = useState<AutomationData | null>(null);
  const [original, setOriginal] = useState<AutomationData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [billingCron, setBillingCron] = useState('0 3 1 * *');
  const [reminderCron, setReminderCron] = useState('0 8 * * *');
  const [overdueCron, setOverdueCron] = useState('0 4 * * *');
  const [backupCron, setBackupCron] = useState('0 3 * * *');

  // Sync from useQuery result to local state
  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'ไม่สามารถโหลดการตั้งค่าได้');
      return;
    }
    if (queryData) {
      const d = queryData.data as AutomationData;
      setData(d);
      setOriginal(d);
      setBillingCron(d.billingCron);
      setReminderCron(d.reminderCron);
      setOverdueCron(d.overdueCron);
      setBackupCron(d.backupCron);
      setError(null);
    }
  }, [queryData, queryError]);

  // Replace load() with invalidate + refetch
  const load = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['settings-automation'] });
  }, [queryClient]);

  const isDirty =
    billingCron !== original?.billingCron ||
    reminderCron !== original?.reminderCron ||
    overdueCron !== original?.overdueCron ||
    backupCron !== original?.backupCron;

  const allValid = isValidCron(billingCron) && isValidCron(reminderCron) && isValidCron(overdueCron) && isValidCron(backupCron);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (!allValid) throw new Error('นิพจน์ Cron บางรายการไม่ถูกต้อง กรุณาแก้ไขก่อนบันทึก');
      const res: ApiResp<AutomationData> = await fetch('/api/settings/automation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingCron, reminderCron, overdueCron, backupCron }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message ?? 'ไม่สามารถบันทึกการตั้งค่าอัตโนมัติได้');
      setSuccessMsg(res.message ?? 'บันทึกการตั้งค่าอัตโนมัติแล้ว');
      if (res.data) { setData(res.data); setOriginal(res.data); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!original) return;
    setBillingCron(original.billingCron);
    setReminderCron(original.reminderCron);
    setOverdueCron(original.overdueCron);
    setBackupCron(original.backupCron);
    setError(null);
    setSuccessMsg(null);
  }

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Cpu className="h-5 w-5 text-[var(--on-primary)]" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[var(--on-primary)]">กฎระบบอัตโนมัติ</h1>
              <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">กำหนด cron schedules สำหรับ background jobs</p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-white/30"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/settings" className="flex items-center gap-1 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]">
          <ArrowLeft className="h-4 w-4" /> ตั้งค่า
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-[var(--on-surface)]">กฎระบบอัตโนมัติ</span>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--tertiary-container)] bg-[var(--tertiary-container)]/20 px-5 py-3.5 text-sm font-medium text-[var(--on-tertiary-container)]">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--error-container)] bg-[var(--error-container)]/20 px-5 py-3.5 text-sm font-medium text-[var(--on-error-container)]">
          <XCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Warning */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-5 py-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">การเปลี่ยนแปลงจะมีผลหลังรีสตาร์ทเซิร์ฟเวอร์</span>{' '}
          Cron schedules จะถูกโหลดตอนสตาร์ท บันทึกการตั้งค่าแล้วรีสตาร์ทเซิร์ฟเวอร์หรือเวิร์คเกอร์เพื่อใช้งานตารางใหม่
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-[var(--surface-container)]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <AutomationCard id="billing-cron" icon={Calendar} title="สร้างบิลรายเดือน" description="สร้างใบแจ้งหนี้อัตโนมัติในวันที่กำหนดสำหรับห้องที่ใช้งานทั้งหมด" color="blue" value={billingCron} onChange={setBillingCron} />
            <AutomationCard id="reminder-cron" icon={Bell} title="ส่งเตือนการชำระ" description="ส่งข้อความ LINE ไปยังผู้เช่าที่มีใบแจ้งหนี้ค้างชำระ" color="amber" value={reminderCron} onChange={setReminderCron} />
            <AutomationCard id="overdue-cron" icon={AlertTriangle} title="ตรวจสอบค้างชำระ" description="ตั้งใบแจ้งหนี้เป็นค้างชำระเมื่อเกินกำหนดชำระ" color="red" value={overdueCron} onChange={setOverdueCron} />
            <AutomationCard id="backup-cron" icon={Database} title="สำรองฐานข้อมูล" description="สร้างการสำรองข้อมูล PostgreSQL ที่เข้ารหัสไปยังปลายทางที่กำหนด" color="green" value={backupCron} onChange={setBackupCron} />
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-5 py-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-[var(--on-surface-variant)]">
              <Cpu className="h-4 w-4 text-[var(--on-surface-variant)]" />
              {isDirty ? 'คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : data ? 'ตารางอัตโนมัติเป็นปัจจุบันแล้ว' : 'กำลังโหลด…'}
            </div>
            <div className="flex items-center gap-3">
              {isDirty && (
                <button onClick={handleReset} className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
                  รีเซ็ต
                </button>
              )}
              <button
                onClick={() => void handleSave()}
                disabled={saving || isLoading || !isDirty || !allValid}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'กำลังบันทึก…' : 'บันทึกทั้งหมด'}
              </button>
            </div>
          </div>

          {/* Cron reference */}
          <div className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)] px-6 py-5">
            <h3 className="mb-3 text-sm font-semibold text-[var(--on-surface)]">คู่มือนิพจน์ Cron</h3>
            <div className="mb-3 rounded-lg bg-[#1e293b] px-4 py-3 font-mono text-xs text-slate-300">
              ┌───── minute (0-59)<br />
              │ ┌─────── hour (0-23)<br />
              │ │ ┌───────── day of month (1-31)<br />
              │ │ │ ┌─────────── month (1-12)<br />
              │ │ │ │ ┌───────────── day of week (0-6, Sun=0)<br />
              * * * * *
            </div>
            <div className="grid gap-2 sm:grid-cols-2 text-xs text-[var(--on-surface-variant)]">
              {[
                { expr: '0 3 1 * *', desc: 'รายเดือน วันที่ 1 เวลา 03:00' },
                { expr: '0 8 * * *', desc: 'ทุกวันเวลา 08:00' },
                { expr: '0 4 * * *', desc: 'ทุกวันเวลา 04:00' },
                { expr: '0 3 * * *', desc: 'ทุกวันเวลา 03:00' },
                { expr: '0 0 * * 1', desc: 'ทุกวันจันทร์ เที่ยงคืน' },
                { expr: '*/30 * * * *', desc: 'ทุก 30 นาที' },
              ].map(({ expr, desc }) => (
                <div key={expr} className="flex items-center gap-2">
                  <code className="rounded bg-[var(--surface-container-lowest)] px-2 py-0.5 font-mono text-[var(--on-surface)] border border-[var(--outline-variant)]">{expr}</code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Related links */}
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/system-jobs" className="inline-flex items-center gap-2 rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2.5 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
              <Cpu className="h-4 w-4" />
              งานระบบ
            </Link>
            <Link href="/admin/settings/billing-policy" className="inline-flex items-center gap-2 rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2.5 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
              <Calendar className="h-4 w-4" />
              ปฏิทินการเรียกเก็บ
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
