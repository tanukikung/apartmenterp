'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ChevronRight,
  User,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  FileText,
  CreditCard,
  Activity,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Receipt,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type LineStatus = 'REGISTERED' | 'UNREGISTERED';

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  lineUserId: string | null;
  lineDisplayName: string | null;
  lineStatus: LineStatus;
  idCard: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  createdAt: string;
  roomTenants?: Array<{
    id: string;
    roomId: string;
    role: 'PRIMARY' | 'SECONDARY';
    moveInDate: string;
    moveOutDate: string | null;
    room?: { id: string; roomNumber: string } | null;
  }>;
};

type ContractStatus = 'ACTIVE' | 'TERMINATED' | 'EXPIRED';

type Contract = {
  id: string;
  roomNumber: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  deposit: number;
  status: ContractStatus;
  notes: string | null;
};

type InvoiceStatus = 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE';

type Invoice = {
  id: string;
  year: number;
  month: number;
  totalAmount: number;
  dueDate: string;
  status: InvoiceStatus;
  paidAt: string | null;
  room?: { roomNumber: string } | null;
};

type Payment = {
  id: string;
  amount: number;
  transactionDate: string;
  reference: string | null;
  description: string | null;
  status: string;
  invoice?: { id: string; room?: { roomNumber: string } | null } | null;
};

type ChatMessage = {
  id: string;
  direction: 'INCOMING' | 'OUTGOING';
  type: string;
  content: string;
  sentAt: string;
};

