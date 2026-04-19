'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import {
  ArrowLeft,
  CheckCircle,
  FileSpreadsheet,
  Lock,
  Loader2,
  Send,
  AlertTriangle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'import' | 'review' | 'generate' | 'send' | 'complete';

interface WizardPeriod {
  id: string;
  year: number;
  month: number;
  status: 'OPEN' | 'LOCKED' | 'CLOSED';
  dueDay: number;
  totalRecords: number;
  totalRooms: number;
  missingRooms: number;
  totalAmount: number;
  invoiceCount: number;
  pendingInvoices: number;
  generatedInvoices: number;
  sentInvoices: number;
}

interface WizardData {
  currentStep: WizardStep;
  period: WizardPeriod | null;
  periodExists: boolean;
  latestBatch: {
    id: string;
    filename: string;
    status: string;
    rowCount: number;
    importedAt: string | null;
  } | null;
  lockedCount: number;
  toGenerateCount: number;
  generatedInvoiceIds: string[];
  sentCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function thaiMonth(year: number, month: number): string {
  return `${THAI_MONTHS[month - 1]} ${year + 543}`;
}

function formatBaht(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'import', label: '1. นำเข้าข้อมูล' },
  { id: 'review', label: '2. ตรวจสอบ' },
  { id: 'generate', label: '3. สร้างใบแจ้งหนี้' },
  { id: 'send', label: '4. ส่งใบแจ้งหนี้' },
  { id: 'complete', label: '5. เสร็จสิ้น' },
];

