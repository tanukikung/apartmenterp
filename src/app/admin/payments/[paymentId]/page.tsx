'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  Hash,
  Link2,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { getPaymentInvoiceHref } from '../payment-detail-links';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatchType = 'FULL' | 'PARTIAL' | 'OVERPAY' | 'UNDERPAY';
type PaymentStatus = 'PENDING' | 'NEED_REVIEW' | 'AUTO_MATCHED' | 'CONFIRMED' | 'REJECTED';

type PaymentDetail = {
  id: string;
  amount: number;
  paymentDate: string;
  referenceNumber: string | null;
  bankAccount: string | null;
  status: PaymentStatus;
  matchType: MatchType | null;
  matchedAmount: number | null;
  invoiceId: string | null;
  createdAt: string;
  updatedAt: string;
  invoice?: {
    id: string;
    totalAmount: number;
    year: number;
    month: number;
    status: string;
    room?: { roomNumber?: string; roomNo?: string } | null;
  } | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function statusBadgeClass(status: PaymentStatus): string {
  switch (status) {
    case 'CONFIRMED':
    case 'AUTO_MATCHED':
      return 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700';
    case 'NEED_REVIEW':
    case 'PENDING':
      return 'inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700';
    case 'REJECTED':
      return 'inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600';
    default:
      return 'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600';
  }
}

function matchTypeBadgeClass(mt: MatchType | null): string {
  switch (mt) {
    case 'FULL':
      return 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700';
    case 'PARTIAL':
    case 'UNDERPAY':
      return 'inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700';
    case 'OVERPAY':
      return 'inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600';
    default:
      return 'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600';
  }
}

// ---------------------------------------------------------------------------
// Timeline events derived from payment fields
// ---------------------------------------------------------------------------

type TimelineEvent = {
  label: string;
  timestamp: string | null;
  icon: React.ReactNode;
  done: boolean;
};

function buildTimeline(p: PaymentDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      label: 'อัปโหลด/สร้างการชำระ',
      timestamp: p.createdAt,
      icon: <Upload className="h-4 w-4" />,
      done: true,
    },
    {
      label:
        p.status === 'AUTO_MATCHED'
          ? 'จับคู่อัตโนมัติกับใบแจ้งหนี้'
          : p.invoiceId
            ? 'จับคู่กับใบแจ้งหนี้'
            : 'รอจับคู่',
      timestamp: p.invoiceId ? p.updatedAt : null,
      icon: <Link2 className="h-4 w-4" />,
      done: !!p.invoiceId,
    },
    {
      label: 'ยืนยันแล้ว',
      timestamp: p.status === 'CONFIRMED' ? p.updatedAt : null,
      icon: <CheckCircle2 className="h-4 w-4" />,
      done: p.status === 'CONFIRMED',
    },
  ];
  return events;
}

