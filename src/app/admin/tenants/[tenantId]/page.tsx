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
  Send,
  XCircle,
  Pencil,

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

// ── Status helpers — Dark Glass ─────────────────────────────────────────────────

function invoiceStatusClass(s: InvoiceStatus) {
  if (s === 'PAID') return 'inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]';
  if (s === 'OVERDUE') return 'inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-red-600 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]';
  if (s === 'SENT' || s === 'VIEWED') return 'inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 border border-amber-500/20 shadow-[0_0_10px_rgba(251,191,36,0.2)]';
  return 'inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]';
}

function contractStatusClass(s: ContractStatus) {
  if (s === 'ACTIVE') return 'inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]';
  if (s === 'TERMINATED') return 'inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-red-600 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]';
  return 'inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function GlassInfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur-[12px] px-4 py-3.5 hover:bg-white/[0.05] transition-all duration-200">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">{label}</span>
      <span className="text-sm text-[hsl(var(--on-surface))] break-all">{value || '-'}</span>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

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

  // Send message dialog
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageSuccess, setMessageSuccess] = useState(false);

  // Edit tenant dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    emergencyContact: '',
    emergencyPhone: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── Fetch tenant ────────────────────────────────────────────────────────────

  const loadTenant = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, { cache: 'no-store' }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถโหลดผู้เช่า');
      setTenant(res.data);
      setEditForm({
        firstName: res.data.firstName ?? '',
        lastName: res.data.lastName ?? '',
        phone: res.data.phone ?? '',
        email: res.data.email ?? '',
        emergencyContact: res.data.emergencyContact ?? '',
        emergencyPhone: res.data.emergencyPhone ?? '',
      });
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
        const res = await fetch(`/api/tenants/${tenantId}?include=contracts`, { cache: 'no-store' }).then((r) => r.json());
        if (res.success && res.data?.contracts) {
          setContracts(res.data.contracts as Contract[]);
        } else if (tenant?.roomTenants) {
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
        <div className="flex items-center justify-center py-24 text-[hsl(var(--on-surface-variant))]">กำลังโหลดโปรไฟล์ผู้เช่า…</div>
      </main>
    );
  }

  if (error || !tenant) {
    return (
      <main className="space-y-6">
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <AlertCircle className="h-10 w-10 text-red-600" />
          <div className="text-[hsl(var(--on-surface-variant))]">{error ?? 'Tenant not found'}</div>
          <Link href="/admin/tenants" className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-white/[0.05] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] shadow-[var(--glass-shadow)] hover:bg-white/[0.1] active:scale-[0.98] transition-all duration-200 backdrop-blur">
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
      <nav className="flex items-center gap-1.5 text-sm text-[hsl(var(--on-surface-variant))]">
        <Link href="/admin/tenants" className="hover:text-[hsl(var(--on-surface))] transition-colors">ผู้เช่า</Link>
        <ChevronRight size={14} className="shrink-0 text-[hsl(var(--on-surface-variant))]" />
        <span className="font-medium text-[hsl(var(--on-surface))]">{tenant.fullName}</span>
      </nav>

      {/* ── Hero card — Dark Glass ────────────────────────────────────────── */}
      <section className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/60 backdrop-blur overflow-hidden shadow-[var(--glass-shadow)]">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-6">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary))]/15 text-xl font-bold text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/20 shadow-glow-primary">
            {initials}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-[hsl(var(--on-surface))]">{tenant.fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[hsl(var(--on-surface-variant))]">
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
            <span className={tenant.lineUserId ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-500/20 shadow-[0_0_12px_rgba(34,197,94,0.2)]' : 'inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-[11px] font-semibold text-white/40 border border-[hsl(var(--color-border))]'}>
              {tenant.lineUserId ? (
                <><CheckCircle size={11} className="mr-1" />LINE ลงทะเบียนแล้ว</>
              ) : (
                <><AlertCircle size={11} className="mr-1" />ยังไม่ลงทะเบียน LINE</>
              )}
            </span>
          </div>
          {/* Edit button */}
          <button
            onClick={() => setEditDialogOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--color-border))] bg-white/[0.05] px-3 py-2 text-[11px] font-medium text-[hsl(var(--on-surface))] hover:bg-white/[0.1] active:scale-[0.98] transition-all duration-200 backdrop-blur"
          >
            <Pencil size={12} /> แก้ไขข้อมูล
          </button>
          {/* Send message button */}
          {tenant.lineUserId && (
            <button
              onClick={() => setMessageDialogOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-[11px] font-semibold text-white shadow-glow-primary shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200"
            >
              <Send size={12} /> ส่งข้อความ
            </button>
          )}
        </div>
      </section>

      {/* ── Quick stats — Dark Glass ────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/60 backdrop-blur p-5 shadow-[var(--glass-shadow)] group hover:border-white/12 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary))]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface-variant))]">ใบแจ้งหนี้</div>
          <div className="text-xl font-semibold text-[hsl(var(--on-surface))]">{stats.invoicesCount}</div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/15 bg-[hsl(var(--color-surface))]/60 backdrop-blur p-5 shadow-[var(--glass-shadow)] group hover:border-emerald-500/25 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface-variant))]">ชำระแล้ว</div>
          <div className="text-xl font-semibold text-emerald-600">{money(stats.totalPaid)}</div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-amber-500/15 bg-[hsl(var(--color-surface))]/60 backdrop-blur p-5 shadow-[var(--glass-shadow)] group hover:border-amber-500/25 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface-variant))]">ค้างชำระ</div>
          <div className={`text-xl font-semibold ${stats.outstanding > 0 ? 'text-amber-600' : 'text-[hsl(var(--on-surface))]'}`}>{money(stats.outstanding)}</div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-red-500/15 bg-[hsl(var(--color-surface))]/60 backdrop-blur p-5 shadow-[var(--glass-shadow)] group hover:border-red-500/25 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface-variant))]">งานเปิด</div>
          <div className={`text-xl font-semibold ${stats.openTickets > 0 ? 'text-red-600' : 'text-[hsl(var(--on-surface))]'}`}>{stats.openTickets}</div>
        </div>
      </section>

      {/* ── Tabs — Dark Glass ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur shadow-[var(--glass-shadow)] overflow-visible">
        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/40 backdrop-blur">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                    : 'border-transparent text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))] hover:bg-white/[0.04]'
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
                <h2 className="text-base font-semibold text-[hsl(var(--on-surface))]">ข้อมูลส่วนตัว</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  <GlassInfoRow label="ชื่อ" value={tenant.firstName} />
                  <GlassInfoRow label="นามสกุล" value={tenant.lastName} />
                  <GlassInfoRow label="โทรศัพท์" value={tenant.phone} />
                  <GlassInfoRow label="อีเมล" value={tenant.email} />
                  <GlassInfoRow
                    label="LINE UID"
                    value={
                      tenant.lineUserId
                        ? <span title={tenant.lineUserId}>{truncateLineId(tenant.lineUserId)}</span>
                        : null
                    }
                  />
                  <GlassInfoRow label="ติดต่อฉุกเฉิน" value={tenant.emergencyContact} />
                  <GlassInfoRow label="โทรศัพท์ฉุกเฉิน" value={tenant.emergencyPhone} />
                  <GlassInfoRow label="สมาชิกตั้งแต่" value={fmtDate(tenant.createdAt)} />
                </div>
              </div>

              {/* Room assignments */}
              {tenant.roomTenants && tenant.roomTenants.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-[hsl(var(--on-surface))]">ห้องที่ลงทะเบียน</h2>
                  {tenant.roomTenants.map((rt) => (
                    <div key={rt.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--primary))]/15 bg-[hsl(var(--primary))]/5 px-4 py-3 text-sm backdrop-blur-[12px]">
                      <div>
                        <div className="font-medium text-[hsl(var(--on-surface))]">ห้อง {rt.room?.roomNo ?? rt.roomNo}</div>
                        <div className="text-[hsl(var(--on-surface-variant))]">
                          {rt.role} · เข้าอยู่ {fmtDate(rt.moveInDate)}
                          {rt.moveOutDate ? ` · ย้ายออก ${fmtDate(rt.moveOutDate)}` : ''}
                        </div>
                      </div>
                      <span className={!rt.moveOutDate ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]'}>
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
              <h2 className="text-base font-semibold text-[hsl(var(--on-surface))]">สัญญา</h2>
              {contractsLoading ? (
                <div className="py-10 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลดสัญญา...</div>
              ) : contracts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[hsl(var(--color-border))] px-8 py-8 text-center text-sm text-[hsl(var(--on-surface-variant))]">
                  ไม่พบสัญญาสำหรับผู้เช่ารายนี้
                </div>
              ) : (
                <div className="space-y-2">
                  {contracts.map((contract) => {
                    const expanded = expandedContracts.has(contract.id);
                    return (
                      <div key={contract.id} className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] shadow-[var(--glass-shadow)] overflow-hidden">
                        {/* Row header */}
                        <button
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[hsl(var(--color-surface))]/[0.03] transition-colors duration-150 active:scale-[0.99]"
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
                            <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]">
                              <FileText size={15} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-[hsl(var(--on-surface))]">ห้อง {contract.roomNumber}</div>
                              <div className="text-xs text-[hsl(var(--on-surface-variant))]">
                                {fmtDate(contract.startDate)}
                                {contract.endDate ? ` → ${fmtDate(contract.endDate)}` : ' · ดำเนินอยู่'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {contract.monthlyRent > 0 && (
                              <span className="text-sm text-[hsl(var(--on-surface-variant))]">{money(contract.monthlyRent)}/mo</span>
                            )}
                            <span className={contractStatusClass(contract.status)}>
                              {contract.status === 'ACTIVE' ? 'ใช้งาน' : contract.status}
                            </span>
                            {expanded ? <ChevronUp size={15} className="text-[hsl(var(--on-surface-variant))]" /> : <ChevronDown size={15} className="text-[hsl(var(--on-surface-variant))]" />}
                          </div>
                        </button>

                        {/* Expanded details */}
                        {expanded && (
                          <div className="border-t border-[hsl(var(--color-border))] bg-white/[0.02] px-5 py-4 backdrop-blur-[12px]">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <GlassInfoRow label="วันเริ่มต้น" value={fmtDate(contract.startDate)} />
                              <GlassInfoRow label="วันสิ้นสุด" value={contract.endDate ? fmtDate(contract.endDate) : 'ดำเนินอยู่'} />
                              <GlassInfoRow label="สถานะ" value={contract.status === 'ACTIVE' ? 'ใช้งาน' : contract.status} />
                              {contract.monthlyRent > 0 && (
                                <GlassInfoRow label="ค่าเช่ารายเดือน" value={money(contract.monthlyRent)} />
                              )}
                              {contract.deposit > 0 && (
                                <GlassInfoRow label="เงินประกัน" value={money(contract.deposit)} />
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
                <h2 className="text-base font-semibold text-[hsl(var(--on-surface))]">ใบแจ้งหนี้</h2>
                <select
                  className="rounded-lg border border-[hsl(var(--color-border))] bg-white/[0.05] px-3 py-2 text-sm text-[hsl(var(--on-surface))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 w-auto min-w-[160px]"
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
                <div className="py-10 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลดใบแจ้งหนี้...</div>
              ) : filteredInvoices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[hsl(var(--color-border))] px-8 py-8 text-center text-sm text-[hsl(var(--on-surface-variant))]">
                  ไม่พบใบแจ้งหนี้{invoiceFilter ? ` สถานะ ${invoiceFilter}` : ''}
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] shadow-[var(--glass-shadow)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[hsl(var(--color-border))]">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เลขใบแจ้งหนี้</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ห้อง</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">งวด</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">จำนวน</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">วันครบกำหนด</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ชำระเมื่อ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-[hsl(var(--color-surface))]/[0.03] transition-colors duration-150">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-[hsl(var(--on-surface-variant))]">{inv.id.slice(0, 12)}…</span>
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--on-surface))]">{inv.room?.roomNumber ?? inv.room?.roomNo ?? '-'}</td>
                          <td className="px-4 py-3 text-[hsl(var(--on-surface))]">{inv.year}-{String(inv.month).padStart(2, '0')}</td>
                          <td className="px-4 py-3 text-[hsl(var(--on-surface))]">{money(inv.totalAmount)}</td>
                          <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]">{fmtDate(inv.dueDate)}</td>
                          <td className="px-4 py-3">
                            <span className={invoiceStatusClass(inv.status)}>{inv.status === 'PAID' ? 'ชำระแล้ว' : inv.status === 'OVERDUE' ? 'เกินกำหนด' : inv.status === 'SENT' ? 'ส่งแล้ว' : inv.status === 'VIEWED' ? 'เปิดดูแล้ว' : inv.status === 'GENERATED' ? 'สร้างแล้ว' : 'ร่าง'}</span>
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]">{inv.paidAt ? fmtDate(inv.paidAt) : '-'}</td>
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
              <h2 className="text-base font-semibold text-[hsl(var(--on-surface))]">ประวัติการชำระ</h2>
              {paymentsLoading ? (
                <div className="py-10 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลดการชำระ...</div>
              ) : payments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[hsl(var(--color-border))] px-8 py-8 text-center text-sm text-[hsl(var(--on-surface-variant))]">
                  ไม่พบรายการชำระสำหรับผู้เช่ารายนี้
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] shadow-[var(--glass-shadow)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[hsl(var(--color-border))]">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">วันที่</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">จำนวน</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">อ้างอิง</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ห้อง</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ใบแจ้งหนี้</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {payments.map((pmt) => (
                        <tr key={pmt.id} className="hover:bg-[hsl(var(--color-surface))]/[0.03] transition-colors duration-150">
                          <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]">{fmtDate(pmt.transactionDate)}</td>
                          <td className="px-4 py-3 text-[hsl(var(--on-surface))]">{money(pmt.amount)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--on-surface-variant))]">{pmt.reference ?? pmt.description ?? '-'}</td>
                          <td className="px-4 py-3 text-[hsl(var(--on-surface))]">{pmt.invoice?.room?.roomNumber ?? pmt.invoice?.room?.roomNo ?? '-'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--on-surface-variant))]">{pmt.invoice?.id ? pmt.invoice.id.slice(0, 10) + '…' : '-'}</td>
                          <td className="px-4 py-3">
                            <span className={pmt.status === 'MATCHED' ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]'}>
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
              <h2 className="text-base font-semibold text-[hsl(var(--on-surface))]">แชท LINE</h2>
              {!tenant.lineUserId ? (
                <div className="rounded-lg border border-dashed border-[hsl(var(--color-border))] px-8 py-8 text-center text-sm text-[hsl(var(--on-surface-variant))]">
                  <MessageSquare size={28} className="mx-auto mb-2 text-[hsl(var(--on-surface-variant))]/30" />
                  ผู้เช่ารายนี้ยังไม่ได้ลิงก์บัญชี LINE กรุณาลิงก์ LINE UID ก่อนเพื่อส่งข้อความ
                </div>
              ) : chatLoading ? (
                <div className="py-10 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลดข้อความ...</div>
              ) : (
                <div className="space-y-4">
                  {chatMessages.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-3">
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
                                ? 'bg-[hsl(var(--primary))]/80 text-white shadow-glow-primary'
                                : 'bg-white/[0.05] text-[hsl(var(--on-surface))] border border-[hsl(var(--color-border))]'
                            }`}
                          >
                            <div className="break-words">{msg.content}</div>
                            <div className={`mt-1 text-[10px] ${msg.direction === 'OUTGOING' ? 'text-white/60' : 'text-[hsl(var(--on-surface-variant))]'}`}>
                              <ClientOnly fallback="-">{new Date(msg.sentAt).toLocaleString()}</ClientOnly>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[hsl(var(--color-border))] px-6 py-6 text-center text-sm text-[hsl(var(--on-surface-variant))]">
                      ไม่พบข้อความในการสนทนานี้
                    </div>
                  )}

                  {conversation && (
                    <div className="pt-2">
                      <Link
                        href={`/admin/chat?conversationId=${conversation.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-white/[0.05] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] shadow-[var(--glass-shadow)] hover:bg-white/[0.1] active:scale-[0.98] transition-all duration-200 backdrop-blur"
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
              <h2 className="text-base font-semibold text-[hsl(var(--on-surface))]">กิจกรรม</h2>
              {auditLoading ? (
                <div className="py-10 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลดกิจกรรม...</div>
              ) : auditRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[hsl(var(--color-border))] px-8 py-8 text-center text-sm text-[hsl(var(--on-surface-variant))]">
                  ไม่มีกิจกรรมสำหรับผู้เช่ารายนี้
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] shadow-[var(--glass-shadow)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[hsl(var(--color-border))]">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เวลา</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ผู้ใช้</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">การดำเนินการ</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เอนทิตี</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {auditRows.map((row) => (
                        <tr key={row.id} className="hover:bg-[hsl(var(--color-surface))]/[0.03] transition-colors duration-150">
                          <td className="px-4 py-3 whitespace-nowrap text-[hsl(var(--on-surface-variant))]"><ClientOnly fallback="-">{new Date(row.createdAt).toLocaleString('th-TH')}</ClientOnly></td>
                          <td className="px-4 py-3 text-[hsl(var(--on-surface))]">{row.userName || row.userId}</td>
                          <td className="px-4 py-3 text-[hsl(var(--on-surface))]">{row.action}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--on-surface-variant))]">{row.entityType}:{row.entityId.slice(0, 8)}</td>
                          <td className="px-4 py-3 max-w-[300px] truncate text-xs text-[hsl(var(--on-surface-variant))]">
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

      {/* Send message dialog */}
      {messageDialogOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setMessageDialogOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-[hsl(var(--color-surface))]/80 backdrop-blur rounded-xl border border-[hsl(var(--color-border))] shadow-[var(--glass-shadow)] w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--color-border))]">
                <h3 className="text-base font-semibold text-[hsl(var(--on-surface))]">ส่งข้อความ LINE</h3>
                <button onClick={() => setMessageDialogOpen(false)} className="p-1.5 hover:bg-[hsl(var(--color-surface))] rounded-lg transition-colors active:scale-[0.95]">
                  <XCircle size={18} className="text-[hsl(var(--on-surface-variant))]" />
                </button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!tenant?.lineUserId) return;
                setMessageSending(true);
                setMessageError(null);
                setMessageSuccess(false);
                try {
                  const convRes = await fetch(`/api/conversations?lineUserId=${encodeURIComponent(tenant.lineUserId!)}&pageSize=1`, { cache: 'no-store' }).then(r => r.json());
                  const convList = convRes.success ? (convRes.data?.data ?? []) : [];
                  if (!convList.length) throw new Error('ไม่พบการสนทนา กรุณาลิงก์ LINE UID ก่อน');
                  const conv = convList[0];
                  const res = await fetch(`/api/conversations/${conv.id}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: messageText }),
                  }).then(r => r.json());
                  if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถส่งข้อความได้');
                  setMessageSuccess(true);
                  setMessageText('');
                  setTimeout(() => setMessageDialogOpen(false), 1500);
                } catch (err) {
                  setMessageError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
                } finally {
                  setMessageSending(false);
                }
              }} className="p-6 space-y-4">
                <div className="text-sm text-[hsl(var(--on-surface-variant))]">
                  ส่งข้อความไปยัง <span className="font-semibold text-[hsl(var(--on-surface))]">{tenant.fullName}</span>
                </div>
                <textarea
                  className="w-full px-4 py-2.5 bg-white/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 min-h-[120px] resize-y"
                  placeholder="พิมพ์ข้อความ..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  required
                />
                {messageError && (
                  <div className="text-xs text-red-600 flex items-center gap-1">
                    <XCircle size={12} /> {messageError}
                  </div>
                )}
                {messageSuccess && (
                  <div className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                    <CheckCircle size={12} /> ส่งข้อความสำเร็จแล้ว
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setMessageDialogOpen(false)} className="flex-1 py-2.5 border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] text-sm font-medium text-[hsl(var(--on-surface))] rounded-lg hover:bg-white/[0.06] transition-colors active:scale-[0.98] backdrop-blur">
                    ยกเลิก
                  </button>
                  <button type="submit" disabled={messageSending || !messageText.trim()} className="flex-1 py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2">
                    {messageSending ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        กำลังส่ง...
                      </>
                    ) : (
                      <>
                        <Send size={14} /> ส่งข้อความ
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Edit tenant dialog */}
      {editDialogOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setEditDialogOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-[hsl(var(--color-surface))]/80 backdrop-blur rounded-xl border border-[hsl(var(--color-border))] shadow-[var(--glass-shadow)] w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--color-border))]">
                <h3 className="text-base font-semibold text-[hsl(var(--on-surface))]">แก้ไขข้อมูลผู้เช่า</h3>
                <button onClick={() => setEditDialogOpen(false)} className="p-1.5 hover:bg-[hsl(var(--color-surface))] rounded-lg transition-colors active:scale-[0.95]">
                  <XCircle size={18} className="text-[hsl(var(--on-surface-variant))]" />
                </button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setEditSaving(true);
                setEditError(null);
                try {
                  const res = await fetch(`/api/tenants/${tenantId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(editForm),
                  }).then(r => r.json());
                  if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถบันทึกข้อมูลได้');
                  setTenant(res.data);
                  setEditForm({
                    firstName: res.data.firstName ?? '',
                    lastName: res.data.lastName ?? '',
                    phone: res.data.phone ?? '',
                    email: res.data.email ?? '',
                    emergencyContact: res.data.emergencyContact ?? '',
                    emergencyPhone: res.data.emergencyPhone ?? '',
                  });
                  setEditDialogOpen(false);
                } catch (err) {
                  setEditError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
                } finally {
                  setEditSaving(false);
                }
              }} className="p-6 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-medium text-[hsl(var(--on-surface-variant))] mb-1">ชื่อ</label>
                    <input
                      type="text"
                      value={editForm.firstName}
                      onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                      className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] bg-white/[0.05] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[hsl(var(--on-surface-variant))] mb-1">นามสกุล</label>
                    <input
                      type="text"
                      value={editForm.lastName}
                      onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                      className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] bg-white/[0.05] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[hsl(var(--on-surface-variant))] mb-1">โทรศัพท์</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] bg-white/[0.05] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[hsl(var(--on-surface-variant))] mb-1">อีเมล</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] bg-white/[0.05] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[hsl(var(--on-surface-variant))] mb-1">ติดต่อฉุกเฉิน</label>
                  <input
                    type="text"
                    value={editForm.emergencyContact}
                    onChange={e => setEditForm(f => ({ ...f, emergencyContact: e.target.value }))}
                    className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] bg-white/[0.05] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[hsl(var(--on-surface-variant))] mb-1">โทรศัพท์ฉุกเฉิน</label>
                  <input
                    type="text"
                    value={editForm.emergencyPhone}
                    onChange={e => setEditForm(f => ({ ...f, emergencyPhone: e.target.value }))}
                    className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] bg-white/[0.05] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200"
                  />
                </div>
                {editError && (
                  <div className="text-xs text-red-600 flex items-center gap-1">
                    <XCircle size={12} /> {editError}
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setEditDialogOpen(false)} className="flex-1 py-2.5 border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] text-sm font-medium text-[hsl(var(--on-surface))] rounded-lg hover:bg-white/[0.06] transition-colors active:scale-[0.98] backdrop-blur">
                    ยกเลิก
                  </button>
                  <button type="submit" disabled={editSaving} className="flex-1 py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2">
                    {editSaving ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        กำลังบันทึก...
                      </>
                    ) : (
                      <>
                        <Pencil size={14} /> บันทึก
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
