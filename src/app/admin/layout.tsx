'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LogoutButton from '@/components/auth/LogoutButton';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import {
  LayoutDashboard,
  Building2,
  DoorOpen,
  Users,
  UserPlus,
  Receipt,
  FileText,
  FilePlus,
  CreditCard,
  AlertTriangle,
  MessageSquare,
  FileEdit,
  PieChart,
  Settings,
  ClipboardList,
  Server,
  Layers,
  Cpu,
  ScrollText,
  ChevronDown,
  Menu,
  X,
  Upload,
  Send,
  Bell,
  FileBarChart,
} from 'lucide-react';

type NavLink = { type: 'link'; href: string; label: string; icon: React.ElementType; exact?: boolean };
type NavGroup = { type: 'group'; label: string; items: NavLink[]; defaultOpen?: boolean };
type NavItem = NavLink | NavGroup;

// ── Page title lookup for topbar breadcrumb ───────────────────────────────
const PAGE_TITLES: Array<{ prefix: string; label: string }> = [
  { prefix: '/admin/dashboard',               label: 'แดชบอร์ด' },
  { prefix: '/admin/rooms',                   label: 'ห้องพัก' },
  { prefix: '/admin/tenants',                 label: 'ผู้เช่า' },
  { prefix: '/admin/tenant-registrations',    label: 'ลงทะเบียนผู้เช่า' },
  { prefix: '/admin/contracts',               label: 'สัญญาเช่า' },
  { prefix: '/admin/billing/import',          label: 'นำเข้าข้อมูลบิล' },
  { prefix: '/admin/billing/batches',         label: 'ชุดข้อมูลบิล' },
  { prefix: '/admin/billing',                 label: 'รอบบิล' },
  { prefix: '/admin/invoices',                label: 'ใบแจ้งหนี้' },
  { prefix: '/admin/payments/upload-statement', label: 'อัปโหลด Statement' },
  { prefix: '/admin/payments/review-match',   label: 'ตรวจสอบการจับคู่' },
  { prefix: '/admin/payments/review',         label: 'ตรวจสอบการชำระเงิน' },
  { prefix: '/admin/payments',                label: 'ชำระเงิน' },
  { prefix: '/admin/overdue',                 label: 'ค้างชำระ' },
  { prefix: '/admin/templates',               label: 'เทมเพลต' },
  { prefix: '/admin/documents/generate',      label: 'สร้างเอกสาร' },
  { prefix: '/admin/documents',               label: 'เอกสาร' },
  { prefix: '/admin/deliveries',              label: 'ส่ง LINE' },
  { prefix: '/admin/chat',                    label: 'แชท LINE' },
  { prefix: '/admin/message-templates',       label: 'เทมเพลตข้อความ' },
  { prefix: '/admin/broadcast',              label: 'ประกาศ' },
  { prefix: '/admin/analytics',              label: 'Analytics' },
  { prefix: '/admin/reports/revenue',        label: 'รายงานรายรับ' },
  { prefix: '/admin/reports/occupancy',      label: 'รายงานการเข้าพัก' },
  { prefix: '/admin/reports/collections',    label: 'รายงานการชำระเงิน' },
  { prefix: '/admin/reports/documents',      label: 'รายงานเอกสาร' },
  { prefix: '/admin/reports/audit',          label: 'รายงาน Audit' },
  { prefix: '/admin/reports',               label: 'รายงาน' },
  { prefix: '/admin/audit-logs',             label: 'ประวัติกิจกรรม' },
  { prefix: '/admin/settings/users',         label: 'ตั้งค่า — ผู้ใช้' },
  { prefix: '/admin/settings/roles',         label: 'ตั้งค่า — บทบาท' },
  { prefix: '/admin/settings/building',      label: 'ตั้งค่า — อาคาร' },
  { prefix: '/admin/settings/billing-policy', label: 'ตั้งค่า — บิลลิ่ง' },
  { prefix: '/admin/settings/bank-accounts', label: 'ตั้งค่า — บัญชีธนาคาร' },
  { prefix: '/admin/settings/automation',    label: 'ตั้งค่า — อัตโนมัติ' },
  { prefix: '/admin/settings/integrations',  label: 'ตั้งค่า — Integrations' },
  { prefix: '/admin/settings',               label: 'ตั้งค่า' },
  { prefix: '/admin/system-health',          label: 'สถานะระบบ' },
  { prefix: '/admin/system-jobs',            label: 'งานเบื้องหลัง' },
  { prefix: '/admin/system',                 label: 'ระบบ' },
  { prefix: '/admin/users',                  label: 'ผู้ดูแลระบบ' },
];

