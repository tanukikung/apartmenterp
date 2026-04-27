'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Edit2,
  FileEdit,
  Loader2,
  PlusCircle,
  Trash2,
} from 'lucide-react';

type BillingRule = {
  code: string;
  descriptionTh: string;
  waterEnabled: boolean;
  waterUnitPrice: number;
  waterMinCharge: number;
  waterServiceFeeMode: string;
  waterServiceFeeAmount: number;
  electricEnabled: boolean;
  electricUnitPrice: number;
  electricMinCharge: number;
  electricServiceFeeMode: string;
  electricServiceFeeAmount: number;
  penaltyPerDay: number;
  maxPenalty: number;
  gracePeriodDays: number;
};

type EditForm = Omit<BillingRule, 'code'> & { code: string };

const EMPTY_FORM: EditForm = {
  code: '',
  descriptionTh: '',
  waterEnabled: false,
  waterUnitPrice: 0,
  waterMinCharge: 0,
  waterServiceFeeMode: 'NONE',
  waterServiceFeeAmount: 0,
  electricEnabled: false,
  electricUnitPrice: 0,
  electricMinCharge: 0,
  electricServiceFeeMode: 'NONE',
  electricServiceFeeAmount: 0,
  penaltyPerDay: 0,
  maxPenalty: 0,
  gracePeriodDays: 0,
};