// ---------------------------------------------------------------------------
// Info row component
// ---------------------------------------------------------------------------

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]/80 px-4 py-3">
      <span className="mt-0.5 shrink-0 text-[var(--on-surface-variant)]">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[var(--on-surface-variant)]">{label}</div>
        <div className="mt-0.5 text-sm font-medium text-[var(--on-surface)] break-all">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PaymentDetailPage() {
  const params = useParams<{ paymentId: string }>();
  const router = useRouter();
  const paymentId = params.paymentId;
  const queryClient = useQueryClient();

  const { data: paymentData, isLoading: loading, error } = useQuery<{ success: boolean; data: PaymentDetail }>({
    queryKey: ['payments', paymentId],
    queryFn: async () => {
      if (!paymentId) throw new Error('No payment ID');
      const res = await fetch(`/api/payments/${paymentId}`).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถโหลดการชำระ');
      return res;
    },
    enabled: !!paymentId,
  });

  const payment: PaymentDetail | null = paymentData?.data ?? null;
  const fetchError = error; // rename for clarity

  // ------ Loading state ------
  if (loading) {
    return (
      <main className="space-y-6">
        <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-[var(--on-primary)]">รายละเอียดการชำระเงิน</h1>
            <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">กำลังโหลดข้อมูลการชำระ...</p>
          </div>
        </div>
      </section>
      </main>
    );
  }

  // ------ Error state ------
  if (fetchError && !payment) {
    return (
      <main className="space-y-6">
        <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-[var(--on-primary)]">รายละเอียดการชำระเงิน</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </button>
          </div>
        </div>
      </section>
        <div className="auth-alert auth-alert-error">{fetchError instanceof Error ? fetchError.message : String(fetchError)}</div>
      </main>
    );
  }

  if (!payment) return null;

  const timeline = buildTimeline(payment);
  const isMatched = !!payment.invoiceId;

  return (
    <main className="space-y-6">
      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <nav className="mb-1 flex items-center gap-1.5 text-sm text-[var(--on-surface-variant)]">
        <Link href="/admin/payments" className="hover:text-[var(--on-surface)] transition-colors">
          การชำระ
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-[var(--on-surface)] truncate max-w-[200px]" title={payment.id}>
          {payment.id}
        </span>
      </nav>

      {/* ── Page header ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-[var(--on-primary)]">การชำระ {payment.id}</h1>
            <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">
              รับเมื่อ {fmtDay(payment.paymentDate)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => queryClient.invalidateQueries({ queryKey: ['payments', paymentId] })} className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]" disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              รีเฟรช
            </button>
            <button onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </button>
          </div>
        </div>
      </section>

      {/* ── Alerts ─────────────────────────────────────────────────────── */}
      {fetchError ? <div className="auth-alert auth-alert-error">{fetchError instanceof Error ? fetchError.message : String(fetchError)}</div> : null}

      {/* ── Hero card ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-container)] text-[var(--primary)]">
              <Banknote className="h-7 w-7" />
            </div>
            <div>
              <div className="text-3xl font-bold text-[var(--on-primary)] tabular-nums">
                {money(payment.amount)}
              </div>
              {payment.referenceNumber ? (
                <div className="mt-0.5 text-sm text-[var(--on-primary)]/80">
                  Ref: <span className="font-medium text-[var(--on-primary)]">{payment.referenceNumber}</span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={statusBadgeClass(payment.status)}>{payment.status}</span>
            {payment.matchType ? (
              <span className={matchTypeBadgeClass(payment.matchType)}>{payment.matchType}</span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Left column ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Info grid */}
          <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
            <div className="border-b border-[var(--outline-variant)] bg-[var(--surface-container)] px-4 py-3">
              <div className="text-sm font-semibold text-[var(--on-surface)]">รายละเอียดการชำระ</div>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <InfoRow
                icon={<Banknote className="h-4 w-4" />}
                label="จำนวน"
                value={money(payment.amount)}
              />
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="วันที่ชำระ"
                value={fmtDay(payment.paymentDate)}
              />
              <InfoRow
                icon={<CreditCard className="h-4 w-4" />}
                label="บัญชีธนาคาร"
                value={payment.bankAccount ?? 'ไม่ได้บันทึก'}
              />
              <InfoRow
                icon={<Hash className="h-4 w-4" />}
                label="หมายเลขอ้างอิง"
                value={payment.referenceNumber ?? '-'}
              />
              {payment.matchedAmount != null ? (
                <InfoRow
                  icon={<Banknote className="h-4 w-4" />}
                  label="จำนวนที่จับคู่"
                  value={money(payment.matchedAmount)}
                />
              ) : null}
              {payment.matchType ? (
                <InfoRow
                  icon={<Link2 className="h-4 w-4" />}
                  label="ประเภทการจับคู่"
                  value={
                    <span className={matchTypeBadgeClass(payment.matchType)}>
                      {payment.matchType}
                    </span>
                  }
                />
              ) : null}
              {payment.invoiceId ? (
                <InfoRow
                  icon={<FileText className="h-4 w-4" />}
                  label="ใบแจ้งหนี้ที่จับคู่"
                  value={
                    <Link
                      href={getPaymentInvoiceHref(payment.invoiceId)}
                      className="text-[var(--primary)] hover:underline"
                    >
                      {payment.invoiceId}
                    </Link>
                  }
                />
              ) : null}
            </div>
          </section>

          {/* Matched invoice card */}
          {isMatched && payment.invoice ? (
            <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--outline-variant)] bg-[var(--surface-container)] px-4 py-3">
                <div className="text-sm font-semibold text-[var(--on-surface)]">ใบแจ้งหนี้ที่จับคู่</div>
                <Link
                  href={getPaymentInvoiceHref(payment.invoice.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)] text-xs"
                >
                  เปิดใบแจ้งหนี้
                </Link>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <InfoRow
                  icon={<FileText className="h-4 w-4" />}
                  label="เลขใบแจ้งหนี้"
                  value={payment.invoice.id}
                />
                <InfoRow
                  icon={<Hash className="h-4 w-4" />}
                  label="ห้อง"
                  value={payment.invoice.room?.roomNumber ?? payment.invoice.room?.roomNo ?? '-'}
                />
                <InfoRow
                  icon={<Banknote className="h-4 w-4" />}
                  label="จำนวนใบแจ้งหนี้"
                  value={money(payment.invoice.totalAmount)}
                />
                <InfoRow
                  icon={<Calendar className="h-4 w-4" />}
                  label="งวด"
                  value={`${payment.invoice.year}-${String(payment.invoice.month).padStart(2, '0')}`}
                />
              </div>
            </section>
          ) : null}
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Timeline */}
          <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
            <div className="border-b border-[var(--outline-variant)] bg-[var(--surface-container)] px-4 py-3">
              <div className="text-sm font-semibold text-[var(--on-surface)]">ไทม์ไลน์</div>
            </div>
            <ol className="relative ml-4 mt-2 mb-4 border-l border-[var(--outline-variant)]">
              {timeline.map((event, i) => (
                <li key={i} className="mb-6 ml-5 last:mb-0">
                  <span
                    className={[
                      'absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white',
                      event.done
                        ? 'bg-[var(--primary-container)] text-[var(--primary)]'
                        : 'bg-[var(--surface-container)] text-[var(--on-surface-variant)]',
                    ].join(' ')}
                  >
                    {event.icon}
                  </span>
                  <div className="pl-1">
                    <p
                      className={[
                        'text-sm font-medium',
                        event.done ? 'text-[var(--on-surface)]' : 'text-[var(--on-surface-variant)]',
                      ].join(' ')}
                    >
                      {event.label}
                    </p>
                    {event.timestamp ? (
                      <time className="mt-0.5 block text-xs text-[var(--on-surface-variant)]">
                        {fmtDate(event.timestamp)}
                      </time>
                    ) : (
                      <span className="mt-0.5 block text-xs text-outline-variant">รอดำเนินการ</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Actions */}
          <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
            <div className="border-b border-[var(--outline-variant)] bg-[var(--surface-container)] px-4 py-3">
              <div className="text-sm font-semibold text-[var(--on-surface)]">การดำเนินการ</div>
            </div>
            <div className="flex flex-col gap-3 p-4">
              {isMatched && payment.invoice ? (
                <Link
                  href={getPaymentInvoiceHref(payment.invoice.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
                >
                  <FileText className="h-4 w-4" />
                  เปิดใบแจ้งหนี้
                </Link>
              ) : null}
              {!isMatched ? (
                <p className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-700">
                  การชำระเงินนี้ยังไม่ได้จับคู่กับใบแจ้งหนี้ใด ดำเนินการจับคู่ได้ที่หน้าตรวจสอบการชำระ
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
