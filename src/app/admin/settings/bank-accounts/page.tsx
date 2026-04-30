'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Edit2,
  PlusCircle,
  Trash2,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BankAccount = {
  id: string;
  name: string;
  bankName: string;
  bankAccountNo: string;
  promptpay: string | null;
  active: boolean;
};

type CreateForm = {
  id: string;
  name: string;
  bankName: string;
  bankAccountNo: string;
  promptpay: string;
  active: boolean;
};

const EMPTY_FORM: CreateForm = {
  id: '',
  name: '',
  bankName: '',
  bankAccountNo: '',
  promptpay: '',
  active: true,
};

// ---------------------------------------------------------------------------
// Bank color helpers
// ---------------------------------------------------------------------------

const BANK_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  กสิกรไทย:    { bg: 'bg-emerald-500/20',  text: 'text-emerald-600', border: 'border-emerald-500/30', dot: 'bg-emerald-500'  },
  kbank:       { bg: 'bg-emerald-500/20',  text: 'text-emerald-600', border: 'border-emerald-500/30', dot: 'bg-emerald-500'  },
  กรุงเทพ:    { bg: 'bg-blue-500/20',    text: 'text-blue-600',    border: 'border-blue-500/30',    dot: 'bg-blue-500'     },
  bbl:         { bg: 'bg-blue-500/20',     text: 'text-blue-600',    border: 'border-blue-500/30',    dot: 'bg-blue-500'     },
  ไทยพาณิชย์: { bg: 'bg-violet-500/20',   text: 'text-violet-600',  border: 'border-violet-500/30',  dot: 'bg-violet-500'   },
  scb:         { bg: 'bg-violet-500/20',   text: 'text-violet-600',  border: 'border-violet-500/30',  dot: 'bg-violet-500'   },
  กรุงไทย:    { bg: 'bg-teal-500/20',     text: 'text-teal-600',    border: 'border-teal-500/30',    dot: 'bg-teal-500'     },
  ktb:         { bg: 'bg-teal-500/20',     text: 'text-teal-600',    border: 'border-teal-500/30',    dot: 'bg-teal-500'     },
  tmbthanachart: { bg: 'bg-orange-500/20', text: 'text-orange-600',  border: 'border-orange-500/30',  dot: 'bg-orange-500'   },
  ttb:         { bg: 'bg-orange-500/20',  text: 'text-orange-600',  border: 'border-orange-500/30',  dot: 'bg-orange-500'   },
};

