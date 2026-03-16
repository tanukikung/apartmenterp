'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  Hash,
  Link2,
  Link2Off,
  RefreshCw,
  Upload,
} from 'lucide-react';

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
    room?: { roomNumber: string } | null;
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
      return 'admin-badge admin-status-good';
    case 'NEED_REVIEW':
    case 'PENDING':
      return 'admin-badge admin-status-warn';
    case 'REJECTED':
      return 'admin-badge admin-status-bad';
    default:
      return 'admin-badge';
  }
}

function matchTypeBadgeClass(mt: MatchType | null): string {
  switch (mt) {
    case 'FULL':
      return 'admin-badge admin-status-good';
    case 'PARTIAL':
    case 'UNDERPAY':
      return 'admin-badge admin-status-warn';
    case 'OVERPAY':
      return 'admin-badge admin-status-bad';
    default:
      return 'admin-badge';
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
      label: 'Payment uploaded / created',
      timestamp: p.createdAt,
      icon: <Upload className="h-4 w-4" />,
      done: true,
    },
    {
      label:
        p.status === 'AUTO_MATCHED'
          ? 'Auto-matched to invoice'
          : p.invoiceId
            ? 'Matched to invoice'
            : 'Matching pending',
      timestamp: p.invoiceId ? p.updatedAt : null,
      icon: <Link2 className="h-4 w-4" />,
      done: !!p.invoiceId,
    },
    {
      label: 'Confirmed',
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
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.07em] text-slate-400">{label}</div>
        <div className="mt-0.5 text-sm font-medium text-slate-800 break-all">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PaymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const paymentId = params?.paymentId as string;

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unmatching, setUnmatching] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${paymentId}`).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to load payment');
      setPayment(res.data as PaymentDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payment');
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUnmatch() {
    if (!payment) return;
    setUnmatching(true);
    setActionMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${payment.id}/unmatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to unmatch payment');
      setActionMessage('Payment unmatched successfully.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unmatch payment');
    } finally {
      setUnmatching(false);
    }
  }

  // ------ Loading state ------
  if (loading) {
    return (
      <main className="admin-page">
        <section className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Payment Detail</h1>
            <p className="admin-page-subtitle">Loading payment data...</p>
          </div>
        </section>
      </main>
    );
  }

  // ------ Error state ------
  if (error && !payment) {
    return (
      <main className="admin-page">
        <section className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Payment Detail</h1>
          </div>
          <div className="admin-toolbar">
            <button onClick={() => router.back()} className="admin-button">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        </section>
        <div className="auth-alert auth-alert-error">{error}</div>
      </main>
    );
  }

  if (!payment) return null;

  const timeline = buildTimeline(payment);
  const isMatched = !!payment.invoiceId;

  return (
    <main className="admin-page">
      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <nav className="mb-1 flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/admin/payments" className="hover:text-slate-800 transition-colors">
          Payments
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-slate-700 truncate max-w-[200px]" title={payment.id}>
          {payment.id}
        </span>
      </nav>

      {/* ── Page header ────────────────────────────────────────────────── */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Payment {payment.id}</h1>
          <p className="admin-page-subtitle">
            Received on {fmtDay(payment.paymentDate)}
          </p>
        </div>
        <div className="admin-toolbar">
          <button onClick={() => void load()} className="admin-button" disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button onClick={() => router.back()} className="admin-button">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </section>

      {/* ── Alerts ─────────────────────────────────────────────────────── */}
      {actionMessage ? (
        <div className="auth-alert auth-alert-success">{actionMessage}</div>
      ) : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {/* ── Hero card ──────────────────────────────────────────────────── */}
      <section className="admin-card cute-surface px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Banknote className="h-7 w-7" />
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900 tabular-nums">
                {money(payment.amount)}
              </div>
              {payment.referenceNumber ? (
                <div className="mt-0.5 text-sm text-slate-500">
                  Ref: <span className="font-medium text-slate-700">{payment.referenceNumber}</span>
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
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Payment Details</div>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <InfoRow
                icon={<Banknote className="h-4 w-4" />}
                label="Amount"
                value={money(payment.amount)}
              />
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Payment Date"
                value={fmtDay(payment.paymentDate)}
              />
              <InfoRow
                icon={<CreditCard className="h-4 w-4" />}
                label="Bank Account"
                value={payment.bankAccount ?? 'Not recorded'}
              />
              <InfoRow
                icon={<Hash className="h-4 w-4" />}
                label="Reference Number"
                value={payment.referenceNumber ?? 'None'}
              />
              {payment.matchedAmount != null ? (
                <InfoRow
                  icon={<Banknote className="h-4 w-4" />}
                  label="Matched Amount"
                  value={money(payment.matchedAmount)}
                />
              ) : null}
              {payment.matchType ? (
                <InfoRow
                  icon={<Link2 className="h-4 w-4" />}
                  label="Match Type"
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
                  label="Matched Invoice"
                  value={
                    <Link
                      href={`/admin/invoices/${payment.invoiceId}`}
                      className="text-indigo-600 hover:underline"
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
            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Matched Invoice</div>
                <Link
                  href={`/admin/invoices/${payment.invoice.id}`}
                  className="admin-button text-xs"
                >
                  View Invoice
                </Link>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <InfoRow
                  icon={<FileText className="h-4 w-4" />}
                  label="Invoice Number"
                  value={payment.invoice.id}
                />
                <InfoRow
                  icon={<Hash className="h-4 w-4" />}
                  label="Room"
                  value={payment.invoice.room?.roomNumber ?? '-'}
                />
                <InfoRow
                  icon={<Banknote className="h-4 w-4" />}
                  label="Invoice Amount"
                  value={money(payment.invoice.totalAmount)}
                />
                <InfoRow
                  icon={<Calendar className="h-4 w-4" />}
                  label="Period"
                  value={`${payment.invoice.year}-${String(payment.invoice.month).padStart(2, '0')}`}
                />
              </div>
            </section>
          ) : null}
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Timeline */}
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Timeline</div>
            </div>
            <ol className="relative ml-4 mt-2 mb-4 border-l border-slate-200">
              {timeline.map((event, i) => (
                <li key={i} className="mb-6 ml-5 last:mb-0">
                  <span
                    className={[
                      'absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white',
                      event.done
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-slate-100 text-slate-400',
                    ].join(' ')}
                  >
                    {event.icon}
                  </span>
                  <div className="pl-1">
                    <p
                      className={[
                        'text-sm font-medium',
                        event.done ? 'text-slate-800' : 'text-slate-400',
                      ].join(' ')}
                    >
                      {event.label}
                    </p>
                    {event.timestamp ? (
                      <time className="mt-0.5 block text-xs text-slate-400">
                        {fmtDate(event.timestamp)}
                      </time>
                    ) : (
                      <span className="mt-0.5 block text-xs text-slate-300">Pending</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Actions */}
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Actions</div>
            </div>
            <div className="flex flex-col gap-3 p-4">
              {isMatched && payment.invoice ? (
                <Link
                  href={`/admin/invoices/${payment.invoice.id}`}
                  className="admin-button admin-button-primary flex items-center justify-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  View Invoice
                </Link>
              ) : null}
              {isMatched ? (
                <button
                  onClick={() => void handleUnmatch()}
                  disabled={unmatching}
                  className="admin-button flex items-center justify-center gap-2 border-red-200 text-red-600 hover:bg-red-50"
                >
                  <Link2Off className="h-4 w-4" />
                  {unmatching ? 'Unmatching...' : 'Unmatch Payment'}
                </button>
              ) : null}
              {!isMatched ? (
                <p className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-700">
                  This payment has not been matched to any invoice. Use the Payment Review queue to
                  assign it.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
