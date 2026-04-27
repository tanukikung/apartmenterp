'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, XCircle } from 'lucide-react';
import { useApiData } from '@/hooks/useApi';

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
    case 'URGENT': return 'bg-red-500/20 text-red-400 border border-red-500/30';
    case 'HIGH': return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
    case 'LOW': return 'glass-card text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--glass-border))]';
    default: return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
  }
}

const PRESET_ROWS = [
  { periodDays: 7,  messageTh: 'เรียนผู้เช่าห้อง {{roomNo}} ค่ะ ขอแจ้งว่าค่าเช่าจำนวน {{amount}} จะครบกำหนดชำระในอีก 7 วัน (วันที่ {{dueDate}}) กรุณาชำระตามกำหนดนะคะ' },
  { periodDays: 3,  messageTh: 'เรียนผู้เช่าห้อง {{roomNo}} ค่ะ ขอแจ้งเตือนว่าค่าเช่า {{amount}} จะครบกำหนดชำระในอีก 3 วัน (วันที่ {{dueDate}}) กรุณาชำระทันเวลานะคะ' },
  { periodDays: 0,  messageTh: 'เรียนผู้เช่าห้อง {{roomNo}} ค่ะ วันนี้คือวันครบกำหนดชำระค่าเช่า {{amount}} กรุณาชำระภายในวันนี้ที่บัญชีที่แจ้งไว้นะคะ' },
  { periodDays: -3, messageTh: 'เรียนผู้เช่าห้อง {{roomNo}} ค่ะ ค่าเช่า {{amount}} ค้างชำระมา 3 วันแล้ว (ครบกำหนด {{dueDate}}) กรุณาชำระโดยเร็วที่สุดนะคะ' },
  { periodDays: -7, messageTh: 'ด่วน! เรียนผู้เช่าห้อง {{roomNo}} ค่ะ ค่าเช่า {{amount}} ค้างชำระมา 7 วันแล้ว กรุณาชำระทันที หากมีข้อสงสัยกรุณาติดต่อเจ้าหน้าที่' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReminderConfigPage() {
  const { toast } = useToast();

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description?: string;
    dangerous?: boolean;
    onConfirm: () => void;
  }>({ open: false, title: '', onConfirm: () => {} });

  const [_actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDays, setFormDays] = useState(7);
  const [formMessage, setFormMessage] = useState('');
  const [formPriority, setFormPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [formAppliesTo, setFormAppliesTo] = useState<'ALL' | 'OVERDUE' | 'DUE_SOON'>('ALL');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function openEditForm(config: ReminderConfig) {
    setEditingId(config.id);
    setFormDays(config.periodDays);
    setFormMessage(config.messageTh);
    setFormPriority(config.priority);
    setFormAppliesTo(config.appliesTo);
    setFormActive(config.isActive);
    setShowForm(true);
    setActionError(null);
    setSuccessMsg(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormDays(7);
    setFormMessage('');
    setFormPriority('NORMAL');
    setFormAppliesTo('ALL');
    setFormActive(true);
    setActionError(null);
  }

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: configsData, isLoading, error: fetchError, refetch } = useApiData<ApiResp<ListResp>>('/api/reminders/config?pageSize=50', ['reminder-configs']);

  const configs: ReminderConfig[] = configsData?.data?.items ?? [];

  async function handleSave() {
    if (!formMessage.trim()) {
      setActionError('กรุณากรอกข้อความ');
      return;
    }
    setSaving(true);
    setActionError(null);
    setSuccessMsg(null);
    try {
      const isEditing = editingId !== null;
      const res = await fetch('/api/reminders/config', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEditing
            ? { id: editingId, periodDays: formDays, messageTh: formMessage.trim(), priority: formPriority, appliesTo: formAppliesTo, isActive: formActive }
            : { periodDays: formDays, messageTh: formMessage.trim(), priority: formPriority, appliesTo: formAppliesTo, isActive: formActive }
        ),
      });
      const json: ApiResp<ReminderConfig> = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? (isEditing ? 'อัปเดตไม่สำเร็จ' : 'เพิ่มไม่สำเร็จ'));
      setSuccessMsg(isEditing ? 'อัปเดตการตั้งค่าเรียบร้อยแล้ว' : 'เพิ่มการตั้งค่าเรียบร้อยแล้ว');
      closeForm();
      void refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'ไม่สำเร็จ');
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
          void refetch();
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
      void refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ');
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
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var(--glass-border))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/settings"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--glass-border))] glass-card shadow-sm transition-all hover:scale-105 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4 text-[hsl(var(--primary))]" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">ตั้งค่าการแจ้งเตือนอัตโนมัติ</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">กำหนดตารางและข้อความสำหรับ reminder อัตโนมัติ</p>
            </div>
          </div>
          <button
            onClick={() => void refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--on-surface-variant))]">
        <Link href="/admin/settings" className="flex items-center gap-1 hover:text-[hsl(var(--card-foreground))]">
          ตั้งค่า
        </Link>
        <span>/</span>
        <span className="text-[hsl(var(--card-foreground))]">การแจ้งเตือนอัตโนมัติ</span>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {successMsg}
        </div>
      )}
      {fetchError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          <XCircle className="h-5 w-5 shrink-0" />
          {fetchError instanceof Error ? fetchError.message : String(fetchError)}
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 px-5 py-4 text-sm" style={{ background: 'rgba(99,102,241,0.05)', color: 'hsl(var(--primary))' }}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>periodDays คืออะไร:</strong> ค่าบวก = ก่อนครบกำหนด X วัน, ค่าลบ = หลังครบกำหนด X วัน, 0 = วันเดียวกับวันครบกำหนด
          <br />
          ตัวแปร: <code className="rounded px-1" style={{ background: 'rgba(99,102,241,0.15)' }}>{'{roomNo}'}</code> <code className="rounded px-1" style={{ background: 'rgba(99,102,241,0.15)' }}>{'{amount}'}</code> <code className="rounded px-1" style={{ background: 'rgba(99,102,241,0.15)' }}>{'{dueDate}'}</code> <code className="rounded px-1" style={{ background: 'rgba(99,102,241,0.15)' }}>{'{daysOverdue}'}</code>
        </p>
      </div>

      {/* Add Form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-white px-5 py-2.5 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
        >
          <Plus className="h-4 w-4" />
          เพิ่มการตั้งค่า
        </button>
      ) : (
        <div className="rounded-2xl border border-[hsl(var(--glass-border))] glass-card p-6 space-y-4">
          <h3 className="font-semibold text-[hsl(var(--card-foreground))]">{editingId ? 'แก้ไขการตั้งค่า Reminder' : 'เพิ่มการตั้งค่า Reminder ใหม่'}</h3>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--on-surface-variant))]">เลือกเทมเพลตสำเร็จรูป</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_ROWS.map((p, i) => (
                <button
                  key={p.periodDays}
                  type="button"
                  onClick={() => applyPreset(i)}
                  className="rounded-lg border border-[hsl(var(--glass-border))] glass-card px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))] hover:border-[hsl(var(--primary))]/40 transition-all hover:scale-105 active:scale-95"
                >
                  {periodLabel(p.periodDays)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[hsl(var(--card-foreground))]">จำนวนวัน</label>
              <input
                type="number"
                value={formDays}
                onChange={(e) => setFormDays(Number(e.target.value))}
                min={-60}
                max={60}
                className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40"
              />
              <p className="mt-1 text-xs text-[hsl(var(--on-surface-variant))]">{periodLabel(formDays)}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[hsl(var(--card-foreground))]">ความสำคัญ</label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as typeof formPriority)}
                className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
              >
                <option value="LOW">LOW</option>
                <option value="NORMAL">NORMAL</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[hsl(var(--card-foreground))]">ใช้กับ</label>
              <select
                value={formAppliesTo}
                onChange={(e) => setFormAppliesTo(e.target.value as typeof formAppliesTo)}
                className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
              >
                <option value="ALL">ทั้งหมด</option>
                <option value="OVERDUE">ค้างชำระ</option>
                <option value="DUE_SOON">ใกล้ครบกำหนด</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[hsl(var(--card-foreground))]">ข้อความ (Thai)</label>
            <textarea
              value={formMessage}
              onChange={(e) => setFormMessage(e.target.value)}
              rows={3}
              placeholder="เรียนผู้เช่าห้อง {{roomNo}} ค่ะ..."
              className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--card-foreground))]">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="h-4 w-4 rounded border-[hsl(var(--glass-border))] accent-[hsl(var(--primary))]"
              />
              เปิดใช้งานทันที
            </label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-white px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              onClick={closeForm}
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Config List */}
      {isLoading ? (
        <div className="flex items-center justify-center p-10">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--on-surface-variant))]" />
        </div>
      ) : configs.length === 0 ? (
        <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-10 text-center text-[hsl(var(--on-surface-variant))]">
          ไม่มีการตั้งค่า reminder — คลิก &quot;เพิ่มการตั้งค่า&quot; เพื่อสร้าง
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <div
              key={config.id}
              className={`rounded-2xl border p-5 glass-card transition-all ${config.isActive ? 'border-[hsl(var(--primary))]/20' : 'border-[hsl(var(--glass-border))] opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityColor(config.priority)}`}>
                      {config.priority}
                    </span>
                    <span className="text-sm font-semibold text-[hsl(var(--card-foreground))]">
                      {periodLabel(config.periodDays)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${config.appliesTo === 'ALL' ? 'glass-card text-[hsl(var(--on-surface-variant))]' : config.appliesTo === 'OVERDUE' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                      {config.appliesTo === 'ALL' ? 'ทั้งหมด' : config.appliesTo === 'OVERDUE' ? 'ค้างชำระ' : 'ใกล้ครบกำหนด'}
                    </span>
                    {!config.isActive && (
                      <span className="rounded-full px-2 py-0.5 text-xs text-[hsl(var(--on-surface-variant))] glass-card">ปิดใช้งาน</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-[hsl(var(--on-surface-variant))] line-clamp-2">{config.messageTh}</p>
                  <p className="mt-1 text-xs text-[hsl(var(--on-surface-variant))]/60">
                    อัปเดตล่าสุด: {new Date(config.updatedAt).toLocaleString('th-TH')}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void openEditForm(config)}
                    title="แก้ไข"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/20 transition-all hover:scale-105 active:scale-95"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    แก้ไข
                  </button>

                  <button
                    onClick={() => void handleToggleActive(config)}
                    title={config.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:scale-105 active:scale-95 ${
                      config.isActive
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        : 'border-[hsl(var(--glass-border))] glass-card text-[hsl(var(--card-foreground))] hover:border-[hsl(var(--primary))]/40'
                    }`}
                  >
                    {config.isActive ? (
                      <><CheckCircle2 className="h-3.5 w-3.5" /> เปิด</>
                    ) : (
                      <><XCircle className="h-3.5 w-3.5" /> ปิด</>
                    )}
                  </button>

                  <button
                    onClick={() => void handleDelete(config.id)}
                    disabled={deletingId === config.id}
                    title="ลบ"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
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