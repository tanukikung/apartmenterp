'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  Hash,
  Loader2,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Payment = {
  id: string;
  referenceNumber: string | null;
  amount: number;
  paymentDate: string;
  bankAccount: string | null;
  status: string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  roomId: string;
  room: { roomNumber: string } | null;
  totalAmount: number;
  dueDate: string | null;
  status: 'SENT' | 'OVERDUE';
  tenant?: { firstName?: string; lastName?: string } | null;
};

type MatchType = 'FULL' | 'PARTIAL' | 'OVERPAY' | 'UNDERPAY';

type MatchResult = {
  paymentId: string;
  invoiceId: string;
  paymentAmount: number;
  invoiceAmount: number;
  matchType: MatchType;
  difference: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function determineMatchType(paymentAmount: number, invoiceAmount: number): MatchType {
  const diff = paymentAmount - invoiceAmount;
  const tolerance = 0.01;
  if (Math.abs(diff) <= tolerance) return 'FULL';
  if (paymentAmount > invoiceAmount) return 'OVERPAY';
  return 'UNDERPAY';
}

function matchTypeConfig(mt: MatchType): {
  label: string;
  badgeCls: string;
  textCls: string;
  bgCls: string;
  borderCls: string;
} {
  switch (mt) {
    case 'FULL':
      return {
        label: 'FULL MATCH',
        badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        textCls: 'text-emerald-700',
        bgCls: 'bg-emerald-50',
        borderCls: 'border-emerald-200',
      };
    case 'PARTIAL':
    case 'UNDERPAY':
      return {
        label: mt === 'PARTIAL' ? 'PARTIAL' : 'UNDERPAY',
        badgeCls: 'bg-amber-100 text-amber-700 border-amber-200',
        textCls: 'text-amber-700',
        bgCls: 'bg-amber-50',
        borderCls: 'border-amber-200',
      };
    case 'OVERPAY':
      return {
        label: 'OVERPAY',
        badgeCls: 'bg-blue-100 text-blue-700 border-blue-200',
        textCls: 'text-blue-700',
        bgCls: 'bg-blue-50',
        borderCls: 'border-blue-200',
      };
  }
}

function amountCompareIndicator(
  paymentAmount: number,
  invoiceAmount: number,
): { icon: string; cls: string; title: string } {
  const diff = paymentAmount - invoiceAmount;
  const tolerance = 0.01;
  if (Math.abs(diff) <= tolerance) return { icon: '✓', cls: 'text-emerald-600 font-bold', title: 'Exact match' };
  if (diff > 0) return { icon: '↑', cls: 'text-blue-600 font-bold', title: `Overpay by ${money(diff)}` };
  return { icon: '≈', cls: 'text-amber-600 font-bold', title: `Short by ${money(Math.abs(diff))}` };
}

function invoiceStatusBadge(status: 'SENT' | 'OVERDUE'): string {
  if (status === 'OVERDUE') return 'bg-red-100 text-red-700 border border-red-200';
  return 'bg-blue-100 text-blue-700 border border-blue-200';
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function PanelHeader({
  title,
  count,
  loading,
  onRefresh,
}: {
  title: string;
  count: number;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
          {count}
        </span>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
        title="Refresh"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative px-3 py-2">
      <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      {value ? (
        <button
          onClick={() => onChange('')}
          className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
      <FileText className="h-8 w-8 opacity-40" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left panel — Unmatched Payments
// ---------------------------------------------------------------------------

function PaymentsPanel({
  payments,
  loading,
  selectedPaymentId,
  onSelect,
  onRefresh,
}: {
  payments: Payment[];
  loading: boolean;
  selectedPaymentId: string | null;
  onSelect: (p: Payment | null) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = payments.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.referenceNumber?.toLowerCase().includes(q) ||
      String(p.amount).includes(q) ||
      p.bankAccount?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <PanelHeader
        title="Payments to Match"
        count={payments.length}
        loading={loading}
        onRefresh={onRefresh}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search reference or amount..."
      />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingState message="Loading payments..." />
        ) : filtered.length === 0 ? (
          <EmptyState message={search ? 'No payments match your search.' : 'No unmatched payments.'} />
        ) : (
          <ul className="divide-y divide-slate-100 px-3 pb-3">
            {filtered.map((payment) => {
              const isSelected = payment.id === selectedPaymentId;
              return (
                <li key={payment.id}>
                  <button
                    onClick={() => onSelect(isSelected ? null : payment)}
                    className={[
                      'w-full rounded-lg border p-3 my-1.5 text-left transition-all',
                      isSelected
                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                        : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {payment.referenceNumber ?? 'No ref'}
                          </span>
                          <span className="shrink-0 inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            UNMATCHED
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {fmtDate(payment.paymentDate)}
                          </span>
                          {payment.bankAccount ? (
                            <span className="flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              {payment.bankAccount}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-slate-900 tabular-nums">
                          {money(payment.amount)}
                        </div>
                        <div className="mt-1 text-[10px] font-semibold text-indigo-600">
                          {isSelected ? 'SELECTED' : 'Select'}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Middle panel — Unmatched Invoices
// ---------------------------------------------------------------------------

type InvoiceFilter = 'ALL' | 'SENT' | 'OVERDUE';

function InvoicesPanel({
  invoices,
  loading,
  selectedPayment,
  onMatchRequest,
  onRefresh,
}: {
  invoices: Invoice[];
  loading: boolean;
  selectedPayment: Payment | null;
  onMatchRequest: (invoice: Invoice) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InvoiceFilter>('ALL');

  const filtered = invoices.filter((inv) => {
    if (filter !== 'ALL' && inv.status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.room?.roomNumber.toLowerCase().includes(q) ||
      inv.tenant?.firstName?.toLowerCase().includes(q) ||
      inv.tenant?.lastName?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <PanelHeader
        title="Open Invoices"
        count={invoices.length}
        loading={loading}
        onRefresh={onRefresh}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search room or invoice number..."
      />

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-slate-100 px-3 pb-2">
        {(['ALL', 'SENT', 'OVERDUE'] as InvoiceFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              'rounded-md px-2.5 py-1 text-[11px] font-semibold transition',
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
            ].join(' ')}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingState message="Loading invoices..." />
        ) : filtered.length === 0 ? (
          <EmptyState message={search ? 'No invoices match your search.' : 'No open invoices.'} />
        ) : (
          <ul className="divide-y divide-slate-100 px-3 pb-3">
            {filtered.map((invoice) => {
              const indicator = selectedPayment
                ? amountCompareIndicator(selectedPayment.amount, invoice.totalAmount)
                : null;

              const tenantName = invoice.tenant
                ? `${invoice.tenant.firstName ?? ''} ${invoice.tenant.lastName ?? ''}`.trim()
                : null;

              return (
                <li key={invoice.id}>
                  <div
                    className={[
                      'rounded-lg border p-3 my-1.5 transition-all',
                      selectedPayment
                        ? 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30'
                        : 'border-slate-100 bg-white',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {invoice.invoiceNumber}
                          </span>
                          <span
                            className={[
                              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                              invoiceStatusBadge(invoice.status),
                            ].join(' ')}
                          >
                            {invoice.status}
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            Room {invoice.room?.roomNumber ?? '-'}
                          </span>
                          {tenantName ? (
                            <span className="flex items-center gap-1 truncate">
                              {tenantName}
                            </span>
                          ) : null}
                          {invoice.dueDate ? (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due {fmtDate(invoice.dueDate)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {indicator ? (
                            <span
                              className={`text-sm ${indicator.cls}`}
                              title={indicator.title}
                            >
                              {indicator.icon}
                            </span>
                          ) : null}
                          <div className="text-sm font-bold text-slate-900 tabular-nums">
                            {money(invoice.totalAmount)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedPayment ? (
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => onMatchRequest(invoice)}
                          className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-700 active:scale-95"
                        >
                          <ArrowRight className="h-3 w-3" />
                          Match to Selected
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel — Match Preview / Confirm
// ---------------------------------------------------------------------------

type ConfirmState = 'idle' | 'confirming' | 'success' | 'error';

function MatchPreviewPanel({
  selectedPayment,
  selectedInvoice,
  matchedTodayCount,
  onConfirm,
  onClear,
  onMatchAnother,
}: {
  selectedPayment: Payment | null;
  selectedInvoice: Invoice | null;
  matchedTodayCount: number;
  onConfirm: () => Promise<MatchResult | null>;
  onClear: () => void;
  onMatchAnother: () => void;
}) {
  const [confirmState, setConfirmState] = useState<ConfirmState>('idle');
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset confirm state when selection changes
  useEffect(() => {
    if (confirmState === 'success') return;
    setConfirmState('idle');
    setErrorMsg(null);
  }, [selectedPayment?.id, selectedInvoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConfirm() {
    setConfirmState('confirming');
    setErrorMsg(null);
    const result = await onConfirm();
    if (result) {
      setLastResult(result);
      setConfirmState('success');
    } else {
      setConfirmState('error');
      setErrorMsg('Match failed. Please try again.');
    }
  }

  // Success state
  if (confirmState === 'success' && lastResult) {
    const cfg = matchTypeConfig(lastResult.matchType);
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">Match Confirmed</span>
          </div>
          <span className="inline-flex items-center rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            {matchedTodayCount} today
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="rounded-lg border border-emerald-200 bg-white p-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <Check className="h-5 w-5" />
              <span className="font-semibold">Match confirmed!</span>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Payment</span>
                <span className="font-medium tabular-nums">{money(lastResult.paymentAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Invoice</span>
                <span className="font-medium tabular-nums">{money(lastResult.invoiceAmount)}</span>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-between">
                <span className="text-slate-500">Difference</span>
                <span className={`font-semibold tabular-nums ${lastResult.difference === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {lastResult.difference === 0 ? 'None' : money(Math.abs(lastResult.difference))}
                </span>
              </div>
            </div>
            <div className="mt-3">
              <span
                className={[
                  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
                  cfg.badgeCls,
                ].join(' ')}
              >
                {cfg.label}
              </span>
            </div>
          </div>

          <button
            onClick={onMatchAnother}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-95"
          >
            Match Another
          </button>
        </div>
      </div>
    );
  }

  // Empty state — nothing selected
  if (!selectedPayment && !selectedInvoice) {
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <span className="text-sm font-semibold text-slate-800">Match Preview</span>
          <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            {matchedTodayCount} today
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <ArrowRight className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">
            Select a payment and invoice to preview match
          </p>
          <p className="text-xs text-slate-400">Press M to match selected pair</p>
        </div>
      </div>
    );
  }

  // Partial state — only one selected
  if (!selectedPayment || !selectedInvoice) {
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <span className="text-sm font-semibold text-slate-800">Match Preview</span>
          <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            {matchedTodayCount} today
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          {selectedPayment ? (
            <SelectedPaymentCard payment={selectedPayment} />
          ) : (
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
              No payment selected
            </div>
          )}
          <div className="flex justify-center">
            <ArrowRight className="h-5 w-5 text-slate-300" />
          </div>
          {selectedInvoice ? (
            <SelectedInvoiceCard invoice={selectedInvoice} />
          ) : (
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
              No invoice selected — click &ldquo;Match to Selected&rdquo; on an invoice
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full preview — both selected
  const matchType = determineMatchType(selectedPayment.amount, selectedInvoice.totalAmount);
  const cfg = matchTypeConfig(matchType);
  const difference = selectedPayment.amount - selectedInvoice.totalAmount;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">Match Preview</span>
        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
          {matchedTodayCount} today
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Match type badge */}
        <div className={['rounded-lg border p-3 text-center', cfg.bgCls, cfg.borderCls].join(' ')}>
          <span
            className={[
              'inline-flex items-center rounded-full border px-3 py-1 text-sm font-bold',
              cfg.badgeCls,
            ].join(' ')}
          >
            {cfg.label}
          </span>
        </div>

        {/* Payment summary */}
        <SelectedPaymentCard payment={selectedPayment} />

        <div className="flex items-center gap-2 text-slate-400">
          <div className="h-px flex-1 bg-slate-100" />
          <ArrowRight className="h-4 w-4 shrink-0" />
          <div className="h-px flex-1 bg-slate-100" />
        </div>

        {/* Invoice summary */}
        <SelectedInvoiceCard invoice={selectedInvoice} />

        {/* Amount comparison */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Payment amount</span>
              <span className="font-semibold tabular-nums">{money(selectedPayment.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Invoice amount</span>
              <span className="font-semibold tabular-nums">{money(selectedInvoice.totalAmount)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between">
              <span className="text-slate-500">Difference</span>
              <span
                className={[
                  'font-bold tabular-nums',
                  difference === 0
                    ? 'text-emerald-600'
                    : difference > 0
                      ? 'text-blue-600'
                      : 'text-amber-600',
                ].join(' ')}
              >
                {difference === 0
                  ? 'None'
                  : `${difference > 0 ? '+' : ''}${money(difference)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Error message */}
        {confirmState === 'error' && errorMsg ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorMsg}
          </div>
        ) : null}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => void handleConfirm()}
            disabled={confirmState === 'confirming'}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirmState === 'confirming' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Confirm Match
              </>
            )}
          </button>

          <button
            onClick={onClear}
            disabled={confirmState === 'confirming'}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Clear Selection
          </button>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          Keyboard: press <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[10px]">M</kbd> to confirm match
        </p>
      </div>
    </div>
  );
}

// Small card subcomponents for the preview panel
function SelectedPaymentCard({ payment }: { payment: Payment }) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-indigo-500">
        <Banknote className="h-3 w-3" />
        Payment
      </div>
      <div className="text-base font-bold text-slate-900 tabular-nums">
        {money(payment.amount)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        {payment.referenceNumber ? (
          <span className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            {payment.referenceNumber}
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {fmtDate(payment.paymentDate)}
        </span>
        {payment.bankAccount ? (
          <span className="flex items-center gap-1">
            <CreditCard className="h-3 w-3" />
            {payment.bankAccount}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SelectedInvoiceCard({ invoice }: { invoice: Invoice }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <FileText className="h-3 w-3" />
        Invoice
      </div>
      <div className="text-base font-bold text-slate-900 tabular-nums">
        {money(invoice.totalAmount)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Hash className="h-3 w-3" />
          {invoice.invoiceNumber}
        </span>
        <span className="flex items-center gap-1">
          <Building2 className="h-3 w-3" />
          Room {invoice.room?.roomNumber ?? '-'}
        </span>
        {invoice.dueDate ? (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Due {fmtDate(invoice.dueDate)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PaymentReviewMatchPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [matchedTodayCount, setMatchedTodayCount] = useState(0);

  // Keyboard shortcut ref to avoid stale closure
  const matchRef = useRef<(() => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    setPaymentsError(null);
    try {
      const res = await fetch('/api/payments?status=PENDING&pageSize=50');
      const json = await res.json();
      // Support both paginated { data: { data: [...] } } and flat { data: [...] } shapes
      const rows: Payment[] = Array.isArray(json.data) ? json.data : (json.data?.data ?? json.payments ?? []);
      setPayments(rows);
    } catch (err) {
      setPaymentsError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    setInvoicesError(null);
    try {
      // Fetch SENT and OVERDUE in parallel then merge
      const [sentRes, overdueRes] = await Promise.all([
        fetch('/api/invoices?status=SENT&pageSize=50').then((r) => r.json()),
        fetch('/api/invoices?status=OVERDUE&pageSize=50').then((r) => r.json()),
      ]);

      const sentRows: Invoice[] = Array.isArray(sentRes.data) ? sentRes.data : (sentRes.data?.data ?? sentRes.invoices ?? []);
      const overdueRows: Invoice[] = Array.isArray(overdueRes.data) ? overdueRes.data : (overdueRes.data?.data ?? overdueRes.invoices ?? []);

      // Deduplicate by id in case API returns both in one call
      const seen = new Set<string>();
      const merged: Invoice[] = [];
      for (const inv of [...sentRows, ...overdueRows]) {
        if (!seen.has(inv.id)) {
          seen.add(inv.id);
          merged.push(inv);
        }
      }

      setInvoices(merged);
    } catch (err) {
      setInvoicesError(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
    void loadInvoices();
  }, [loadPayments, loadInvoices]);

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  function handleSelectPayment(payment: Payment | null) {
    setSelectedPayment(payment);
    // Clear invoice selection when payment changes
    setSelectedInvoice(null);
  }

  function handleMatchRequest(invoice: Invoice) {
    setSelectedInvoice(invoice);
  }

  function handleClear() {
    setSelectedPayment(null);
    setSelectedInvoice(null);
  }

  function handleMatchAnother() {
    setSelectedPayment(null);
    setSelectedInvoice(null);
    // Reload both panels to get fresh data
    void loadPayments();
    void loadInvoices();
  }

  // ---------------------------------------------------------------------------
  // Confirm match
  // ---------------------------------------------------------------------------

  async function handleConfirm(): Promise<MatchResult | null> {
    if (!selectedPayment || !selectedInvoice) return null;
    try {
      const res = await fetch(`/api/payments/${selectedPayment.id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          confirmedBy: 'admin',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Server error ${res.status}`);
      }

      const matchType = determineMatchType(selectedPayment.amount, selectedInvoice.totalAmount);
      const result: MatchResult = {
        paymentId: selectedPayment.id,
        invoiceId: selectedInvoice.id,
        paymentAmount: selectedPayment.amount,
        invoiceAmount: selectedInvoice.totalAmount,
        matchType,
        difference: selectedPayment.amount - selectedInvoice.totalAmount,
      };

      setMatchedTodayCount((c) => c + 1);

      // Remove matched payment and invoice from lists
      setPayments((prev) => prev.filter((p) => p.id !== selectedPayment.id));
      setInvoices((prev) => prev.filter((i) => i.id !== selectedInvoice.id));

      return result;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcut: M = confirm match
  // ---------------------------------------------------------------------------

  // Keep a stable ref to the trigger function
  useEffect(() => {
    matchRef.current = () => {
      if (selectedPayment && selectedInvoice) {
        void handleConfirm();
      }
    };
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'm' || e.key === 'M') {
        matchRef.current?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Page header */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Payment Match Workstation</h1>
          <p className="admin-page-subtitle">
            Manually match bank payments to open invoices. Select a payment, then click{' '}
            <span className="font-medium text-slate-700">&ldquo;Match to Selected&rdquo;</span> on an invoice.
          </p>
        </div>
        <div className="admin-toolbar">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {matchedTodayCount} matched today
          </span>
          <button
            onClick={() => {
              void loadPayments();
              void loadInvoices();
            }}
            className="admin-button"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh All
          </button>
        </div>
      </section>

      {/* Error banners */}
      {paymentsError ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Payments: {paymentsError}</span>
        </div>
      ) : null}
      {invoicesError ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Invoices: {invoicesError}</span>
        </div>
      ) : null}

      {/* 3-column workstation grid */}
      <div className="grid min-h-[600px] gap-4 xl:grid-cols-3">
        {/* Left — Payments */}
        <PaymentsPanel
          payments={payments}
          loading={paymentsLoading}
          selectedPaymentId={selectedPayment?.id ?? null}
          onSelect={handleSelectPayment}
          onRefresh={() => void loadPayments()}
        />

        {/* Middle — Invoices */}
        <InvoicesPanel
          invoices={invoices}
          loading={invoicesLoading}
          selectedPayment={selectedPayment}
          onMatchRequest={handleMatchRequest}
          onRefresh={() => void loadInvoices()}
        />

        {/* Right — Preview / Confirm */}
        <MatchPreviewPanel
          selectedPayment={selectedPayment}
          selectedInvoice={selectedInvoice}
          matchedTodayCount={matchedTodayCount}
          onConfirm={handleConfirm}
          onClear={handleClear}
          onMatchAnother={handleMatchAnother}
        />
      </div>
    </main>
  );
}