function StepIndicator({ current }: { current: WizardStep }): JSX.Element {
  const currentIdx = STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.id} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              done ? 'bg-emerald-100 text-emerald-700' :
              active ? 'bg-primary text-white' :
              'bg-surface-container text-on-surface-variant'
            }`}>
              {done
                ? <CheckCircle size={12} />
                : <span className="w-4 text-center">{i + 1}</span>
              }
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-4 sm:w-8 ${i < currentIdx ? 'bg-emerald-300' : 'bg-outline'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingWizardPage(): JSX.Element {
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery<WizardData>({
    queryKey: ['billing-wizard'],
    queryFn: async () => {
      const res = await fetch('/api/billing/wizard', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'โหลดข้อมูลไม่สำเร็จ');
      return json.data as WizardData;
    },
  });

  async function doAction(action: string, extra: Record<string, unknown> = {}): Promise<void> {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/billing/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? `Action ${action} failed`);
      setSuccessMsg(json.data?.message ?? 'สำเร็จแล้ว');
      await queryClient.invalidateQueries({ queryKey: ['billing-wizard'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
    } finally {
      setActionLoading(false);
    }
  }

  // Treat the wizard as "dirty" while an action is in flight or while the
  // period is mid-flow (records imported but invoices not yet fully sent).
  const wizardDirty =
    actionLoading ||
    (!!data?.period &&
      data.period.totalRecords > 0 &&
      data.period.sentInvoices < data.period.invoiceCount);
  useUnsavedChanges(wizardDirty);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  const step = data?.currentStep ?? 'import';
  const period = data?.period;

  const monthLabel = period
    ? thaiMonth(period.year, period.month)
    : thaiMonth(new Date().getFullYear(), new Date().getMonth() + 1);

  return (
    <main className="space-y-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/billing" className="p-2 rounded-lg hover:bg-surface-container transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Billing Wizard</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">{monthLabel}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-4">
        <StepIndicator current={step} />
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-error-container/10 border border-error-container/20 px-4 py-3 text-sm text-color-danger font-medium">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl bg-tertiary-container/10 border border-tertiary-container/20 px-4 py-3 text-sm text-tertiary-container font-medium">
          <CheckCircle size={16} />
          {successMsg}
        </div>
      )}

      {/* ── Step: Import ──────────────────────────────────────────────────── */}
      {step === 'import' && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary-container flex items-center justify-center">
              <FileSpreadsheet size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">นำเข้าข้อมูลมิเตอร์</h2>
              <p className="text-sm text-on-surface-variant">อัปโหลดไฟล์ Excel ค่าน้ำ/ไฟ สำหรับ {monthLabel}</p>
            </div>
          </div>

          {data?.latestBatch ? (
            <div className="rounded-xl bg-surface-container p-4">
              <p className="text-sm font-medium text-on-surface">ไฟล์ที่นำเข้าล่าสุด:</p>
              <p className="text-sm text-on-surface-variant mt-1">{data.latestBatch.filename}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{data.latestBatch.rowCount} รายการ</p>
              <p className="text-xs text-emerald-600 mt-1">✓ นำเข้าแล้ว</p>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-outline p-8 text-center">
              <FileSpreadsheet size={32} className="mx-auto text-on-surface-variant mb-3" />
              <p className="text-sm font-medium text-on-surface">ยังไม่ได้นำเข้าข้อมูลสำหรับเดือนนี้</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Link
              href="/admin/billing/import"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary/90 transition-colors"
            >
              <FileSpreadsheet size={16} />
              ไปหน้านำเข้า Excel
            </Link>
            {data?.period && (
              <button
                onClick={() => queryClient.setQueryData<WizardData>(['billing-wizard'], (old) => old ? { ...old, currentStep: 'review' } : old)}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-outline bg-surface-container-lowest px-5 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
              >
                ข้าม → ตรวจสอบ
              </button>
            )}
          </div>

          {!data?.periodExists && (
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">ยังไม่มีรอบบิลสำหรับเดือนนี้</p>
                <button
                  onClick={() => doAction('create-period', { dueDay: 25 })}
                  disabled={actionLoading}
                  className="mt-2 text-xs font-semibold text-amber-700 hover:underline"
                >
                  + สร้างรอบบิลใหม่
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step: Review ───────────────────────────────────────────────────── */}
      {step === 'review' && period && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FileSpreadsheet size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">ตรวจสอบข้อมูล</h2>
              <p className="text-sm text-on-surface-variant">ตรวจสอบความถูกต้องก่อนสร้างใบแจ้งหนี้</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl bg-surface-container p-4 text-center">
              <p className="text-2xl font-bold text-primary">{period.totalRecords}</p>
              <p className="text-xs text-on-surface-variant mt-1">รายการที่มี</p>
            </div>
            <div className="rounded-xl bg-surface-container p-4 text-center">
              <p className={`text-2xl font-bold ${period.missingRooms > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {period.missingRooms}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">ห้องไม่มีข้อมูล</p>
            </div>
            <div className="rounded-xl bg-surface-container p-4 text-center">
              <p className="text-2xl font-bold text-on-surface">{formatBaht(period.totalAmount)}</p>
              <p className="text-xs text-on-surface-variant mt-1">ยอดรวม (฿)</p>
            </div>
            <div className="rounded-xl bg-surface-container p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{period.totalRooms}</p>
              <p className="text-xs text-on-surface-variant mt-1">ห้องทั้งหมด</p>
            </div>
          </div>

          {period.missingRooms > 0 && (
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">มี {period.missingRooms} ห้องที่ไม่มีข้อมูลบิล</p>
                <p className="text-xs text-amber-700 mt-1">ห้องเหล่านี้จะไม่ถูกสร้างใบแจ้งหนี้ — สามารถเพิ่มข้อมูลได้ที่หน้า Import</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => doAction('lock-and-generate', { periodId: period.id })}
              disabled={actionLoading || period.totalRecords === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {actionLoading
                ? <Loader2 size={16} className="animate-spin" />
                : <Lock size={16} />
              }
              🔒 ล็อกและสร้างใบแจ้งหนี้
            </button>
            <Link
              href="/admin/billing"
              className="inline-flex items-center gap-2 rounded-xl border border-outline bg-surface-container-lowest px-5 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
            >
              แก้ไขข้อมูล
            </Link>
          </div>
        </div>
      )}

      {/* ── Step: Generate ────────────────────────────────────────────────── */}
      {step === 'generate' && period && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">สร้างใบแจ้งหนี้แล้ว</h2>
              <p className="text-sm text-on-surface-variant">รอบบิลถูกล็อกแล้ว กำลังสร้างใบแจ้งหนี้...</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-surface-container p-4 text-center">
              <p className="text-2xl font-bold text-primary">{period.invoiceCount}</p>
              <p className="text-xs text-on-surface-variant mt-1">ใบแจ้งหนี้ที่สร้าง</p>
            </div>
            <div className="rounded-xl bg-surface-container p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{period.generatedInvoices}</p>
              <p className="text-xs text-on-surface-variant mt-1">รอส่ง</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => queryClient.setQueryData<WizardData>(['billing-wizard'], (old) => old ? { ...old, currentStep: 'send' } : old)}
              disabled={period.generatedInvoices === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              ส่งใบแจ้งหนี้ →
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Send ────────────────────────────────────────────────────── */}
      {step === 'send' && period && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Send size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">ส่งใบแจ้งหนี้</h2>
              <p className="text-sm text-on-surface-variant">ส่ง LINE ให้ผู้เช่าทุกห้องที่มีใบแจ้งหนี้รอส่ง</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-surface-container p-4 text-center">
              <p className="text-2xl font-bold text-primary">{period.invoiceCount}</p>
              <p className="text-xs text-on-surface-variant mt-1">ใบแจ้งหนี้ทั้งหมด</p>
            </div>
            <div className="rounded-xl bg-surface-container p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{period.pendingInvoices}</p>
              <p className="text-xs text-on-surface-variant mt-1">รอส่ง</p>
            </div>
            <div className="rounded-xl bg-surface-container p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{period.sentInvoices}</p>
              <p className="text-xs text-on-surface-variant mt-1">ส่งแล้ว</p>
            </div>
          </div>

          {period.pendingInvoices > 0 ? (
            <button
              onClick={() => doAction('send-all', { periodId: period.id })}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary/90 transition-colors"
            >
              {actionLoading
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />
              }
              ส่ง LINE ทั้งหมด ({period.pendingInvoices} ฉบับ)
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-emerald-600 font-medium">✓ ส่งใบแจ้งหนี้หมดแล้ว</p>
              <button
                onClick={() => queryClient.setQueryData<WizardData>(['billing-wizard'], (old) => old ? { ...old, currentStep: 'complete' } : old)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary/90 transition-colors"
              >
                เสร็จสิ้น →
              </button>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
            <AlertTriangle size={16} className="text-blue-600 mt-0.5 shrink-0" />
            <p className="text-blue-700">ตรวจสอบว่า LINE Integration ถูก configure แล้ว ถ้าผู้เช่าไม่ได้ลิงก์ LINE account จะไม่ได้รับข้อความ</p>
          </div>
        </div>
      )}

      {/* ── Step: Complete ─────────────────────────────────────────────────── */}
      {(step === 'complete' || (period && period.sentInvoices === period.generatedInvoices && period.generatedInvoices > 0)) && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6 space-y-5">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle size={40} className="text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-emerald-700">รอบบิลเสร็จสมบูรณ์!</h2>
            <p className="text-sm text-on-surface-variant">ทุกอย่างพร้อมสำหรับ {monthLabel}</p>
          </div>

          {period && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-surface-container p-3 text-center">
                <p className="text-lg font-bold text-primary">{period.totalRecords}</p>
                <p className="text-[10px] text-on-surface-variant">รายการบิล</p>
              </div>
              <div className="rounded-xl bg-surface-container p-3 text-center">
                <p className="text-lg font-bold text-primary">{period.invoiceCount}</p>
                <p className="text-[10px] text-on-surface-variant">ใบแจ้งหนี้</p>
              </div>
              <div className="rounded-xl bg-surface-container p-3 text-center">
                <p className="text-lg font-bold text-primary">{period.sentInvoices}</p>
                <p className="text-[10px] text-on-surface-variant">ส่งแล้ว</p>
              </div>
              <div className="rounded-xl bg-surface-container p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">฿{(period.totalAmount / 1000).toFixed(0)}K</p>
                <p className="text-[10px] text-on-surface-variant">ยอดรวม</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/billing"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary/90 transition-colors"
            >
              ดูรายละเอียดบิล
            </Link>
            <Link
              href="/admin/payments/review"
              className="inline-flex items-center gap-2 rounded-xl border border-outline bg-surface-container-lowest px-5 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
            >
              ตรวจสอบการชำระเงิน
            </Link>
          </div>
        </div>
      )}

      {/* Back to regular billing page */}
      <div className="text-center">
        <Link href="/admin/billing" className="text-xs text-on-surface-variant hover:text-primary hover:underline">
          ← กลับไปหน้าบิล
        </Link>
      </div>
    </main>
  );
}
