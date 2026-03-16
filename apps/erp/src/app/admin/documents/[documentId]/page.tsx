'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Calendar, DollarSign, Download, FileText, Send, User } from 'lucide-react';

type InvoiceItem = {
  id: string;
  description: string;
  unitPrice: number;
  total: number;
  quantity: number;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  dueDate: string;
  createdAt: string;
  room?: {
    id: string;
    roomNumber: string;
    floor?: { floorNumber: number } | null;
  } | null;
  tenant?: {
    id: string;
    fullName: string;
    phone: string;
  } | null;
  tenantName?: string | null;
  lineUserId?: string | null;
  deliveries?: Array<{
    id: string;
    channel: string;
    status: string;
    recipientRef: string | null;
    sentAt: string | null;
    viewedAt: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
  items?: InvoiceItem[];
};

function statusBadgeClass(status: string): string {
  if (status === 'PAID') return 'admin-badge admin-status-good';
  if (status === 'OVERDUE') return 'admin-badge admin-status-bad';
  if (status === 'SENT' || status === 'VIEWED') return 'admin-badge admin-status-warn';
  return 'admin-badge';
}

export default function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/invoices/${documentId}`, { cache: 'no-store' }).then((r) => r.json());
        if (!res.success) throw new Error((res.error?.message as string | undefined) || 'Document not found');
        setInvoice(res.data as Invoice);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load document');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [documentId]);

  function handleDownloadPdf() {
    window.open(`/api/invoices/${documentId}/pdf`, '_blank');
  }

  async function handleSendLine() {
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${documentId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendToLine: true }),
      }).then((r) => r.json());
      if (!res.success) throw new Error((res.error?.message as string | undefined) || 'Unable to send document');
      setMessage('Document queued for LINE delivery');
      const refreshed = await fetch(`/api/invoices/${documentId}`, { cache: 'no-store' }).then((r) => r.json());
      if (refreshed.success) setInvoice(refreshed.data as Invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send document');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="admin-page">
        <div className="py-16 text-center text-slate-500">Loading document...</div>
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="admin-page">
        <div className="auth-alert auth-alert-error">{error ?? 'Document not found'}</div>
        <Link href="/admin/documents" className="admin-button mt-4">
          ← Documents
        </Link>
      </main>
    );
  }

  const totalFormatted = new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(invoice.totalAmount);
  const lineDeliveries = invoice.deliveries?.filter((delivery) => delivery.channel === 'LINE') ?? [];
  const latestLineDelivery = lineDeliveries[0] ?? null;

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/documents"
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Documents
          </Link>
          <span className="text-slate-300">/</span>
          <div>
            <h1 className="admin-page-title">{invoice.invoiceNumber}</h1>
            <p className="admin-page-subtitle">Invoice document detail</p>
          </div>
        </div>
        <div className="admin-toolbar">
          <button
            className="admin-button flex items-center gap-2"
            onClick={() => void handleSendLine()}
            disabled={sending || !invoice.lineUserId || invoice.status === 'PAID'}
            title={!invoice.lineUserId ? 'Tenant has no LINE account linked' : undefined}
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending...' : latestLineDelivery?.status === 'FAILED' ? 'Retry LINE' : invoice.lineUserId ? 'Send via LINE' : 'No LINE Linked'}
          </button>
          <button className="admin-button flex items-center gap-2" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4" />
            Download PDF
          </button>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-500" />
                Invoice Details
              </div>
              <span className={statusBadgeClass(invoice.status)}>{invoice.status}</span>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Invoice #</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{invoice.invoiceNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Amount</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{totalFormatted}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <Calendar className="h-3 w-3" /> Due Date
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {new Date(invoice.dueDate).toLocaleDateString('th-TH', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <Calendar className="h-3 w-3" /> Created
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {new Date(invoice.createdAt).toLocaleDateString('th-TH', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="admin-card overflow-hidden">
            <div className="admin-card-header">
              <div className="admin-card-title">Line Items</div>
            </div>
            {invoice.items && invoice.items.length > 0 ? (
              <div className="overflow-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td className="text-right">{item.quantity}</td>
                        <td className="text-right font-semibold">
                          {new Intl.NumberFormat('th-TH', {
                            style: 'currency',
                            currency: 'THB',
                            maximumFractionDigits: 0,
                          }).format(item.total ?? item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                      <td colSpan={2} className="text-right">
                        Total
                      </td>
                      <td className="text-right">{totalFormatted}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-sm text-slate-500">No line items recorded.</div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-slate-400" /> Room
              </div>
            </div>
            <div className="p-4">
              {invoice.room ? (
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-slate-900">{invoice.room.roomNumber}</div>
                  {invoice.room.floor && (
                    <div className="text-sm text-slate-500">Floor {invoice.room.floor.floorNumber}</div>
                  )}
                  <Link href={`/admin/rooms/${invoice.room.id}`} className="admin-button block w-full text-center text-xs">
                    View Room →
                  </Link>
                </div>
              ) : (
                <div className="text-sm text-slate-400">No room linked</div>
              )}
            </div>
          </section>

          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-1.5">
                <User className="h-4 w-4 text-slate-400" /> Tenant
              </div>
            </div>
            <div className="p-4">
              {invoice.tenant ? (
                <div className="space-y-2">
                  <div className="font-semibold text-slate-900">{invoice.tenant.fullName}</div>
                  <div className="text-sm text-slate-500">{invoice.tenant.phone}</div>
                  <div className="text-xs text-slate-400">LINE: {invoice.lineUserId ? 'Linked' : 'Not linked'}</div>
                  <Link href={`/admin/tenants/${invoice.tenant.id}`} className="admin-button block w-full text-center text-xs">
                    View Tenant →
                  </Link>
                </div>
              ) : (
                <div className="text-sm text-slate-400">{invoice.tenantName ?? 'No tenant linked'}</div>
              )}
            </div>
          </section>

          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-slate-400" /> LINE Delivery
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="text-sm text-slate-500">
                Recipient readiness: <span className="font-medium text-slate-800">{invoice.lineUserId ? 'Linked' : 'Missing LINE link'}</span>
              </div>
              {lineDeliveries.length === 0 ? (
                <div className="text-sm text-slate-400">No LINE delivery attempts recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {lineDeliveries.map((delivery) => (
                    <div key={delivery.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`admin-badge ${
                            delivery.status === 'SENT' || delivery.status === 'VIEWED'
                              ? 'admin-status-good'
                              : delivery.status === 'FAILED'
                              ? 'admin-status-bad'
                              : 'admin-status-warn'
                          }`}
                        >
                          {delivery.status}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(delivery.createdAt).toLocaleString('th-TH')}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">Recipient: {delivery.recipientRef ?? '—'}</div>
                      {delivery.sentAt ? (
                        <div className="mt-1 text-xs text-slate-500">
                          Sent: {new Date(delivery.sentAt).toLocaleString('th-TH')}
                        </div>
                      ) : null}
                      {delivery.errorMessage ? (
                        <div className="mt-2 rounded-xl bg-red-50 px-2.5 py-2 text-xs text-red-600">
                          {delivery.errorMessage}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-slate-400" /> Amount
              </div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-slate-900">{totalFormatted}</div>
              <span className={`mt-2 inline-flex ${statusBadgeClass(invoice.status)}`}>
                {invoice.status}
              </span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
