'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isLineConfigured } from '@/lib/line/is-configured';

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
    roomNumber: string;
    floor?: { name?: string } | null;
    tenants?: Array<{ tenant?: { firstName?: string; lastName?: string } | null }>;
  };
  roomBilling?: {
    rentAmount?: string | number;
    waterTotal?: string | number;
    waterUnits?: string | number;
    electricTotal?: string | number;
    electricUnits?: string | number;
    commonServiceFee?: string | number;
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

function invoiceBadgeClass(status: InvoiceStatus): string {
  switch (status) {
    case 'PAID': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'SENT': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'VIEWED': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case 'OVERDUE': return 'bg-red-100 text-red-700 border-red-200';
    case 'GENERATED': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'CANCELLED': return 'bg-slate-100 text-slate-500 border-slate-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

// ---------------------------------------------------------------------------
// Record Payment Form
// ---------------------------------------------------------------------------

function RecordPaymentForm({
  invoiceId,
  onSuccess,
}: {
  invoiceId: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // Guard against double submission
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          amount: parseFloat(amount),
          method,
          referenceNumber: reference || undefined,
        }),
      }).then(r => r.json());
      if (res.success) {
        setMessage(res.message || 'Payment recorded successfully');
        setAmount('');
        setReference('');
        onSuccess();
      } else {
        setError(res.error?.message || 'Failed to record payment');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="text-sm font-semibold text-emerald-800">Record Payment</h3>
      {message && <div className="auth-alert auth-alert-success text-sm">{message}</div>}
      {error && <div className="auth-alert auth-alert-error text-sm">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-600">Amount (THB)</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-outline bg-white px-3 py-2 text-sm"
            required
            min="1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Method</label>
          <select
            value={method}
            onChange={e => setMethod(e.target.value)}
            className="mt-1 w-full rounded-lg border border-outline bg-white px-3 py-2 text-sm"
          >
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="QR_PAYMENT">QR Payment</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-slate-600">Reference Number (optional)</label>
          <input
            type="text"
            value={reference}
            onChange={e => setReference(e.target.value)}
            className="mt-1 w-full rounded-lg border border-outline bg-white px-3 py-2 text-sm"
            placeholder="e.g. TMB-REF-001"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {submitting ? 'Recording...' : 'Record Payment'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params?.id as string;

  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { cache: 'no-store' });
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setInvoice(data.data as InvoiceResponse);
      } else {
        throw new Error(data.error?.message || 'Failed to load invoice');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load invoice');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        await load();
      } else {
        setSendMessage(res.error?.message || 'Failed to send invoice');
      }
    } catch {
      setSendMessage('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  // Loading
  if (loading) {
    return (
      <main className="space-y-6">
        <div className="py-16 text-center text-sm text-on-surface-variant">Loading invoice...</div>
      </main>
    );
  }

  // Not found
  if (notFound || (!loading && !invoice)) {
    return (
      <main className="space-y-6">
        <nav className="flex items-center gap-1.5 text-sm text-on-surface-variant">
          <Link href="/admin/invoices" className="hover:text-primary transition-colors">
            Invoices
          </Link>
          <span className="text-slate-400">/</span>
          <span className="font-medium text-on-surface">Not Found</span>
        </nav>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-outline-variant/10 bg-surface-container-lowest py-20 text-center">
          <AlertTriangle className="h-12 w-12 text-tertiary" />
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Invoice Not Found</h2>
            <p className="mt-1 text-sm text-slate-500">
              Invoice with ID <code className="font-mono text-xs">{invoiceId}</code> could not be found.
            </p>
          </div>
          <Link
            href="/admin/invoices"
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors mt-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Invoices
          </Link>
        </div>
      </main>
    );
  }

  const inv = invoice!;
  const period = thaiMonthYear(inv.year, inv.month);
  const roomNumber = inv.room?.roomNumber ?? inv.roomNo;
  const tenantName = inv.room?.tenants?.[0]?.tenant
    ? `${inv.room.tenants[0].tenant?.firstName ?? ''} ${inv.room.tenants[0].tenant?.lastName ?? ''}`.trim()
    : 'Unknown Tenant';
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
    if (Number(rb.furnitureFee) > 0) {
      lineItems.push({ id: 'furniture', description: 'ค่าเฟอร์นิเจอร์ (Furniture)', quantity: 1, unitPrice: Number(rb.furnitureFee), amount: Number(rb.furnitureFee) });
    }
    if (Number(rb.otherFee) > 0) {
      lineItems.push({ id: 'other', description: 'ค่าอื่นๆ (Other)', quantity: 1, unitPrice: Number(rb.otherFee), amount: Number(rb.otherFee) });
    }
  }

  const canSend = inv.status === 'GENERATED' || inv.status === 'VIEWED';

  return (
    <main className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-on-surface-variant">
        <Link href="/admin/invoices" className="hover:text-primary transition-colors">
          Invoices
        </Link>
        <span className="text-slate-400">/</span>
        <span className="font-medium text-on-surface">{inv.invoiceNumber}</span>
      </nav>

      {/* Page header */}
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/invoices"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm transition-colors hover:border-primary/30 hover:bg-surface-container"
          >
            <ArrowLeft className="h-4 w-4 text-on-primary" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-on-primary">{inv.invoiceNumber}</h1>
              <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${invoiceBadgeClass(inv.status)}`}>
                {inv.status}
              </span>
            </div>
            <p className="text-sm text-on-primary/80">
              {period} · Room {roomNumber} · {tenantName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {canSend && (
            <button
              onClick={() => { if (!isLineConfigured()) { setSendMessage('LINE ไม่ได้รับการตั้งค่า ไม่สามารถส่งได้'); return; } setSendConfirmOpen(true); }}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-100 disabled:opacity-60"
            >
              <MessageSquare className="h-4 w-4" />
              {sending ? 'Sending...' : 'Send via LINE'}
            </button>
          )}
          <Link
            href={`/api/invoices/${invoiceId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            View PDF
          </Link>
        </div>
        {sendMessage && (
          <div className={`mt-3 rounded-lg px-4 py-2 text-sm ${sendMessage.includes('sent') ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
            {sendMessage}
          </div>
        )}
      </section>

      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* Invoice details */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Left: details card */}
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-5 lg:col-span-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant mb-4">Invoice Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Room</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{roomNumber}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tenant</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{tenantName}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Billing Period</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{period}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Amount</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{money(inv.totalAmount)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Due Date</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{fmtDate(inv.dueDate)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Issued At</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{fmtDateTime(inv.issuedAt)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sent At</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{fmtDateTime(inv.sentAt)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Paid At</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{fmtDateTime(inv.paidAt)}</div>
            </div>
          </div>

          {/* Line items */}
          {lineItems.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Line Items</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="pb-2 text-left">Description</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Unit Price</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map(item => (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 text-slate-700">{item.description}</td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{item.quantity}</td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{money(item.unitPrice)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-slate-800">{money(item.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 font-bold">
                    <td colSpan={3} className="pt-2 text-right text-slate-800">Total</td>
                    <td className="pt-2 text-right tabular-nums text-slate-900">{money(inv.totalAmount)}</td>
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
            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Delivery History</h2>
              <div className="flex flex-col gap-2">
                {inv.deliveries.map(d => (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    {d.status === 'DELIVERED' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : d.status === 'FAILED' ? (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <div className="flex-1">
                      <span className="text-slate-700">{d.channel}</span>
                      <span className="ml-2 text-xs text-slate-400">{fmtDateTime(d.sentAt)}</span>
                    </div>
                    <span className={`text-xs font-medium ${d.status === 'DELIVERED' ? 'text-emerald-600' : d.status === 'FAILED' ? 'text-red-600' : 'text-slate-500'}`}>
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
              onSuccess={() => { void load(); }}
            />
          )}

          {inv.status === 'PAID' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-semibold">Payment Received</span>
              </div>
              {inv.paidAt && (
                <p className="mt-1 text-xs text-emerald-600">Paid on {fmtDate(inv.paidAt)}</p>
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
    </main>
  );
}
