'use client';

/**
 * Reminder Config UI — admin configures the auto-reminder schedule.
 *
 * Each ReminderConfig has:
 *   periodDays  — negative = overdue reminder (e.g. -3 = 3 days after due date)
 *                positive = pre-due reminder (e.g. 7 = 7 days before due date)
 *                0        = due today
 *   messageTh   — Thai message template with {{roomNo}}, {{amount}}, {{dueDate}}, {{daysOverdue}}
 *   isActive    — whether this config fires
 *   priority    — LOW / NORMAL / HIGH / URGENT
 *   appliesTo   — ALL / OVERDUE / DUE_SOON
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type ReminderConfig = {
  id: string;
  periodDays: number;
  messageTh: string;
  messageEn: string;
  isActive: boolean;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  appliesTo: 'ALL' | 'OVERDUE' | 'DUE_SOON';
  createdAt: string;
  updatedAt: string;
};

type ApiResp<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
  message?: string;
};

type ListResp = {
  items: ReminderConfig[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodLabel(days: number): string {
  if (days > 0) return `${days} วันก่อนครบกำหนด`;
  if (days < 0) return `${Math.abs(days)} วันหลังครบกำหนด`;
  return 'วันครบกำหนด';
}

function priorityColor(p: string): string {
  switch (p) {
    case 'URGENT': return 'bg-red-100 text-red-700';
    case 'HIGH': return 'bg-orange-100 text-orange-700';
    case 'LOW': return 'bg-slate-100 text-slate-600';
    default: return 'bg-blue-100 text-blue-700';
  }
}

const PRESET_ROWS = [
  { periodDays: 7,  messageTh: 'เรียนผู้เช่าห้อง {{roomNo}} ค่ะ ขอแจ้งว่าค่าเช่าจำนวน {{amount}} จะครบกำหนดชำระในอีก 7 วัน (วันที่ {{dueDate}}) กรุณาชำระตามกำหนดนะคะ' },
  { periodDays: 3,  messageTh: 'เรียนผู้เช่าห้อง {{roomNo}} ค่ะ ขอแจ้งเตือนว่าค่าเช่า {{amount}} จะครบกำหนดชำระในอีก 3 วัน (วันที่ {{dueDate}}) กรุณาชำระทันเวลานะคะ' },
  { periodDays: 0,  messageTh: 'เรียนผู้เช่าห้อง {{roomNo}} ค่ะ วันนี้คือวันครบกำหนดชำระค่าเช่า {{amount}} กรุณาชำระภายในวันนี้ที่บัญชีที่แจ้งไว้นะคะ 🙏' },
  { periodDays: -3, messageTh: 'เรียนผู้เช่าห้อง {{roomNo}} ค่ะ ค่าเช่า {{amount}} ค้างชำระมา 3 วันแล้ว (ครบกำหนด {{dueDate}}) กรุณาชำระโดยเร็วที่สุดนะคะ' },
  { periodDays: -7, messageTh: 'ด่วน! เรียนผู้เช่าห้อง {{roomNo}} ค่ะ ค่าเช่า {{amount}} ค้างชำระมา 7 วันแล้ว กรุณาชำระทันที หากมีข้อสงสัยกรุณาติดต่อเจ้าหน้าที่' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReminderConfigPage() {
  const { toast } = useToast();

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description?: string;
    dangerous?: boolean;
    onConfirm: () => void;
  }>({ open: false, title: '', onConfirm: () => {} });

  const [configs, setConfigs] = useState<ReminderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state for adding new config
  const [showForm, setShowForm] = useState(false);
  const [formDays, setFormDays] = useState(7);
  const [formMessage, setFormMessage] = useState('');
  const [formPriority, setFormPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [formAppliesTo, setFormAppliesTo] = useState<'ALL' | 'OVERDUE' | 'DUE_SOON'>('ALL');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reminders/config?pageSize=50', { cache: 'no-store' });
      const json: ApiResp<ListResp> = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถโหลดการตั้งค่า');
      setConfigs(json.data?.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    if (!formMessage.trim()) {
      setError('กรุณากรอกข้อความ');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/reminders/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodDays: formDays,
          messageTh: formMessage.trim(),
          isActive: formActive,
          priority: formPriority,
          appliesTo: formAppliesTo,
        }),
      });
      const json: ApiResp<ReminderConfig> = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'เพิ่มไม่สำเร็จ');
      setSuccessMsg('เพิ่มการตั้งค่าเรียบร้อยแล้ว');
      setShowForm(false);
      setFormMessage('');
      setFormDays(7);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เพิ่มไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDialog({
      open: true,
      title: 'ลบการตั้งค่า',
      description: 'ลบการตั้งค่านี้?',
      dangerous: true,
      onConfirm: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        setDeletingId(id);
        try {
          const res = await fetch(`/api/reminders/config?id=${id}`, { method: 'DELETE' });
          const json: ApiResp<{ deleted: boolean }> = await res.json();
          if (!json.success) throw new Error(json.error?.message ?? 'ลบไม่สำเร็จ');
          setConfigs((prev) => prev.filter((c) => c.id !== id));
        } catch (err) {
          toast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error');
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  async function handleToggleActive(config: ReminderConfig) {
    try {
      const res = await fetch('/api/reminders/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: config.id, isActive: !config.isActive }),
      });
      const json: ApiResp<ReminderConfig> = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'อัปเดตไม่สำเร็จ');
      setConfigs((prev) =>
        prev.map((c) => (c.id === config.id ? { ...c, isActive: !c.isActive } : c))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ');
    }
  }

  function applyPreset(index: number) {
    const preset = PRESET_ROWS[index];
    setFormDays(preset.periodDays);
    setFormMessage(preset.messageTh);
  }

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Bell className="h-5 w-5 text-[var(--on-primary)]" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[var(--on-primary)]">ตั้งค่าการแจ้งเตือนอัตโนมัติ</h1>
              <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">กำหนดตารางและข้อความสำหรับ reminder อัตโนมัติ</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-white/30"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/settings" className="flex items-center gap-1 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]">
          <ArrowLeft className="h-4 w-4" /> ตั้งค่า
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-[var(--on-surface)]">การแจ้งเตือนอัตโนมัติ</span>
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

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>periodDays คืออะไร:</strong> ค่าบวก = ก่อนครบกำหนด X วัน (เช่น 7 = 7 วันก่อน),
          ค่าลบ = หลังครบกำหนด X วัน (เช่น -3 = 3 วันหลัง),
          0 = วันเดียวกับวันครบกำหนด
          <br />
          ตัวแปรในข้อความ: <code>{'{{roomNo}}'}</code> <code>{'{{amount}}'}</code> <code>{'{{dueDate}}'}</code> <code>{'{{daysOverdue}}'}</code>
        </p>
      </div>

      {/* Add Form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-5 py-2.5 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          เพิ่มการตั้งค่า
        </button>
      ) : (
        <div className="rounded-2xl border border-[var(--outline-variant)]/30 bg-[var(--surface-container-lowest)] p-6 space-y-4">
          <h3 className="font-semibold text-[var(--on-surface)]">เพิ่มการตั้งค่า Reminder ใหม่</h3>

          {/* Presets */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--on-surface-variant)]">เลือกเทมเพลตสำเร็จรูป</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_ROWS.map((p, i) => (
                <button
                  key={p.periodDays}
                  type="button"
                  onClick={() => applyPreset(i)}
                  className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-lowest)] transition-colors"
                >
                  {periodLabel(p.periodDays)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--on-surface)]">จำนวนวัน</label>
              <input
                type="number"
                value={formDays}
                onChange={(e) => setFormDays(Number(e.target.value))}
                min={-60}
                max={60}
                className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
              />
              <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{periodLabel(formDays)}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--on-surface)]">ความสำคัญ</label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as typeof formPriority)}
                className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
              >
                <option value="LOW">LOW</option>
                <option value="NORMAL">NORMAL</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--on-surface)]">ใช้กับ</label>
              <select
                value={formAppliesTo}
                onChange={(e) => setFormAppliesTo(e.target.value as typeof formAppliesTo)}
                className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
              >
                <option value="ALL">ทั้งหมด</option>
                <option value="OVERDUE">ค้างชำระ</option>
                <option value="DUE_SOON">ใกล้ครบกำหนด</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--on-surface)]">ข้อความ (Thai)</label>
            <textarea
              value={formMessage}
              onChange={(e) => setFormMessage(e.target.value)}
              rows={3}
              placeholder="เรียนผู้เช่าห้อง {{roomNo}} ค่ะ..."
              className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--on-surface)]">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--outline)]"
              />
              เปิดใช้งานทันที
            </label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => void handleAdd()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null); }}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Config List */}
      {loading ? (
        <div className="flex items-center justify-center p-10">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--on-surface-variant)]" />
        </div>
      ) : configs.length === 0 ? (
        <div className="rounded-xl border border-[var(--outline-variant)]/30 bg-[var(--surface-container-lowest)] p-10 text-center text-[var(--on-surface-variant)]">
          ไม่มีการตั้งค่า reminder — คลิก &quot;เพิ่มการตั้งค่า&quot; เพื่อสร้าง
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <div
              key={config.id}
              className={`rounded-2xl border bg-[var(--surface-container-lowest)] p-5 transition-opacity ${
                config.isActive ? 'border-[var(--primary)]/20' : 'border-[var(--outline-variant)]/30 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityColor(config.priority)}`}>
                      {config.priority}
                    </span>
                    <span className="text-sm font-semibold text-[var(--on-surface)]">
                      {periodLabel(config.periodDays)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${config.appliesTo === 'ALL' ? 'bg-slate-100 text-slate-600' : config.appliesTo === 'OVERDUE' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                      {config.appliesTo === 'ALL' ? 'ทั้งหมด' : config.appliesTo === 'OVERDUE' ? 'ค้างชำระ' : 'ใกล้ครบกำหนด'}
                    </span>
                    {!config.isActive && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">ปิดใช้งาน</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-[var(--on-surface-variant)] line-clamp-2">{config.messageTh}</p>
                  <p className="mt-1 text-xs text-[var(--on-surface-variant)]/60">
                    อัปเดตล่าสุด: {new Date(config.updatedAt).toLocaleString('th-TH')}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Toggle active */}
                  <button
                    onClick={() => void handleToggleActive(config)}
                    title={config.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      config.isActive
                        ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                        : 'border-[var(--outline-variant)] bg-[var(--surface-container)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-lowest)]'
                    }`}
                  >
                    {config.isActive ? (
                      <><CheckCircle2 className="h-3.5 w-3.5" /> เปิด</>
                    ) : (
                      <><XCircle className="h-3.5 w-3.5" /> ปิด</>
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => void handleDelete(config.id)}
                    disabled={deletingId === config.id}
                    title="ลบ"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === config.id ? 'กำลังลบ...' : 'ลบ'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        dangerous={confirmDialog.dangerous}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />
    </main>
  );
}