type Conversation = {
  id: string;
  lineUserId: string;
  messages?: ChatMessage[];
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  details?: unknown;
  createdAt: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function money(amount: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function maskIdCard(id: string | null) {
  if (!id) return '-';
  if (id.length <= 4) return id;
  return id.slice(0, 3) + '·'.repeat(id.length - 6) + id.slice(-3);
}

function truncateLineId(id: string | null) {
  if (!id) return '-';
  if (id.length <= 16) return id;
  return id.slice(0, 8) + '…' + id.slice(-6);
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function invoiceStatusClass(s: InvoiceStatus) {
  if (s === 'PAID') return 'admin-status-good';
  if (s === 'OVERDUE') return 'admin-status-bad';
  if (s === 'SENT' || s === 'VIEWED') return 'admin-status-warn';
  return '';
}

function contractStatusClass(s: ContractStatus) {
  if (s === 'ACTIVE') return 'admin-status-good';
  if (s === 'TERMINATED') return 'admin-status-bad';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-sm text-slate-800 break-all">{value || '-'}</span>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'contracts' | 'invoices' | 'payments' | 'chat' | 'activity';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'contracts', label: 'Contracts', icon: FileText },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'activity', label: 'Activity', icon: Activity },
];

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId ?? '';

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Tab-specific data
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState<string>('');

  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Quick stats
  const [stats, setStats] = useState({
    invoicesCount: 0,
    totalPaid: 0,
    outstanding: 0,
    openTickets: 0,
  });

  // ── Fetch tenant ────────────────────────────────────────────────────────────

  const loadTenant = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, { cache: 'no-store' }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to load tenant');
      setTenant(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tenant');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  // ── Load stats when tenant available ────────────────────────────────────────

  useEffect(() => {
    if (!tenant) return;
    async function loadStats() {
      try {
        const [invoiceRes, maintenanceRes] = await Promise.all([
          fetch(`/api/invoices?tenantId=${tenantId}&pageSize=100`, { cache: 'no-store' }).then((r) => r.json()),
          fetch(`/api/admin/maintenance?tenantId=${tenantId}&status=OPEN&pageSize=50`, { cache: 'no-store' }).then((r) => r.json()),
        ]);
        const invoiceRows: Invoice[] = invoiceRes.success ? (invoiceRes.data?.data ?? []) : [];
        const totalPaid = invoiceRows
          .filter((inv) => inv.status === 'PAID')
          .reduce((sum, inv) => sum + inv.totalAmount, 0);
        const outstanding = invoiceRows
          .filter((inv) => ['GENERATED', 'SENT', 'VIEWED', 'OVERDUE'].includes(inv.status))
          .reduce((sum, inv) => sum + inv.totalAmount, 0);
        const openTickets = maintenanceRes.success ? (maintenanceRes.data?.total ?? 0) : 0;
        setStats({
          invoicesCount: invoiceRows.length,
          totalPaid,
          outstanding,
          openTickets,
        });
      } catch {
        // stats are best-effort
      }
    }
    void loadStats();
  }, [tenant, tenantId]);

  // ── Tab lazy loaders ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== 'contracts') return;
    if (contracts.length) return;
    async function loadContracts() {
      setContractsLoading(true);
      try {
        // Derive contracts from roomTenants for now; real endpoint if available
        const res = await fetch(`/api/tenants/${tenantId}?include=contracts`, { cache: 'no-store' }).then((r) => r.json());
        if (res.success && res.data?.contracts) {
          setContracts(res.data.contracts as Contract[]);
        } else if (tenant?.roomTenants) {
          // Fallback: synthesise from roomTenants
          const derived: Contract[] = tenant.roomTenants.map((rt) => ({
            id: rt.id,
            roomNumber: rt.room?.roomNumber ?? rt.roomId,
            startDate: rt.moveInDate,
            endDate: rt.moveOutDate,
            monthlyRent: 0,
            deposit: 0,
            status: rt.moveOutDate ? 'TERMINATED' : 'ACTIVE',
            notes: null,
          }));
          setContracts(derived);
        }
      } catch {
        if (tenant?.roomTenants) {
          const derived: Contract[] = tenant.roomTenants.map((rt) => ({
            id: rt.id,
            roomNumber: rt.room?.roomNumber ?? rt.roomId,
            startDate: rt.moveInDate,
            endDate: rt.moveOutDate,
            monthlyRent: 0,
            deposit: 0,
            status: rt.moveOutDate ? 'TERMINATED' : 'ACTIVE',
            notes: null,
          }));
          setContracts(derived);
        }
      } finally {
        setContractsLoading(false);
      }
    }
    void loadContracts();
  }, [activeTab, contracts.length, tenant, tenantId]);

  useEffect(() => {
    if (activeTab !== 'invoices') return;
    if (invoices.length) return;
    async function loadInvoices() {
      setInvoicesLoading(true);
      try {
        const res = await fetch(`/api/invoices?tenantId=${tenantId}&pageSize=100`, { cache: 'no-store' }).then((r) => r.json());
        if (res.success) setInvoices(res.data?.data ?? []);
      } catch {
        // silently fail
      } finally {
        setInvoicesLoading(false);
      }
    }
    void loadInvoices();
  }, [activeTab, invoices.length, tenantId]);

  useEffect(() => {
    if (activeTab !== 'payments') return;
    if (payments.length) return;
    async function loadPayments() {
      setPaymentsLoading(true);
      try {
        const res = await fetch(`/api/payments/matched?tenantId=${tenantId}&limit=100`, { cache: 'no-store' }).then((r) => r.json());
        if (res.success) setPayments(res.data?.transactions ?? []);
      } catch {
        // silently fail
      } finally {
        setPaymentsLoading(false);
      }
    }
    void loadPayments();
  }, [activeTab, payments.length, tenantId]);

  useEffect(() => {
    if (activeTab !== 'chat') return;
    if (chatMessages.length) return;
    async function loadChat() {
      if (!tenant?.lineUserId) return;
      setChatLoading(true);
      try {
        const convRes = await fetch(`/api/conversations?lineUserId=${encodeURIComponent(tenant.lineUserId!)}&pageSize=5`, { cache: 'no-store' }).then((r) => r.json());
        const convList = convRes.success ? (convRes.data?.data ?? []) : [];
        const conv: Conversation | null = convList[0] ?? null;
        setConversation(conv);
        if (conv) {
          const msgRes = await fetch(`/api/conversations/${conv.id}/messages?limit=5`, { cache: 'no-store' }).then((r) => r.json());
          if (msgRes.success) {
            const items = Array.isArray(msgRes.data) ? msgRes.data : (msgRes.data?.items ?? []);
            setChatMessages(items.slice(-5));
          }
        }
      } catch {
        // silently fail
      } finally {
        setChatLoading(false);
      }
    }
    void loadChat();
  }, [activeTab, chatMessages.length, tenant]);

  useEffect(() => {
    if (activeTab !== 'activity') return;
    if (auditRows.length) return;
    async function loadAudit() {
      setAuditLoading(true);
      try {
        const res = await fetch(`/api/audit-logs?entityType=TENANT&entityId=${tenantId}&limit=50`, { cache: 'no-store' }).then((r) => r.json());
        if (res.success) setAuditRows(res.data?.rows ?? []);
      } catch {
        // silently fail
      } finally {
        setAuditLoading(false);
      }
    }
    void loadAudit();
  }, [activeTab, auditRows.length, tenantId]);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="admin-page">
        <div className="flex items-center justify-center py-24 text-slate-400">Loading tenant profile…</div>
      </main>
    );
  }

  if (error || !tenant) {
    return (
      <main className="admin-page">
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <div className="text-slate-600">{error ?? 'Tenant not found'}</div>
          <Link href="/admin/tenants" className="admin-button">
            Back to Tenants
          </Link>
        </div>
      </main>
    );
  }

  const initials = `${tenant.firstName[0] ?? ''}${tenant.lastName[0] ?? ''}`.toUpperCase();

  // Filtered invoices
  const filteredInvoices = invoiceFilter
    ? invoices.filter((inv) => inv.status === invoiceFilter)
    : invoices;

  return (
    <main className="admin-page">

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/admin/tenants" className="hover:text-slate-800 transition-colors">Tenants</Link>
        <ChevronRight size={14} className="shrink-0 text-slate-300" />
        <span className="font-medium text-slate-800">{tenant.fullName}</span>
      </nav>

      {/* ── Hero card ──────────────────────────────────────────────────────── */}
      <section className="admin-card">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-6">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-bold text-indigo-700 shadow-sm">
            {initials}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-slate-900">{tenant.fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              {tenant.phone && (
                <span className="flex items-center gap-1">
                  <Phone size={13} /> {tenant.phone}
                </span>
              )}
              {tenant.email && (
                <span className="flex items-center gap-1">
                  <Mail size={13} /> {tenant.email}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar size={13} /> Joined {fmtDate(tenant.createdAt)}
              </span>
            </div>
          </div>
          {/* LINE status badge */}
          <div className="shrink-0">
            <span className={`admin-badge ${tenant.lineStatus === 'REGISTERED' ? 'admin-status-good' : ''}`}>
              {tenant.lineStatus === 'REGISTERED' ? (
                <><CheckCircle size={11} className="mr-1" />LINE Registered</>
              ) : (
                <><AlertCircle size={11} className="mr-1" />LINE Unregistered</>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* ── Quick stats ────────────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="admin-kpi">
          <div className="admin-kpi-label">Invoices</div>
          <div className="admin-kpi-value">{stats.invoicesCount}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Total Paid</div>
          <div className="admin-kpi-value text-emerald-600">{money(stats.totalPaid)}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Outstanding</div>
          <div className={`admin-kpi-value ${stats.outstanding > 0 ? 'text-amber-600' : ''}`}>{money(stats.outstanding)}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Open Tickets</div>
          <div className={`admin-kpi-value ${stats.openTickets > 0 ? 'text-red-500' : ''}`}>{stats.openTickets}</div>
        </div>
      </section>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="admin-card overflow-visible">
        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-white">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="p-6">

          {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="grid gap-6 xl:grid-cols-2">
              {/* Personal info */}
              <div className="space-y-4">
                <h2 className="admin-card-title">Personal Information</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  <InfoRow label="First Name" value={tenant.firstName} />
                  <InfoRow label="Last Name" value={tenant.lastName} />
                  <InfoRow label="Phone" value={tenant.phone} />
                  <InfoRow label="Email" value={tenant.email} />
                  <InfoRow
                    label="LINE UID"
                    value={
                      tenant.lineUserId
                        ? <span title={tenant.lineUserId}>{truncateLineId(tenant.lineUserId)}</span>
                        : null
                    }
                  />
                  <InfoRow label="LINE Display Name" value={tenant.lineDisplayName} />
                  <InfoRow label="ID Card" value={maskIdCard(tenant.idCard)} />
                  <InfoRow label="Emergency Contact" value={tenant.emergencyContact} />
                  <InfoRow label="Emergency Phone" value={tenant.emergencyPhone} />
                  <InfoRow label="Member Since" value={fmtDate(tenant.createdAt)} />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-4">
                <h2 className="admin-card-title">Notes</h2>
                {tenant.notes ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {tenant.notes}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                    No notes recorded for this tenant.
                  </div>
                )}

                {/* Room assignments */}
                {tenant.roomTenants && tenant.roomTenants.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="admin-card-title">Room Assignments</h2>
                    {tenant.roomTenants.map((rt) => (
                      <div key={rt.id} className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-sm">
                        <div>
                          <div className="font-medium text-slate-900">Room {rt.room?.roomNumber ?? rt.roomId}</div>
                          <div className="text-slate-500">
                            {rt.role} · Move in {fmtDate(rt.moveInDate)}
                            {rt.moveOutDate ? ` · Move out ${fmtDate(rt.moveOutDate)}` : ''}
                          </div>
                        </div>
                        <span className={`admin-badge ${!rt.moveOutDate ? 'admin-status-good' : ''}`}>
                          {rt.moveOutDate ? 'Past' : 'Active'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CONTRACTS ──────────────────────────────────────────────────── */}
          {activeTab === 'contracts' && (
            <div className="space-y-3">
              <h2 className="admin-card-title">Contracts</h2>
              {contractsLoading ? (
                <div className="py-10 text-center text-slate-400">Loading contracts…</div>
              ) : contracts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                  No contracts found for this tenant.
                </div>
              ) : (
                <div className="space-y-2">
                  {contracts.map((contract) => {
                    const expanded = expandedContracts.has(contract.id);
                    return (
                      <div key={contract.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        {/* Row header */}
                        <button
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                          onClick={() =>
                            setExpandedContracts((prev) => {
                              const next = new Set(prev);
                              if (next.has(contract.id)) next.delete(contract.id);
                              else next.add(contract.id);
                              return next;
                            })
                          }
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                              <FileText size={15} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900">Room {contract.roomNumber}</div>
                              <div className="text-xs text-slate-500">
                                {fmtDate(contract.startDate)}
                                {contract.endDate ? ` → ${fmtDate(contract.endDate)}` : ' · ongoing'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {contract.monthlyRent > 0 && (
                              <span className="text-sm text-slate-600">{money(contract.monthlyRent)}/mo</span>
                            )}
                            <span className={`admin-badge ${contractStatusClass(contract.status)}`}>
                              {contract.status}
                            </span>
                            {expanded ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
                          </div>
                        </button>

                        {/* Expanded details */}
                        {expanded && (
                          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <InfoRow label="Start Date" value={fmtDate(contract.startDate)} />
                              <InfoRow label="End Date" value={contract.endDate ? fmtDate(contract.endDate) : 'Ongoing'} />
                              <InfoRow label="Status" value={contract.status} />
                              {contract.monthlyRent > 0 && (
                                <InfoRow label="Monthly Rent" value={money(contract.monthlyRent)} />
                              )}
                              {contract.deposit > 0 && (
                                <InfoRow label="Deposit" value={money(contract.deposit)} />
                              )}
                              {contract.notes && (
                                <div className="sm:col-span-3">
                                  <InfoRow label="Notes" value={contract.notes} />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── INVOICES ───────────────────────────────────────────────────── */}
          {activeTab === 'invoices' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="admin-card-title">Invoices</h2>
                <select
                  className="admin-select w-auto min-w-[160px]"
                  value={invoiceFilter}
                  onChange={(e) => setInvoiceFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="GENERATED">Generated</option>
                  <option value="SENT">Sent</option>
                  <option value="VIEWED">Viewed</option>
                  <option value="PAID">Paid</option>
                  <option value="OVERDUE">Overdue</option>
                </select>
              </div>

              {invoicesLoading ? (
                <div className="py-10 text-center text-slate-400">Loading invoices…</div>
              ) : filteredInvoices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                  No invoices found{invoiceFilter ? ` with status ${invoiceFilter}` : ''}.
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-slate-200">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Room</th>
                        <th>Period</th>
                        <th>Amount</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Paid At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id}>
                          <td>
                            <span className="font-mono text-xs text-slate-600">{inv.id.slice(0, 12)}…</span>
                          </td>
                          <td>{inv.room?.roomNumber ?? '-'}</td>
                          <td>{inv.year}-{String(inv.month).padStart(2, '0')}</td>
                          <td>{money(inv.totalAmount)}</td>
                          <td>{fmtDate(inv.dueDate)}</td>
                          <td>
                            <span className={`admin-badge ${invoiceStatusClass(inv.status)}`}>{inv.status}</span>
                          </td>
                          <td>{inv.paidAt ? fmtDate(inv.paidAt) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── PAYMENTS ───────────────────────────────────────────────────── */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              <h2 className="admin-card-title">Payment History</h2>
              {paymentsLoading ? (
                <div className="py-10 text-center text-slate-400">Loading payments…</div>
              ) : payments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                  No payment records found for this tenant.
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-slate-200">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th>Room</th>
                        <th>Invoice</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((pmt) => (
                        <tr key={pmt.id}>
                          <td>{fmtDate(pmt.transactionDate)}</td>
                          <td>{money(pmt.amount)}</td>
                          <td className="font-mono text-xs">{pmt.reference ?? pmt.description ?? '-'}</td>
                          <td>{pmt.invoice?.room?.roomNumber ?? '-'}</td>
                          <td className="font-mono text-xs">{pmt.invoice?.id ? pmt.invoice.id.slice(0, 10) + '…' : '-'}</td>
                          <td>
                            <span className={`admin-badge ${pmt.status === 'MATCHED' ? 'admin-status-good' : ''}`}>
                              {pmt.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── CHAT ───────────────────────────────────────────────────────── */}
          {activeTab === 'chat' && (
            <div className="space-y-4">
              <h2 className="admin-card-title">LINE Chat</h2>
              {!tenant.lineUserId ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                  <MessageSquare size={28} className="mx-auto mb-2 text-slate-300" />
                  This tenant has no linked LINE account. Link a LINE UID first to enable messaging.
                </div>
              ) : chatLoading ? (
                <div className="py-10 text-center text-slate-400">Loading messages…</div>
              ) : (
                <div className="space-y-4">
                  {/* Recent messages preview */}
                  {chatMessages.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
                        Recent Messages
                      </div>
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.direction === 'OUTGOING' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                              msg.direction === 'OUTGOING'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            <div className="break-words">{msg.content}</div>
                            <div className={`mt-1 text-[10px] ${msg.direction === 'OUTGOING' ? 'text-indigo-200' : 'text-slate-400'}`}>
                              {new Date(msg.sentAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                      No messages found in this conversation.
                    </div>
                  )}

                  {/* Open Chat button */}
                  {conversation && (
                    <div className="pt-2">
                      <Link
                        href={`/admin/chat?conversationId=${conversation.id}`}
                        className="admin-button admin-button-primary inline-flex items-center gap-2"
                      >
                        <ExternalLink size={14} />
                        Open Full Chat
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── ACTIVITY ───────────────────────────────────────────────────── */}
          {activeTab === 'activity' && (
            <div className="space-y-4">
              <h2 className="admin-card-title">Audit Activity</h2>
              {auditLoading ? (
                <div className="py-10 text-center text-slate-400">Loading activity…</div>
              ) : auditRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                  No audit activity recorded for this tenant.
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-slate-200">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Entity</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                          <td>{row.userName || row.userId}</td>
                          <td>
                            <span className="admin-badge">{row.action}</span>
                          </td>
                          <td className="font-mono text-xs text-slate-500">{row.entityType}:{row.entityId.slice(0, 8)}</td>
                          <td className="max-w-[300px] truncate text-xs text-slate-500">
                            {row.details ? JSON.stringify(row.details) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
