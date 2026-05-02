'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  RotateCw,
  XCircle,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { isLineConfigured } from '@/lib/line/is-configured';
import { statusBadgeClass } from '@/lib/status-colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceStatus = 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';

type BillingItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

type InvoiceResponse = {
  id: string;
  invoiceNumber: string;
  roomNo: string;
  roomBillingId: string;
  year: number;
  month: number;
  status: InvoiceStatus;
  totalAmount: number;
  dueDate: string | Date;
  issuedAt: string | Date | null;
  sentAt: string | Date | null;
  paidAt: string | Date | null;
  createdAt: string | Date;
  room?: {
    roomNo?: string;
    roomNumber?: string;
    floor?: { name?: string } | null;
  };
  tenant?: { id: string; fullName: string; phone: string } | null;
  tenantName?: string | null;
  roomBilling?: {
    billingPeriodId?: string;
    rentAmount?: string | number;
    waterTotal?: string | number;
    waterUnits?: string | number;
    electricTotal?: string | number;
    electricUnits?: string | number;
    commonServiceFee?: string | number;
    commonAreaWaterShare?: string | number;
    furnitureFee?: string | number;
    otherFee?: string | number;
  };
  deliveries?: Array<{
    id: string;
    channel: string;
    status: string;
    sentAt?: string | Date | null;
    viewedAt?: string | Date | null;
    errorMessage?: string | null;
  }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function thaiMonthYear(year: number, month: number): string {
  return `${THAI_MONTHS[(month - 1) % 12]} ${year + 543}`;
}

function money(amount: number | null | undefined): string {
  if (amount == null) return '฿0';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type StatusColor = 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'neutral';

function getInvoiceStatusColor(status: InvoiceStatus): StatusColor {
  switch (status) {
    case 'PAID':      return 'success';
    case 'VIEWED':    return 'violet';
    case 'OVERDUE':   return 'danger';
    case 'CANCELLED': return 'neutral';
    default:          return 'info';
  }
}

function invoiceBadgeClass(status: InvoiceStatus): string {
  return statusBadgeClass(getInvoiceStatusColor(status));
}

// ---------------------------------------------------------------------------
// Record Payment Form
// ---------------------------------------------------------------------------

function RecordPaymentForm({
  invoiceId,
  remainingAmount,
  onSuccess,
}: {
  invoiceId: string;
  remainingAmount: number;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<number | null>(remainingAmount);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CHECK' | 'TRANSFER'>('CASH');
  const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);

    // Client-side overpayment validation
    if (amount !== null && amount > remainingAmount) {
      setError('จำนวนเงินที่ชำระเกินยอดค้างชำระ กรุณาตรวจสอบ');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          amount: amount ?? 0,
          paymentMethod,
          paidAt: new Date(paidAt).toISOString(),
          notes: notes || undefined,
        }),
      }).then(r => r.json());
      if (res.success) {
        setMessage(res.message || 'บันทึกการชำระแล้ว');
        setAmount(null);
        setNotes('');
        queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
        onSuccess();
      } else {
        setError(res.error?.message || 'ไม่สามารถบันทึกการชำระ');
      }
    } catch {
      setError('เกิดข้อผิดพลาดเครือข่าย กรุณาลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <h3 className="text-sm font-semibold text-emerald-400">บันทึกการชำระเงิน</h3>
      {message && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-[hsl(var(--on-surface-variant))]">จำนวน (บาท)</label>
          <CurrencyInput
            value={amount}
            onChange={setAmount}
            ariaLabel="จำนวน (บาท)"
            required
            className="mt-1 w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text))]/30 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[hsl(var(--on-surface-variant))]">วิธีการชำระ</label>
          <select
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value as 'CASH' | 'CHECK' | 'TRANSFER')}
            className="mt-1 w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--color-text))]/80 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          >
            <option value="CASH">เงินสด</option>
            <option value="CHECK">เช็ค</option>
            <option value="TRANSFER">โอนเงิน</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[hsl(var(--on-surface-variant))]">วันที่ชำระ</label>
          <input
            type="date"
            value={paidAt}
            onChange={e => setPaidAt(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--color-text))] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[hsl(var(--on-surface-variant))]">หมายเหตุ (ไม่บังคับ)</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text))]/30 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
            placeholder="เช่น รับเงินที่เคาน์เตอร์"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-400 transition-all hover:bg-emerald-500/30 active:scale-[0.98] disabled:opacity-40"
      >
        {submitting ? 'กำลังบันทึก...' : 'บันทึกการชำระ'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cancel Invoice Button
// ---------------------------------------------------------------------------

function CancelInvoiceButton({
  invoiceId,
  onCancelled,
}: {
  invoiceId: string;
  onCancelled: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    setCancelMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/cancel`, { method: 'POST' }).then(r => r.json());
      if (res.success) {
        setCancelMessage('ยกเลิกใบแจ้งหนี้แล้ว');
        onCancelled();
      } else {
        setCancelMessage(res.error?.message || 'ไม่สามารถยกเลิกใบแจ้งหนี้');
      }
    } catch {
      setCancelMessage('เกิดข้อผิดพลาดเครือข่าย');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.98]"
      >
        <XCircle className="h-4 w-4" />
        ยกเลิกใบแจ้งหนี้
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="ยกเลิกใบแจ้งหนี้?"
        description="ใบแจ้งหนี้จะถูกยกเลิกและ RoomBilling จะถูกปลดล็อกเพื่อสร้างใบแจ้งหนี้ใหม่ได้"
        confirmLabel={cancelling ? 'กำลังยกเลิก...' : 'ยกเลิกใบแจ้งหนี้'}
        cancelLabel="ปิด"
        dangerous
        onConfirm={() => { setConfirmOpen(false); void handleCancel(); }}
        onCancel={() => setConfirmOpen(false)}
      />
      {cancelMessage && (
        <div className={`mt-3 rounded-lg px-4 py-2 text-sm ${cancelMessage.includes('แล้ว') ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border border-red-500/20 bg-red-500/10 text-red-400'}`}>
          {cancelMessage}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params?.id as string;
  const queryClient = useQueryClient();

  const [notFound, setNotFound] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateMessage, setRegenerateMessage] = useState<React.ReactNode>(null);
  const [regenerateSuccess, setRegenerateSuccess] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [copyLinkMessage, setCopyLinkMessage] = useState<string | null>(null);

  const { data: invoice, isLoading: loading, error } = useQuery<InvoiceResponse>({
    queryKey: ['invoices', invoiceId],
    queryFn: async () => {
      if (!invoiceId) throw new Error('No invoice ID');
      const res = await fetch(`/api/invoices/${invoiceId}`, { cache: 'no-store' });
      if (res.status === 404) {
        setNotFound(true);
        throw new Error('Not found');
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'ไม่สามารถโหลดใบแจ้งหนี้');
      return data.data as InvoiceResponse;
    },
    enabled: !!invoiceId,
  });

  const inv = invoice!;

  async function sendInvoice() {
    if (!invoiceId) return;
    setSending(true);
    setSendMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then(r => r.json());
      if (res.success) {
        setSendMessage('Invoice sent via LINE.');
        await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      } else {
        setSendMessage(res.error?.message || 'Failed to send invoice');
      }
    } catch {
      setSendMessage('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleRegenerate() {
    if (!invoiceId) return;
    setRegenerating(true);
    setRegenerateMessage(null);
    try {
      const cancelRes = await fetch(`/api/invoices/${invoiceId}/cancel`, { method: 'POST' }).then(r => r.json());
      if (!cancelRes.success) {
        throw new Error(cancelRes.error?.message || 'ไม่สามารถยกเลิกใบแจ้งหนี้');
      }
      await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      const billingPeriodId = inv.roomBilling?.billingPeriodId;
      const cycleLink = billingPeriodId
        ? <><a href={`/admin/billing/${billingPeriodId}`} className="underline hover:no-underline">ไปที่รอบบิล</a> เพื่อสร้างใบแจ้งหนี้ใหม่</>
        : 'ไปที่ บิล > รอบบิลที่เกี่ยวข้อง เพื่อสร้างใบแจ้งหนี้ใหม่';
      setRegenerateSuccess(true);
      setRegenerateMessage(<>ยกเลิกใบแจ้งหนี้เดิมแล้ว กรุณา {cycleLink}</>);
    } catch (err) {
      setRegenerateMessage(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setRegenerating(false);
    }
  }

  // Loading
  if (loading) {
    return (
      <main className="space-y-6">
        <div className="py-16 text-center text-sm text-[hsl(var(--color-text))]/40">กำลังโหลดใบแจ้งหนี้...</div>
      </main>
    );
  }

  // Not found
  if (notFound || (!loading && !invoice)) {
    return (
      <main className="space-y-6">
        <nav className="flex items-center gap-1.5 text-sm text-[hsl(var(--color-text))]/40">
          <Link href="/admin/invoices" className="hover:text-[hsl(var(--primary))] transition-colors">
            ใบแจ้งหนี้
          </Link>
          <span className="text-[hsl(var(--color-text))]/20">/</span>
          <span className="font-medium text-[hsl(var(--color-text))]/60">ไม่พบ</span>
        </nav>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] py-20 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400" />
          <div>
            <h2 className="text-lg font-semibold text-[hsl(var(--color-text))]">ไม่พบใบแจ้งหนี้</h2>
            <p className="mt-1 text-sm text-[hsl(var(--color-text))]/40">
              ไม่พบใบแจ้งหนี้รหัส <code className="font-mono text-xs text-[hsl(var(--primary))]">{invoiceId}</code>
            </p>
          </div>
          <Link
            href="/admin/invoices"
            className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-text))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:bg-[hsl(var(--color-primary-dark))] hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98] mt-2"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับไปยังใบแจ้งหนี้
          </Link>
        </div>
      </main>
    );
  }

  const period = thaiMonthYear(inv.year, inv.month);
  const roomNumber = inv.room?.roomNumber ?? inv.roomNo;
  const tenantName = inv.tenant?.fullName ?? inv.tenantName ?? 'ไม่ระบุผู้เช่า';
  const rb = inv.roomBilling;

  // Build line items from roomBilling
  const lineItems: BillingItem[] = [];
  if (rb) {
    if (Number(rb.rentAmount) > 0) {
      lineItems.push({ id: 'rent', description: 'ค่าเช่า (Rent)', quantity: 1, unitPrice: Number(rb.rentAmount), amount: Number(rb.rentAmount) });
    }
    if (Number(rb.waterTotal) > 0) {
      lineItems.push({ id: 'water', description: `ค่าน้ำ (Water) - ${rb.waterUnits ?? 0} units`, quantity: Number(rb.waterUnits) || 1, unitPrice: Number(rb.waterTotal) / Math.max(Number(rb.waterUnits) || 1, 1), amount: Number(rb.waterTotal) });
    }
    if (Number(rb.electricTotal) > 0) {
      lineItems.push({ id: 'electric', description: `ค่าไฟ (Electric) - ${rb.electricUnits ?? 0} units`, quantity: Number(rb.electricUnits) || 1, unitPrice: Number(rb.electricTotal) / Math.max(Number(rb.electricUnits) || 1, 1), amount: Number(rb.electricTotal) });
    }
    if (Number(rb.commonServiceFee) > 0) {
      lineItems.push({ id: 'common', description: 'ค่าบริการส่วนกลาง (Common Service)', quantity: 1, unitPrice: Number(rb.commonServiceFee), amount: Number(rb.commonServiceFee) });
    }
    if (Number(rb.commonAreaWaterShare) > 0) {
      lineItems.push({ id: 'common-water', description: 'ค่าน้ำส่วนกลาง (Common Area Water)', quantity: 1, unitPrice: Number(rb.commonAreaWaterShare), amount: Number(rb.commonAreaWaterShare) });
    }
    if (Number(rb.furnitureFee) > 0) {
      lineItems.push({ id: 'furniture', description: 'ค่าเฟอร์นิเจอร์ (Furniture)', quantity: 1, unitPrice: Number(rb.furnitureFee), amount: Number(rb.furnitureFee) });
    }
    if (Number(rb.otherFee) > 0) {
      lineItems.push({ id: 'other', description: 'ค่าอื่นๆ (Other)', quantity: 1, unitPrice: Number(rb.otherFee), amount: Number(rb.otherFee) });
    }
  }

  const canSend = inv.status === 'GENERATED' || inv.status === 'VIEWED';
  const canRegenerate = inv.status === 'GENERATED' || inv.status === 'SENT' || inv.status === 'VIEWED';

  return (
    <main className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-[hsl(var(--color-text))]/40">
        <Link href="/admin/invoices" className="hover:text-[hsl(var(--primary))] transition-colors">
          ใบแจ้งหนี้
        </Link>
        <span className="text-[hsl(var(--color-text))]/20">/</span>
        <span className="font-medium text-[hsl(var(--color-text))]/60">{inv.invoiceNumber}</span>
      </nav>

      {/* Page header */}
      <section className="rounded-2xl border border-[hsl(var(--color-border))] bg-gradient-to-br from-[hsl(var(--primary))]/20 to-[hsl(var(--primary))]/5 px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/invoices"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/50 shadow-sm transition-all hover:border-[hsl(var(--primary))]/30 hover:bg-[hsl(var(--color-surface))]/80 active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4 text-[hsl(var(--color-text))]/70" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-[hsl(var(--color-text))]">{inv.invoiceNumber}</h1>
              <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${invoiceBadgeClass(inv.status)}`}>
                {inv.status}
              </span>
            </div>
            <p className="text-sm text-[hsl(var(--on-surface-variant))]">
              {period} · Room {roomNumber} · {tenantName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] })}
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))]/70 transition-all hover:bg-[hsl(var(--color-surface))]/80 hover:border-[hsl(var(--color-border))]/80 active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" />
            รีเฟรช
          </button>
          {canSend && (
            <button
              onClick={() => { if (!isLineConfigured()) { setSendMessage('LINE ไม่ได้รับการตั้งค่า ไม่สามารถส่งได้'); return; } setSendConfirmOpen(true); }}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-400 transition-all hover:bg-blue-500/20 active:scale-[0.98] disabled:opacity-40"
            >
              <MessageSquare className="h-4 w-4" />
              {sending ? 'กำลังส่ง...' : 'ส่งผ่าน LINE'}
            </button>
          )}
          <Link
            href={`/api/invoices/${invoiceId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))]/70 transition-all hover:bg-white/[0.08] active:scale-[0.98]"
          >
            <ExternalLink className="h-4 w-4" />
            ดู PDF
          </Link>
          <button
            onClick={async () => {
              const url = `${window.location.origin}/api/invoices/${invoiceId}/pdf`;
              try {
                await navigator.clipboard.writeText(url);
                setCopyLinkMessage('คัดลอกลิงก์แล้ว');
                setTimeout(() => setCopyLinkMessage(null), 2000);
              } catch {
                setCopyLinkMessage('คัดลอกไม่ได้');
                setTimeout(() => setCopyLinkMessage(null), 2000);
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))]/70 transition-all hover:bg-white/[0.08] active:scale-[0.98]"
          >
            <Copy className="h-4 w-4" />
            คัดลอกลิงก์
          </button>
          {canRegenerate && (
            <button
              onClick={() => setRegenerateConfirmOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-400 transition-all hover:bg-amber-500/20 active:scale-[0.98]"
            >
              <RotateCw className="h-4 w-4" />
              สร้างใบแจ้งหนี้ใหม่
            </button>
          )}
          {inv.status === 'GENERATED' || inv.status === 'SENT' || inv.status === 'VIEWED' ? (
            <CancelInvoiceButton invoiceId={invoiceId} onCancelled={() => queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] })} />
          ) : null}
        </div>
        {copyLinkMessage && (
          <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            {copyLinkMessage}
          </div>
        )}
        {sendMessage && (
          <div className={`mt-3 rounded-lg px-4 py-2 text-sm ${sendMessage.includes('sent') || sendMessage.includes('LINE') ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border border-red-500/20 bg-red-500/10 text-red-400'}`}>
            {sendMessage}
          </div>
        )}
        {regenerateMessage && (
          <div className={`mt-3 rounded-lg px-4 py-2 text-sm ${regenerateSuccess ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border border-red-500/20 bg-red-500/10 text-red-400'}`}>
            {regenerateMessage}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {/* Invoice details */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Left: details card */}
        <div className="rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 lg:col-span-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40 mb-4">รายละเอียดใบแจ้งหนี้</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">ห้อง</div>
              <div className="mt-1 text-sm font-medium text-[hsl(var(--color-text))]/90">{roomNumber}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">ผู้เช่า</div>
              <div className="mt-1 text-sm font-medium text-[hsl(var(--color-text))]/90">{tenantName}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">งวด</div>
              <div className="mt-1 text-sm font-medium text-[hsl(var(--color-text))]/90">{period}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">จำนวนรวม</div>
              <div className="mt-1 text-xl font-bold text-[hsl(var(--color-text))]">{money(inv.totalAmount)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">วันครบกำหนด</div>
              <div className="mt-1 text-sm font-medium text-[hsl(var(--color-text))]/70">{fmtDate(inv.dueDate)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">ออกเมื่อ</div>
              <div className="mt-1 text-sm font-medium text-[hsl(var(--color-text))]/70">{fmtDateTime(inv.issuedAt)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">ส่งเมื่อ</div>
              <div className="mt-1 text-sm font-medium text-[hsl(var(--color-text))]/70">{fmtDateTime(inv.sentAt)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">ชำระเมื่อ</div>
              <div className="mt-1 text-sm font-medium text-[hsl(var(--color-text))]/70">{fmtDateTime(inv.paidAt)}</div>
            </div>
          </div>

          {/* Line items */}
          {lineItems.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40 mb-3">รายการ</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--color-border))] text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/40">
                    <th className="pb-2 text-left">รายละเอียด</th>
                    <th className="pb-2 text-right">จำนวน</th>
                    <th className="pb-2 text-right">ราคา/หน่วย</th>
                    <th className="pb-2 text-right">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map(item => (
                    <tr key={item.id} className="border-b border-[hsl(var(--color-border))]/50 last:border-0">
                      <td className="py-2 text-[hsl(var(--color-text))]/70">{item.description}</td>
                      <td className="py-2 text-right tabular-nums text-[hsl(var(--on-surface-variant))]">{item.quantity}</td>
                      <td className="py-2 text-right tabular-nums text-[hsl(var(--on-surface-variant))]">{money(item.unitPrice)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-[hsl(var(--color-text))]/90">{money(item.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[hsl(var(--color-border))] font-bold">
                    <td colSpan={3} className="pt-2 text-right text-[hsl(var(--color-text))]">รวม</td>
                    <td className="pt-2 text-right tabular-nums text-[hsl(var(--color-text))] font-bold">{money(inv.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex flex-col gap-4">
          {/* Delivery history */}
          {inv.deliveries && inv.deliveries.length > 0 && (
            <div className="rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40 mb-3">ประวัติการส่ง</h2>
              <div className="flex flex-col gap-2">
                {inv.deliveries.map(d => (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    {d.status === 'DELIVERED' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : d.status === 'FAILED' ? (
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-[hsl(var(--color-text))]/30 shrink-0" />
                    )}
                    <div className="flex-1">
                      <span className="text-[hsl(var(--color-text))]/70">{d.channel}</span>
                      <span className="ml-2 text-xs text-[hsl(var(--color-text))]/30">{fmtDateTime(d.sentAt)}</span>
                    </div>
                    <span className={`text-xs font-medium ${d.status === 'DELIVERED' ? 'text-emerald-400' : d.status === 'FAILED' ? 'text-red-400' : 'text-[hsl(var(--color-text))]/40'}`}>
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Record Payment */}
          {inv.status !== 'PAID' && (
            <RecordPaymentForm
              invoiceId={invoiceId}
              remainingAmount={Number(inv.totalAmount)}
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] }); }}
            />
          )}

          {inv.status === 'PAID' && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-semibold">รับชำระแล้ว</span>
              </div>
              {inv.paidAt && (
                <p className="mt-1 text-xs text-emerald-400/60">ชำระเมื่อ {fmtDate(inv.paidAt)}</p>
              )}
            </div>
          )}
        </div>
      </section>
      <ConfirmDialog
        open={sendConfirmOpen}
        title="ส่งใบแจ้งหนี้ LINE?"
        description="ระบบจะส่งใบแจ้งหนี้ไปยัง LINE ของผู้เช่า หากเชื่อมต่อไว้"
        confirmLabel="ส่งเลย"
        cancelLabel="ยกเลิก"
        onConfirm={() => { setSendConfirmOpen(false); void sendInvoice(); }}
        onCancel={() => setSendConfirmOpen(false)}
      />
      <ConfirmDialog
        open={regenerateConfirmOpen}
        title="สร้างใบแจ้งหนี้ใหม่?"
        description="ต้องการสร้างใบแจ้งหนี้ใหม่? ใบเดิมจะถูกยกเลิก กรุณาไปที่ บิล > รอบบิลที่เกี่ยวข้อง เพื่อสร้างใหม่"
        confirmLabel={regenerating ? 'กำลังยกเลิก...' : 'ยกเลิกใบเดิม'}
        cancelLabel="ยกเลิก"
        dangerous
        onConfirm={() => { setRegenerateConfirmOpen(false); void handleRegenerate(); }}
        onCancel={() => setRegenerateConfirmOpen(false)}
      />
    </main>
  );
}