function formatNumber(n: unknown): string {
  if (n == null) return '0';
  const num = typeof n === 'string' ? parseFloat(n) : Number(n);
  if (isNaN(num)) return '0';
  return num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function RuleForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial?: EditForm;
  onSave: (data: EditForm) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<EditForm>(initial ?? EMPTY_FORM);

  function set(key: keyof EditForm, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-sm px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-white/70">
            รหัสกฎ <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="เช่น STANDARD, PREMIUM"
            disabled={!!initial}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-white/70">
            ชื่อกฎ (TH) <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            value={form.descriptionTh}
            onChange={(e) => set('descriptionTh', e.target.value)}
            placeholder="เช่น มาตรฐาน"
            required
          />
        </div>
      </div>

      {/* Water */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">น้ำ</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-white/40">{form.waterEnabled ? 'เปิด' : 'ปิด'}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={form.waterEnabled}
              onChange={(e) => set('waterEnabled', e.target.checked)}
            />
          </label>
        </div>
        {form.waterEnabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">ค่าบริการ/หน่วย</label>
              <input type="number" className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.waterUnitPrice} onChange={(e) => set('waterUnitPrice', parseFloat(e.target.value) || 0)} min={0} step="0.01" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">ขั้นต่ำ (บาท)</label>
              <input type="number" className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.waterMinCharge} onChange={(e) => set('waterMinCharge', parseFloat(e.target.value) || 0)} min={0} step="0.01" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">ค่าบริการ</label>
              <select className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.waterServiceFeeMode} onChange={(e) => set('waterServiceFeeMode', e.target.value)}>
                <option value="NONE" className="bg-[hsl(225,25%,8%)]">ไม่คิด</option>
                <option value="FLAT_ROOM" className="bg-[hsl(225,25%,8%)]">คงที่/ห้อง</option>
                <option value="PER_UNIT" className="bg-[hsl(225,25%,8%)]">ต่อหน่วย</option>
                <option value="MANUAL_FEE" className="bg-[hsl(225,25%,8%)]">กำหนดเอง</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">จำนวนค่าบริการ</label>
              <input type="number" className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.waterServiceFeeAmount} onChange={(e) => set('waterServiceFeeAmount', parseFloat(e.target.value) || 0)} min={0} step="0.01" />
            </div>
          </div>
        )}
      </div>

      {/* Electric */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">ไฟฟ้า</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-white/40">{form.electricEnabled ? 'เปิด' : 'ปิด'}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={form.electricEnabled}
              onChange={(e) => set('electricEnabled', e.target.checked)}
            />
          </label>
        </div>
        {form.electricEnabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">ค่าบริการ/หน่วย</label>
              <input type="number" className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.electricUnitPrice} onChange={(e) => set('electricUnitPrice', parseFloat(e.target.value) || 0)} min={0} step="0.01" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">ขั้นต่ำ (บาท)</label>
              <input type="number" className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.electricMinCharge} onChange={(e) => set('electricMinCharge', parseFloat(e.target.value) || 0)} min={0} step="0.01" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">ค่าบริการ</label>
              <select className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.electricServiceFeeMode} onChange={(e) => set('electricServiceFeeMode', e.target.value)}>
                <option value="NONE" className="bg-[hsl(225,25%,8%)]">ไม่คิด</option>
                <option value="FLAT_ROOM" className="bg-[hsl(225,25%,8%)]">คงที่/ห้อง</option>
                <option value="PER_UNIT" className="bg-[hsl(225,25%,8%)]">ต่อหน่วย</option>
                <option value="MANUAL_FEE" className="bg-[hsl(225,25%,8%)]">กำหนดเอง</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">จำนวนค่าบริการ</label>
              <input type="number" className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.electricServiceFeeAmount} onChange={(e) => set('electricServiceFeeAmount', parseFloat(e.target.value) || 0)} min={0} step="0.01" />
            </div>
          </div>
        )}
      </div>

      {/* Penalty */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 space-y-3">
        <span className="text-sm font-semibold text-white">ค่าปรับ</span>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/40">ค่าปรับ/วัน (บาท)</label>
            <input type="number" className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.penaltyPerDay} onChange={(e) => set('penaltyPerDay', parseFloat(e.target.value) || 0)} min={0} step="0.01" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/40">ปรับสูงสุด (บาท)</label>
            <input type="number" className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.maxPenalty} onChange={(e) => set('maxPenalty', parseFloat(e.target.value) || 0)} min={0} step="0.01" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/40">วันผ่อนผัน</label>
            <input type="number" className="w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={form.gracePeriodDays} onChange={(e) => set('gracePeriodDays', parseInt(e.target.value) || 0)} min={0} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 hover:scale-105 active:scale-[0.98] disabled:opacity-50 transition-all"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {saving ? 'กำลังบันทึก...' : initial ? 'บันทึก' : 'สร้างกฎ'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:scale-105 active:scale-[0.98] disabled:opacity-50 transition-all"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

export default function BillingRulesPage() {
  const queryClient = useQueryClient();

  const { isLoading, data: queryData, error: queryError } = useQuery({
    queryKey: ['billing-rules'],
    queryFn: async () => {
      const res = await fetch('/api/billing-rules', { cache: 'no-store' });
      const json = await res.json() as { success: boolean; data?: BillingRule[]; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถโหลดกฎการเรียกเก็บ');
      return json;
    },
    retry: false,
  });

  const [rules, setRules] = useState<BillingRule[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [deleteConfirmCode, setDeleteConfirmCode] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (queryError) {
      setRules([]);
      return;
    }
    if (queryData?.data) {
      setRules(queryData.data);
    }
  }, [queryData, queryError]);

  const load = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['billing-rules'] });
  }, [queryClient]);

  function flashMessage(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleCreate(data: EditForm) {
    setFormError(null);
    if (!data.code.trim()) { setFormError('กรุณากรอกรหัสกฎ'); return; }
    if (!data.descriptionTh.trim()) { setFormError('กรุณากรอกชื่อกฎ'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/billing-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถสร้างกฎ');
      flashMessage(`สร้างกฎ "${data.code}" สำเร็จแล้ว`);
      setShowAddForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถสร้างกฎ');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(data: EditForm) {
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/billing-rules/${encodeURIComponent(editCode!)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถอัปเดตกฎ');
      flashMessage('อัปเดตกฎแล้ว');
      setEditCode(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถอัปเดตกฎ');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(code: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/billing-rules/${encodeURIComponent(code)}`, { method: 'DELETE' });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถลบกฎ');
      flashMessage(`ลบกฎ "${code}" แล้ว`);
      setDeleteConfirmCode(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถลบกฎ');
    } finally {
      setSaving(false);
    }
  }

  const editRule = editCode ? rules.find((r) => r.code === editCode) : null;

  const editForm: EditForm | null = editRule
    ? {
        code: editRule.code,
        descriptionTh: editRule.descriptionTh,
        waterEnabled: editRule.waterEnabled,
        waterUnitPrice: editRule.waterUnitPrice,
        waterMinCharge: editRule.waterMinCharge,
        waterServiceFeeMode: editRule.waterServiceFeeMode,
        waterServiceFeeAmount: editRule.waterServiceFeeAmount,
        electricEnabled: editRule.electricEnabled,
        electricUnitPrice: editRule.electricUnitPrice,
        electricMinCharge: editRule.electricMinCharge,
        electricServiceFeeMode: editRule.electricServiceFeeMode,
        electricServiceFeeAmount: editRule.electricServiceFeeAmount,
        penaltyPerDay: editRule.penaltyPerDay,
        maxPenalty: editRule.maxPenalty,
        gracePeriodDays: editRule.gracePeriodDays,
      }
    : null;

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[hsl(225,25%,6%)] via-[hsl(225,25%,8%)] to-[hsl(225,25%,6%)] px-6 py-5 shadow-xl shadow-black/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15),_transparent_60%)]" />
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Link href="/admin/settings" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 backdrop-blur-md transition-all hover:bg-white/10 hover:scale-105 active:scale-[0.98]">
            <ArrowLeft className="h-4 w-4 text-white/70" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-white">กติกาค่าบริการ</h1>
            <p className="text-sm text-white/50">กำหนดอัตราค่าน้ำค่าไฟ ค่าบริการ และค่าปรับสำหรับการเรียกเก็บเงิน</p>
          </div>
        </div>
        <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-white/10 hover:scale-105 active:scale-[0.98] mt-4" disabled={isLoading}>
          {isLoading ? 'กำลังโหลด...' : 'รีเฟรช'}
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-sm px-5 py-4 text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Rules table */}
        <section className="rounded-2xl border border-white/10 bg-[hsl(225,25%,6%)] shadow-xl shadow-black/20 overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <FileEdit className="h-4 w-4 text-white/40" />
              <div className="text-sm font-semibold text-white">กฎการเรียกเก็บทั้งหมด</div>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-white/60">{rules.length} กฎ</span>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">รหัส</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">ชื่อ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">น้ำ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">ไฟฟ้า</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">ค่าปรับ/วัน</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">วันผ่อนผัน</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-white/5" /></td>
                      ))}
                    </tr>
                  ))
                ) : rules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-white/30">ไม่พบกฎการเรียกเก็บ</td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.code} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-mono font-semibold text-primary">{rule.code}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80 font-medium">{rule.descriptionTh}</td>
                      <td className="px-4 py-3 text-center">
                        {rule.waterEnabled
                          ? <span className="text-xs text-blue-400 font-medium">{formatNumber(rule.waterUnitPrice)}/หน่วย</span>
                          : <span className="text-xs text-white/30">ปิด</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {rule.electricEnabled
                          ? <span className="text-xs text-amber-400 font-medium">{formatNumber(rule.electricUnitPrice)}/หน่วย</span>
                          : <span className="text-xs text-white/30">ปิด</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/50">{formatNumber(rule.penaltyPerDay)}</td>
                      <td className="px-4 py-3 text-sm text-white/50">{rule.gracePeriodDays}</td>
                      <td className="px-4 py-3">
                        {deleteConfirmCode === rule.code ? (
                          <div className="flex items-center gap-2">
                            <button onClick={() => void handleDelete(rule.code)} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 border border-red-500/30 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-all">
                              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} ลบ
                            </button>
                            <button onClick={() => setDeleteConfirmCode(null)} className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-white/70 hover:bg-white/10 transition-all">
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditCode(rule.code)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-white/70 hover:bg-white/10 transition-all">
                              <Edit2 className="h-3 w-3" /> แก้ไข
                            </button>
                            <button onClick={() => setDeleteConfirmCode(rule.code)} className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-all">
                              <Trash2 className="h-3 w-3" /> ลบ
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sidebar */}
        <section className="rounded-2xl border border-white/10 bg-[hsl(225,25%,6%)] shadow-xl shadow-black/20 h-fit">
          <div className="border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2">
              {editCode ? (
                <>
                  <Edit2 className="h-4 w-4 text-white/40" />
                  <div className="text-sm font-semibold text-white">แก้ไขกฎ: {editCode}</div>
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4 text-white/40" />
                  <div className="text-sm font-semibold text-white">เพิ่มกฎใหม่</div>
                </>
              )}
            </div>
          </div>
          <div className="p-4">
            {editCode && editForm ? (
              <RuleForm
                initial={editForm}
                onSave={handleUpdate}
                onCancel={() => { setEditCode(null); setFormError(null); }}
                saving={saving}
                error={formError}
              />
            ) : showAddForm ? (
              <RuleForm
                onSave={handleCreate}
                onCancel={() => { setShowAddForm(false); setFormError(null); }}
                saving={saving}
                error={formError}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-white/40">สร้างกฎการเรียกเก็บใหม่สำหรับน้ำ ไฟฟ้า และค่าปรับ</p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 hover:scale-105 active:scale-[0.98] transition-all"
                >
                  <PlusCircle className="h-4 w-4" />
                  เพิ่มกฎใหม่
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