function getPageTitle(pathname: string | null): string {
  if (!pathname) return 'Apartment ERP';
  for (const { prefix, label } of PAGE_TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return label;
    }
  }
  return 'Apartment ERP';
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW SIDEBAR: 7 หมวดแม่แทนที่จะ 13 หมวด
// ─────────────────────────────────────────────────────────────────────────────
// อสังหาริมทรัพย์ → ห้องพัก (rooms + tenants + registrations)
// การเงิน → บิล + การเงิน (billing + payments + overdue)  [สัญญาเช่าแยกเอง]
// เอกสาร → เอกสาร (templates + documents)
// การสื่อสาร → แชท + ประกาศ
// รายงาน → รายงาน + ประวัติ
// ระบบ → ตั้งค่า + ระบบ
// ─────────────────────────────────────────────────────────────────────────────

const nav: NavItem[] = [
  { type: 'link', href: '/admin/dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },

  // ── ห้องพัก: ห้อง | ผู้เช่า | ลงทะเบียน ──
  {
    type: 'group', label: 'ห้องพัก', defaultOpen: true, items: [
      { type: 'link', href: '/admin/rooms', label: 'ห้อง', icon: DoorOpen },
      { type: 'link', href: '/admin/tenants', label: 'ผู้เช่า', icon: Users },
      { type: 'link', href: '/admin/tenant-registrations', label: 'ลงทะเบียน', icon: UserPlus },
    ],
  },

  // ── บิล: รอบบิล | ใบแจ้งหนี้ ──
  {
    type: 'group', label: 'บิล', defaultOpen: true, items: [
      { type: 'link', href: '/admin/billing', label: 'รอบบิล', icon: Receipt },
      { type: 'link', href: '/admin/invoices', label: 'ใบแจ้งหนี้', icon: ScrollText },
    ],
  },

  // ── การเงิน: ชำระเงิน | ค้างชำระ | อัปโหลดสเตตเมนต์ ──
  {
    type: 'group', label: 'การเงิน', defaultOpen: true, items: [
      { type: 'link', href: '/admin/payments', label: 'ชำระเงิน', icon: CreditCard },
      { type: 'link', href: '/admin/overdue', label: 'ค้างชำระ', icon: AlertTriangle },
      { type: 'link', href: '/admin/payments/upload-statement', label: 'อัปโหลดสเตตเมนต์', icon: Upload },
    ],
  },

  // ── เอกสาร: เทมเพลต | สร้าง | ดู | ส่ง LINE ──
  {
    type: 'group', label: 'เอกสาร', defaultOpen: false, items: [
      { type: 'link', href: '/admin/templates', label: 'เทมเพลต', icon: FilePlus },
      { type: 'link', href: '/admin/documents', label: 'เอกสารที่สร้าง', icon: Layers, exact: true },
      { type: 'link', href: '/admin/documents/generate', label: 'สร้างเอกสาร', icon: FileText },
      { type: 'link', href: '/admin/deliveries', label: 'LINE ส่ง', icon: Send },
    ],
  },

  // ── แชท + ประกาศ ──
  {
    type: 'group', label: 'ปฏิบัติการ', defaultOpen: false, items: [
      { type: 'link', href: '/admin/chat', label: 'แชท LINE', icon: MessageSquare },
      { type: 'link', href: '/admin/message-templates', label: 'เทมเพลตข้อความ', icon: FileEdit },
      { type: 'link', href: '/admin/broadcast', label: 'ประกาศ', icon: Bell },
    ],
  },

  // ── Analytics + Reports + Audit ──
  {
    type: 'group', label: 'ข้อมูลเชิงลึก', defaultOpen: false, items: [
      { type: 'link', href: '/admin/analytics', label: 'Analytics', icon: PieChart },
      { type: 'link', href: '/admin/reports', label: 'รายงาน', icon: FileBarChart },
      { type: 'link', href: '/admin/audit-logs', label: 'ประวัติกิจกรรม', icon: ClipboardList },
    ],
  },

  // ── ระบบ: ตั้งค่า | ระบบ | สถานะ | งานเบื้องหลัง ──
  {
    type: 'group', label: 'ระบบ', defaultOpen: false, items: [
      { type: 'link', href: '/admin/settings', label: 'ตั้งค่า', icon: Settings },
      { type: 'link', href: '/admin/system', label: 'ระบบ', icon: Server, exact: true },
      { type: 'link', href: '/admin/system-health', label: 'สถานะ', icon: FileText },
      { type: 'link', href: '/admin/system-jobs', label: 'งานเบื้องหลัง', icon: Cpu },
    ],
  },
];

function NavGroupSection({
  group,
  pathname,
  initialOpen,
}: {
  group: Extract<NavItem, { type: 'group' }>;
  pathname: string | null;
  initialOpen: boolean;
}) {
  const hasActiveChild = group.items.some((item) =>
    item.exact
      ? pathname === item.href || pathname === item.href + '/'
      : pathname?.startsWith(item.href),
  );
  const [open, setOpen] = useState(initialOpen || hasActiveChild);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 pt-5 pb-1.5 group"
      >
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-slate-600">
          {group.label}
        </span>
        <ChevronDown
          size={12}
          className={`text-slate-600 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        {group.items.map((item) => {
          const active = item.exact
            ? pathname === item.href || pathname === item.href + '/'
            : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium bg-indigo-600 text-white shadow-sm shadow-indigo-500/30 mx-1 my-0.5'
                  : 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors duration-150 mx-1 my-0.5'
              }
            >
              <item.icon
                size={15}
                className={active ? 'text-white' : 'text-slate-500'}
                strokeWidth={active ? 2.5 : 1.8}
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
          <Building2 size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-sm font-semibold text-white leading-tight tracking-tight">Apartment ERP</div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 mt-0.5">คอนโซลจัดการ</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {nav.map((item, idx) => {
          if (item.type === 'group') {
            return (
              <NavGroupSection
                key={idx}
                group={item}
                pathname={pathname}
                initialOpen={item.defaultOpen ?? false}
              />
            );
          }

          const active = item.exact
            ? pathname === item.href || pathname === item.href + '/'
            : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                  : 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors duration-150'
              }
            >
              <item.icon
                size={15}
                className={active ? 'text-white' : 'text-slate-500'}
                strokeWidth={active ? 2.5 : 1.8}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2.5 mb-1">
          <div className="h-7 w-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-indigo-400">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-300 truncate">ผู้ดูแลระบบ</div>
            <div className="text-[10px] text-slate-600">เจ้าของ</div>
          </div>
        </div>
        <LogoutButton />
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      {/* ── Desktop Sidebar ── */}
      <aside className="relative z-20 hidden md:flex flex-col bg-[#111827] text-white">
        {sidebarContent}
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col bg-[#111827] text-white md:hidden" style={{ animation: 'slide-in-right 250ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="absolute top-4 right-4">
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* ── Main content ── */}
      <div className="relative flex min-w-0 flex-col bg-slate-50">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-sm px-6">
          {/* Left: hamburger + dynamic page title */}
          <div className="flex items-center gap-3 text-sm">
            <button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={18} />
            </button>
            <span className="font-medium text-slate-800">{getPageTitle(pathname)}</span>
          </div>

          {/* Right: date + admin badge */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate-400 hidden sm:inline" suppressHydrationWarning>
              {new Date().toLocaleDateString('th-TH', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <div className="h-4 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-slate-600">แอดมิน</span>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <ErrorBoundary>
            <ToastProvider>
              <QueryProvider>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={pathname}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </QueryProvider>
            </ToastProvider>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