function getBankColor(bankName: string) {
  const key = bankName.toLowerCase().replace(/\s/g, '');
  for (const [k, v] of Object.entries(BANK_COLORS)) {
    if (key.includes(k.toLowerCase())) return v;
  }
  return { bg: 'bg-white/5', text: 'text-[hsl(var(--on-surface-variant))]', border: 'border-[hsl(var([hsl(var(--color-border))]))]', dot: 'bg-[hsl(var(--on-surface-variant))]' };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className={` rounded-2xl p-5 flex items-center gap-4 transition-all hover:scale-[1.01] active:scale-[0.98] hover:shadow-glow ${color}`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))]" style={{ background: 'hsl(var(--card))' }}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums text-[hsl(var(--card-foreground))]">{value}</div>
        <div className="text-sm text-[hsl(var(--on-surface-variant))]">{label}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BankAccountsPage() {
  const queryClient = useQueryClient();

  const {
    isLoading,
    data: queryData,
    error: queryError,
  } = useQuery({
    queryKey: ['settings-bank-accounts'],
    queryFn: async () => {
      const res = await fetch('/api/bank-accounts', { cache: 'no-store' });
      const json = await res.json() as { success: boolean; data?: BankAccount[]; error?: { message?: string } };
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดบัญชีธนาคารได้');
      }
      return json;
    },
  });

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'ไม่สามารถโหลดบัญชีธนาคารได้');
      return;
    }
    if (queryData) {
      setAccounts(queryData.data as BankAccount[]);
      setError(null);
    }
  }, [queryData, queryError]);

  const load = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['settings-bank-accounts'] });
  }, [queryClient]);

  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function flashMessage(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  }

  function startEdit(account: BankAccount) {
    setEditId(account.id);
    setForm({
      id: account.id,
      name: account.name,
      bankName: account.bankName,
      bankAccountNo: account.bankAccountNo,
      promptpay: account.promptpay ?? '',
      active: account.active,
    });
    setDeleteConfirmId(null);
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  async function handleCreate() {
    if (!form.id || !form.name || !form.bankName || !form.bankAccountNo) {
      setError('กรุณากรอกทุกช่องที่จำเป็น (ID, ชื่อ, ธนาคาร, เลขบัญชี)');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          name: form.name,
          bankName: form.bankName,
          bankAccountNo: form.bankAccountNo,
          promptpay: form.promptpay || null,
          active: form.active,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถสร้างบัญชีธนาคารได้');
      setForm(EMPTY_FORM);
      flashMessage('สร้างบัญชีธนาคารสำเร็จแล้ว');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถสร้างบัญชีธนาคารได้');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/bank-accounts/${encodeURIComponent(editId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          bankName: form.bankName,
          bankAccountNo: form.bankAccountNo,
          promptpay: form.promptpay || null,
          active: form.active,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถอัปเดตบัญชีธนาคารได้');
      cancelEdit();
      flashMessage('อัปเดตบัญชีธนาคารแล้ว');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถอัปเดตบัญชีธนาคารได้');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/bank-accounts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถปิดใช้งานบัญชีธนาคารได้');
      setDeleteConfirmId(null);
      flashMessage('ปิดใช้งานบัญชีธนาคารแล้ว');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถปิดใช้งานบัญชีธนาคารได้');
    } finally {
      setSaving(false);
    }
  }

  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter((a) => a.active).length;
  const isEditing = editId !== null;

  return (
    <main className="space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.15) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  shadow-sm transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4 text-[hsl(var(--primary))]" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[hsl(var(--card-foreground))]">บัญชีธนาคาร</h1>
            <p className="text-sm text-[hsl(var(--on-surface-variant))]">
              จัดการบัญชีที่ใช้รับชำระเงินในใบแจ้งหนี้และใบเสร็จ
            </p>
          </div>
        </div>
      </section>

      {/* Alerts */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard
          label="บัญชีทั้งหมด"
          value={totalAccounts}
          icon={<Banknote className="h-5 w-5 text-[hsl(var(--primary))]" />}
          color="border-[hsl(var(--primary))]/20"
        />
        <KpiCard
          label="บัญชีที่ใช้งาน"
          value={activeAccounts}
          icon={<CreditCard className="h-5 w-5 text-emerald-600" />}
          color="border-emerald-500/20"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Left: Table */}
        <div className=" rounded-xl xl:col-span-3 overflow-hidden">
          <div className="mb-4 flex items-center justify-between px-5 py-4 border-b border-[hsl(var([hsl(var(--color-border))]))]">
            <h2 className="text-base font-semibold text-[hsl(var(--card-foreground))]">บัญชีธนาคารทั้งหมด</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold  text-[hsl(var(--on-surface-variant))]">
              {totalAccounts} บัญชี
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[hsl(var([hsl(var(--color-border))]))]">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] text-left">ธนาคาร</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] text-left">เลขบัญชี</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] text-left">PromptPay</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] text-center">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] text-right">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-[hsl(var([hsl(var(--color-border))]))]">
                      {[...Array(5)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded-lg" style={{ background: 'hsl(var(--card))' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-[hsl(var(--on-surface-variant))] opacity-50">
                      ยังไม่มีบัญชีธนาคาร กรุณาเพิ่มจากฟอร์มด้านขวา
                    </td>
                  </tr>
                ) : (
                  accounts.map((account) => {
                    const colors = getBankColor(account.bankName);
                    return (
                      <tr key={account.id} className="border-b border-[hsl(var([hsl(var(--color-border))]))] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.dot}`} />
                            <div>
                              <div className="font-medium text-[hsl(var(--card-foreground))]">{account.name}</div>
                              <div className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
                                {account.bankName}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-[hsl(var(--card-foreground))] tabular-nums">
                          {account.bankAccountNo}
                        </td>
                        <td className="px-4 py-3 text-sm text-[hsl(var(--on-surface-variant))]">
                          {account.promptpay ?? <span className="opacity-30">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {account.active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              ใช้งาน
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-[hsl(var([hsl(var(--color-border))]))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--on-surface-variant))]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--on-surface-variant))]" />
                              ไม่ใช้งาน
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {deleteConfirmId === account.id ? (
                              <>
                                <span className="mr-2 text-xs text-[hsl(var(--on-surface-variant))] opacity-60">ปิดใช้งาน?</span>
                                <button
                                  onClick={() => void handleDelete(account.id)}
                                  disabled={saving}
                                  className="rounded-lg bg-red-500/20 border border-red-500/30 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                >
                                  ตกลง
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--card-foreground))] hover:bg-white/5 transition-all hover:scale-105 active:scale-95"
                                >
                                  ยกเลิก
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(account)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  text-[hsl(var(--on-surface-variant))] transition-all hover:scale-105 active:scale-95 hover:border-[hsl(var(--primary))]/40 hover:text-[hsl(var(--primary))]"
                                  title="แก้ไข"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                {account.active && (
                                  <button
                                    onClick={() => {
                                      setDeleteConfirmId(account.id);
                                      setEditId(null);
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  text-[hsl(var(--on-surface-variant))] opacity-50 transition-all hover:scale-105 active:scale-95 hover:border-red-500/30 hover:text-red-600 hover:opacity-100"
                                    title="ปิดใช้งาน"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Add / Edit form */}
        <div className=" rounded-xl xl:col-span-2">
          <div className="mb-5 flex items-center gap-3 px-5 py-4 border-b border-[hsl(var([hsl(var(--color-border))]))]">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/20">
              {isEditing ? (
                <Edit2 className="h-4 w-4 text-[hsl(var(--primary))]" />
              ) : (
                <PlusCircle className="h-4 w-4 text-[hsl(var(--primary))]" />
              )}
            </div>
            <h2 className="text-base font-semibold text-[hsl(var(--card-foreground))]">
              {isEditing ? `แก้ไข: ${editId}` : 'เพิ่มบัญชีธนาคาร'}
            </h2>
          </div>

          <div className="space-y-4 px-5 pb-5">
            {!isEditing && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">
                  รหัสบัญชี <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 font-mono transition-all"
                  placeholder="เช่น ACC_KBANK_01"
                  value={form.id}
                  onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))}
                />
                <p className="mt-1 text-xs text-[hsl(var(--on-surface-variant))]">ต้องไม่ซ้ำกัน ไม่สามารถเปลี่ยนได้หลังสร้างแล้ว</p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">
                ชื่อที่แสดง <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all"
                placeholder="เช่น บัญชีหลัก กสิกรไทย"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">
                ชื่อธนาคาร <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all"
                placeholder="เช่น กสิกรไทย"
                list="bank-suggestions"
                value={form.bankName}
                onChange={(e) => setForm((prev) => ({ ...prev, bankName: e.target.value }))}
              />
              <datalist id="bank-suggestions">
                {['กสิกรไทย', 'กรุงเทพ', 'ไทยพาณิชย์', 'กรุงไทย', 'TMBThanachart', 'กรุงศรีอยุธยา', 'ออมสิน', 'ทหารไทย'].map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              {form.bankName && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${getBankColor(form.bankName).dot}`} />
                  <span className={`text-xs font-medium ${getBankColor(form.bankName).text}`}>
                    {form.bankName}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">
                เลขบัญชี <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 font-mono tracking-wider transition-all"
                placeholder="xxx-x-xxxxx-x"
                value={form.bankAccountNo}
                onChange={(e) => setForm((prev) => ({ ...prev, bankAccountNo: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">
                หมายเลข PromptPay <span className="text-[hsl(var(--on-surface-variant))] font-normal">(ไม่บังคับ)</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 font-mono transition-all"
                placeholder="0XX-XXX-XXXX or เลขผู้เสียภาษี"
                value={form.promptpay}
                onChange={(e) => setForm((prev) => ({ ...prev, promptpay: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-4 py-3">
              <input
                type="checkbox"
                id="active-toggle"
                checked={form.active}
                onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                className="h-4 w-4 rounded border-[hsl(var([hsl(var(--color-border))]))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]/20"
              />
              <label htmlFor="active-toggle" className="text-sm font-medium text-[hsl(var(--card-foreground))]">
                ใช้งาน (พร้อมใช้ในใบแจ้งหนี้)
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              {isEditing ? (
                <>
                  <button
                    onClick={() => void handleUpdate()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] text-white px-4 py-2 text-sm font-medium shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--primary))]/90 flex-1 justify-center disabled:opacity-50"
                  >
                    {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] hover:bg-white/5 px-4 py-2 text-sm font-medium shadow-sm transition-all hover:scale-105 active:scale-95 justify-center"
                  >
                    ยกเลิก
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void handleCreate()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] text-white px-4 py-2 text-sm font-medium shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--primary))]/90 w-full justify-center disabled:opacity-50 hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
                >
                  <PlusCircle className="h-4 w-4" />
                  {saving ? 'กำลังสร้าง...' : 'เพิ่มบัญธนาคาร'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
