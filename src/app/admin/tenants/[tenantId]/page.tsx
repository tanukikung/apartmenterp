'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
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

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  lineUserId: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  createdAt: string;
  roomTenants?: Array<{
    id: string;
    roomNo: string;
    role: 'PRIMARY' | 'SECONDARY';
    moveInDate: string;
    moveOutDate: string | null;
    room?: { roomNo: string } | null;
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
};

type InvoiceStatus = 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE';

type Invoice = {
  id: string;
  year: number;
  month: number;
  totalAmount: number;
  dueDate: string;
  status: InvoiceStatus;
  paidAt: string | null;
  room?: { roomNumber?: string; roomNo?: string } | null;
};

type Payment = {
  id: string;
  amount: number;
  transactionDate: string;
  reference: string | null;
  description: string | null;
  status: string;
  invoice?: { id: string; room?: { roomNumber?: string; roomNo?: string } | null } | null;
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
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function truncateLineId(id: string | null) {
  if (!id) return '-';
  if (id.length <= 16) return id;
  return id.slice(0, 8) + '…' + id.slice(-6);
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function invoiceStatusClass(s: InvoiceStatus) {
  if (s === 'PAID') return 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700';
  if (s === 'OVERDUE') return 'inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600';
  if (s === 'SENT' || s === 'VIEWED') return 'inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700';
  return '';
}

function contractStatusClass(s: ContractStatus) {
  if (s === 'ACTIVE') return 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700';
  if (s === 'TERMINATED') return 'inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600';
  return 'inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest border border-outline-variant px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-outline-variant bg-surface-container-lowest/80 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{label}</span>
      <span className="text-sm text-on-surface break-all">{value || '-'}</span>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'contracts' | 'invoices' | 'payments' | 'chat' | 'activity';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'ภาพรวม', icon: User },
  { id: 'contracts', label: 'สัญญา', icon: FileText },
  { id: 'invoices', label: 'ใบแจ้งหนี้', icon: Receipt },
  { id: 'payments', label: 'การชำระ', icon: CreditCard },
  { id: 'chat', label: 'แชท', icon: MessageSquare },
  { id: 'activity', label: 'กิจกรรม', icon: Activity },
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
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถโหลดผู้เช่า');
      setTenant(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดผู้เช่า');
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
            roomNumber: rt.room?.roomNo ?? rt.roomNo,
            startDate: rt.moveInDate,
            endDate: rt.moveOutDate,
            monthlyRent: 0,
            deposit: 0,
            status: rt.moveOutDate ? 'TERMINATED' : 'ACTIVE',
          }));
          setContracts(derived);
        }
      } catch {
        if (tenant?.roomTenants) {
          const derived: Contract[] = tenant.roomTenants.map((rt) => ({
            id: rt.id,
            roomNumber: rt.room?.roomNo ?? rt.roomNo,
            startDate: rt.moveInDate,
            endDate: rt.moveOutDate,
            monthlyRent: 0,
            deposit: 0,
            status: rt.moveOutDate ? 'TERMINATED' : 'ACTIVE',
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
      <main className="space-y-6">
        <div className="flex items-center justify-center py-24 text-on-surface-variant">กำลังโหลดโปรไฟล์ผู้เช่า…</div>
      </main>
    );
  }

  if (error || !tenant) {
    return (
      <main className="space-y-6">
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <div className="text-on-surface-variant">{error ?? 'Tenant not found'}</div>
          <Link href="/admin/tenants" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
            Back to Tenants
          </Link>
        </div>
      </main>
    );
  }

  const initials = `${tenant.firstName?.[0] ?? ''}${tenant.lastName?.[0] ?? ''}`.toUpperCase();

  // Filtered invoices
  const filteredInvoices = invoiceFilter
    ? invoices.filter((inv) => inv.status === invoiceFilter)
    : invoices;

  return (
    <main className="space-y-6">

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-sm text-on-surface-variant">
        <Link href="/admin/tenants" className="hover:text-on-surface transition-colors">ผู้เช่า</Link>
        <ChevronRight size={14} className="shrink-0 text-outline-variant" />
        <span className="font-medium text-on-surface">{tenant.fullName}</span>
      </nav>

      {/* ── Hero card ──────────────────────────────────────────────────────── */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-6">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-container text-xl font-bold text-primary shadow-sm">
            {initials}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-on-surface">{tenant.fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-on-surface-variant">
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
                <Calendar size={13} /> เข้าร่วม {fmtDate(tenant.createdAt)}
              </span>
            </div>
          </div>
          {/* LINE status badge */}
          <div className="shrink-0">
            <span className={` ${tenant.lineUserId ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700' : ''}`}>
              {tenant.lineUserId ? (
                <><CheckCircle size={11} className="mr-1" />LINE ลงทะเบียนแล้ว</>
              ) : (
                <><AlertCircle size={11} className="mr-1" />ยังไม่ลงทะเบียน LINE</>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* ── Quick stats ────────────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">ใบแจ้งหนี้</div>
          <div className="text-xl font-semibold text-on-surface">{stats.invoicesCount}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">ชำระแล้ว</div>
          <div className="text-xl font-semibold text-emerald-600">{money(stats.totalPaid)}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">ค้างชำระ</div>
          <div className={`text-xl font-semibold ${stats.outstanding > 0 ? 'text-amber-600' : 'text-on-surface'}`}>{money(stats.outstanding)}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">งานเปิด</div>
          <div className={`text-xl font-semibold ${stats.openTickets > 0 ? 'text-red-500' : 'text-on-surface'}`}>{stats.openTickets}</div>
        </div>
      </section>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-visible">
        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-outline-variant bg-surface-container-lowest">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
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
                <h2 className="text-base font-semibold text-on-surface">ข้อมูลส่วนตัว</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  <InfoRow label="ชื่อ" value={tenant.firstName} />
                  <InfoRow label="นามสกุล" value={tenant.lastName} />
                  <InfoRow label="โทรศัพท์" value={tenant.phone} />
                  <InfoRow label="อีเมล" value={tenant.email} />
                  <InfoRow
                    label="LINE UID"
                    value={
                      tenant.lineUserId
                        ? <span title={tenant.lineUserId}>{truncateLineId(tenant.lineUserId)}</span>
                        : null
                    }
                  />
                  <InfoRow label="ติดต่อฉุกเฉิน" value={tenant.emergencyContact} />
                  <InfoRow label="โทรศัพท์ฉุกเฉิน" value={tenant.emergencyPhone} />
                  <InfoRow label="สมาชิกตั้งแต่" value={fmtDate(tenant.createdAt)} />
                </div>
              </div>

              {/* Room assignments */}
              {tenant.roomTenants && tenant.roomTenants.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-on-surface">ห้องที่ลงทะเบียน</h2>
                  {tenant.roomTenants.map((rt) => (
                    <div key={rt.id} className="flex items-center justify-between rounded-lg border border-primary-container bg-primary-container/50 px-4 py-3 text-sm">
                      <div>
                        <div className="font-medium text-on-surface">ห้อง {rt.room?.roomNo ?? rt.roomNo}</div>
                        <div className="text-on-surface-variant">
                          {rt.role} · เข้าอยู่ {fmtDate(rt.moveInDate)}
                          {rt.moveOutDate ? ` · ย้ายออก ${fmtDate(rt.moveOutDate)}` : ''}
                        </div>
                      </div>
                      <span className={` ${!rt.moveOutDate ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700' : ''}`}>
                        {rt.moveOutDate ? 'สิ้นสุด' : 'ใช้งานอยู่'}
                      </span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* ── CONTRACTS ──────────────────────────────────────────────────── */}
          {activeTab === 'contracts' && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-on-surface">สัญญา</h2>
              {contractsLoading ? (
                <div className="py-10 text-center text-on-surface-variant">กำลังโหลดสัญญา...</div>
              ) : contracts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
                  ไม่พบสัญญาสำหรับผู้เช่ารายนี้
                </div>
              ) : (
                <div className="space-y-2">
                  {contracts.map((contract) => {
                    const expanded = expandedContracts.has(contract.id);
                    return (
                      <div key={contract.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm overflow-hidden">
                        {/* Row header */}
                        <button
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-surface-container-lowest transition-colors"
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
                            <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-lowest text-on-surface-variant">
                              <FileText size={15} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-on-surface">ห้อง {contract.roomNumber}</div>
                              <div className="text-xs text-on-surface-variant">
                                {fmtDate(contract.startDate)}
                                {contract.endDate ? ` → ${fmtDate(contract.endDate)}` : ' · ดำเนินอยู่'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {contract.monthlyRent > 0 && (
                              <span className="text-sm text-on-surface-variant">{money(contract.monthlyRent)}/mo</span>
                            )}
                            <span className={` ${contractStatusClass(contract.status)}`}>
                              {contract.status}
                            </span>
                            {expanded ? <ChevronUp size={15} className="text-on-surface-variant" /> : <ChevronDown size={15} className="text-on-surface-variant" />}
                          </div>
                        </button>

                        {/* Expanded details */}
                        {expanded && (
                          <div className="border-t border-outline-variant bg-surface-container-lowest/60 px-5 py-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <InfoRow label="วันเริ่มต้น" value={fmtDate(contract.startDate)} />
                              <InfoRow label="วันสิ้นสุด" value={contract.endDate ? fmtDate(contract.endDate) : 'ดำเนินอยู่'} />
                              <InfoRow label="Status" value={contract.status} />
                              {contract.monthlyRent > 0 && (
                                <InfoRow label="ค่าเช่ารายเดือน" value={money(contract.monthlyRent)} />
                              )}
                              {contract.deposit > 0 && (
                                <InfoRow label="เงินประกัน" value={money(contract.deposit)} />
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
                <h2 className="text-base font-semibold text-on-surface">ใบแจ้งหนี้</h2>
                <select
                  className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface w-auto min-w-[160px]"
                  value={invoiceFilter}
                  onChange={(e) => setInvoiceFilter(e.target.value)}
                >
                  <option value="">ทุกสถานะ</option>
                  <option value="DRAFT">ร่าง</option>
                  <option value="GENERATED">สร้างแล้ว</option>
                  <option value="SENT">ส่งแล้ว</option>
                  <option value="VIEWED">เปิดแล้ว</option>
                  <option value="PAID">ชำระแล้ว</option>
                  <option value="OVERDUE">เกินกำหนด</option>
                </select>
              </div>

              {invoicesLoading ? (
                <div className="py-10 text-center text-on-surface-variant">กำลังโหลดใบแจ้งหนี้...</div>
              ) : filteredInvoices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
                  ไม่พบใบแจ้งหนี้{invoiceFilter ? ` สถานะ ${invoiceFilter}` : ''}
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-outline-variant">
                  <table className="w-full text-sm [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-on-surface-variant [&_th]:uppercase [&_th]:tracking-wider [&_th]:pb-3 [&_td]:text-on-surface [&_td]:py-3">
                    <thead>
                      <tr>
                        <th>เลขใบแจ้งหนี้</th>
                        <th>ห้อง</th>
                        <th>งวด</th>
                        <th>จำนวน</th>
                        <th>วันครบกำหนด</th>
                        <th>สถานะ</th>
                        <th>ชำระเมื่อ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id}>
                          <td>
                            <span className="font-mono text-xs text-on-surface-variant">{inv.id.slice(0, 12)}…</span>
                          </td>
                          <td>{inv.room?.roomNumber ?? inv.room?.roomNo ?? '-'}</td>
                          <td>{inv.year}-{String(inv.month).padStart(2, '0')}</td>
                          <td>{money(inv.totalAmount)}</td>
                          <td>{fmtDate(inv.dueDate)}</td>
                          <td>
                            <span className={` ${invoiceStatusClass(inv.status)}`}>{inv.status}</span>
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
              <h2 className="text-base font-semibold text-on-surface">ประวัติการชำระ</h2>
              {paymentsLoading ? (
                <div className="py-10 text-center text-on-surface-variant">กำลังโหลดการชำระ...</div>
              ) : payments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
                  ไม่พบรายการชำระสำหรับผู้เช่ารายนี้
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-outline-variant">
                  <table className="w-full text-sm [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-on-surface-variant [&_th]:uppercase [&_th]:tracking-wider [&_th]:pb-3 [&_td]:text-on-surface [&_td]:py-3">
                    <thead>
                      <tr>
                        <th>วันที่</th>
                        <th>จำนวน</th>
                        <th>อ้างอิง</th>
                        <th>ห้อง</th>
                        <th>ใบแจ้งหนี้</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((pmt) => (
                        <tr key={pmt.id}>
                          <td>{fmtDate(pmt.transactionDate)}</td>
                          <td>{money(pmt.amount)}</td>
                          <td className="font-mono text-xs">{pmt.reference ?? pmt.description ?? '-'}</td>
                          <td>{pmt.invoice?.room?.roomNumber ?? pmt.invoice?.room?.roomNo ?? '-'}</td>
                          <td className="font-mono text-xs">{pmt.invoice?.id ? pmt.invoice.id.slice(0, 10) + '…' : '-'}</td>
                          <td>
                            <span className={` ${pmt.status === 'MATCHED' ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700' : ''}`}>
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
              <h2 className="text-base font-semibold text-on-surface">แชท LINE</h2>
              {!tenant.lineUserId ? (
                <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
                  <MessageSquare size={28} className="mx-auto mb-2 text-outline-variant" />
                  ผู้เช่ารายนี้ยังไม่ได้ลิงก์บัญชี LINE กรุณาลิงก์ LINE UID ก่อนเพื่อส่งข้อความ
                </div>
              ) : chatLoading ? (
                <div className="py-10 text-center text-on-surface-variant">กำลังโหลดข้อความ...</div>
              ) : (
                <div className="space-y-4">
                  {/* Recent messages preview */}
                  {chatMessages.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
                        ข้อความล่าสุด
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
                                : 'bg-surface-container-lowest text-on-surface'
                            }`}
                          >
                            <div className="break-words">{msg.content}</div>
                            <div className={`mt-1 text-[10px] ${msg.direction === 'OUTGOING' ? 'text-primary-container' : 'text-on-surface-variant'}`}>
                              <ClientOnly fallback="-">{new Date(msg.sentAt).toLocaleString()}</ClientOnly>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
                      ไม่พบข้อความในการสนทนานี้
                    </div>
                  )}

                  {/* Open Chat button */}
                  {conversation && (
                    <div className="pt-2">
                      <Link
                        href={`/admin/chat?conversationId=${conversation.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                      >
                        <ExternalLink size={14} />
                        เปิดแชทเต็ม
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
              <h2 className="text-base font-semibold text-on-surface">กิจกรรม</h2>
              {auditLoading ? (
                <div className="py-10 text-center text-on-surface-variant">กำลังโหลดกิจกรรม...</div>
              ) : auditRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
                  ไม่มีกิจกรรมสำหรับผู้เช่ารายนี้
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-outline-variant">
                  <table className="w-full text-sm [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-on-surface-variant [&_th]:uppercase [&_th]:tracking-wider [&_th]:pb-3 [&_td]:text-on-surface [&_td]:py-3">
                    <thead>
                      <tr>
                        <th>เวลา</th>
                        <th>ผู้ใช้</th>
                        <th>การดำเนินการ</th>
                        <th>เอนทิตี</th>
                        <th>รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap"><ClientOnly fallback="-">{new Date(row.createdAt).toLocaleString('th-TH')}</ClientOnly></td>
                          <td>{row.userName || row.userId}</td>
                          <td>
                            <span className="">{row.action}</span>
                          </td>
                          <td className="font-mono text-xs text-on-surface-variant">{row.entityType}:{row.entityId.slice(0, 8)}</td>
                          <td className="max-w-[300px] truncate text-xs text-on-surface-variant">
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
