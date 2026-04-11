'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ThemeToggle } from '@/components/providers/ThemeToggle';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import LogoutButton from '@/components/auth/LogoutButton';
import {
  Building2,
  LayoutDashboard,
  DoorOpen,
  Users,
  UserPlus,
  Receipt,
  ScrollText,
  CreditCard,
  AlertTriangle,
  Upload,
  FilePlus,
  Layers,
  FileText,
  Send,
  MessageSquare,
  FileEdit,
  Bell,
  PieChart,
  FileBarChart,
  ClipboardList,
  Settings,
  Server,
  Cpu,
  Search,
  Bell as BellIcon,
  ChevronDown,
  Menu,
  X,
  Wrench,
  FileSignature,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────
type NavLink = { type: 'link'; href: string; label: string; icon: React.ElementType; exact?: boolean };
type NavGroup = { type: 'group'; label: string; items: NavLink[]; defaultOpen?: boolean };
type NavItem = NavLink | NavGroup;

// ── Page title lookup ─────────────────────────────────────────────────────
const PAGE_TITLES: Array<{ prefix: string; label: string }> = [
  { prefix: '/admin/dashboard', label: 'แดชบอร์ด' },
  { prefix: '/admin/rooms', label: 'ห้องพัก' },
  { prefix: '/admin/tenants', label: 'ผู้เช่า' },
  { prefix: '/admin/tenant-registrations', label: 'ลงทะเบียนผู้เช่า' },
  { prefix: '/admin/contracts', label: 'สัญญาเช่า' },
  { prefix: '/admin/billing/import', label: 'นำเข้าข้อมูลบิล' },
  { prefix: '/admin/billing/batches', label: 'ชุดข้อมูลบิล' },
  { prefix: '/admin/billing', label: 'รอบบิล' },
  { prefix: '/admin/invoices', label: 'ใบแจ้งหนี้' },
  { prefix: '/admin/payments/upload-statement', label: 'อัปโหลด Statement' },
  { prefix: '/admin/payments/review-match', label: 'ตรวจสอบการจับคู่' },
  { prefix: '/admin/payments/review', label: 'ตรวจสอบการชำระเงิน' },
  { prefix: '/admin/payments', label: 'ชำระเงิน' },
  { prefix: '/admin/overdue', label: 'ค้างชำระ' },
  { prefix: '/admin/templates', label: 'เทมเพลต' },
  { prefix: '/admin/documents/generate', label: 'สร้างเอกสาร' },
  { prefix: '/admin/documents', label: 'เอกสาร' },
  { prefix: '/admin/deliveries', label: 'ส่ง LINE' },
  { prefix: '/admin/chat', label: 'แชท LINE' },
  { prefix: '/admin/message-templates', label: 'เทมเพลตข้อความ' },
  { prefix: '/admin/broadcast', label: 'ประกาศ' },
  { prefix: '/admin/analytics', label: 'Analytics' },
  { prefix: '/admin/reports/revenue', label: 'รายงานรายรับ' },
  { prefix: '/admin/reports/occupancy', label: 'รายงานการเข้าพัก' },
  { prefix: '/admin/reports/collections', label: 'รายงานการชำระเงิน' },
  { prefix: '/admin/reports/profit-loss', label: 'รายงานกำไร/ขาดทุน' },
  { prefix: '/admin/reports', label: 'รายงาน' },
  { prefix: '/admin/audit-logs', label: 'ประวัติกิจกรรม' },
  { prefix: '/admin/settings/users', label: 'ตั้งค่า — ผู้ใช้' },
  { prefix: '/admin/settings/roles', label: 'ตั้งค่า — บทบาท' },
  { prefix: '/admin/settings/building', label: 'ตั้งค่า — อาคาร' },
  { prefix: '/admin/settings/billing-policy', label: 'ตั้งค่า — บิลลิ่ง' },
  { prefix: '/admin/settings/bank-accounts', label: 'ตั้งค่า — บัญชีธนาคาร' },
  { prefix: '/admin/settings/automation', label: 'ตั้งค่า — อัตโนมัติ' },
  { prefix: '/admin/settings/integrations', label: 'ตั้งค่า — Integrations' },
  { prefix: '/admin/settings', label: 'ตั้งค่า' },
  { prefix: '/admin/system-health', label: 'สถานะระบบ' },
  { prefix: '/admin/system-jobs', label: 'งานเบื้องหลัง' },
  { prefix: '/admin/system', label: 'ระบบ' },
  { prefix: '/admin/users', label: 'ผู้ดูแลระบบ' },
  { prefix: '/admin/maintenance', label: 'แจ้งซ่อม' },
  { prefix: '/admin/moveouts', label: 'ย้ายออก' },
  { prefix: '/admin/floors', label: 'จัดการชั้น' },
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

// ── Icon-only nav items ────────────────────────────────────────────────────
const nav: NavItem[] = [
  { type: 'link', href: '/admin/dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },

  {
    type: 'group', label: 'ห้องพัก', defaultOpen: true, items: [
      { type: 'link', href: '/admin/rooms', label: 'ห้อง', icon: DoorOpen },
      { type: 'link', href: '/admin/tenants', label: 'ผู้เช่า', icon: Users },
      { type: 'link', href: '/admin/contracts', label: 'สัญญา', icon: FileSignature },
      { type: 'link', href: '/admin/tenant-registrations', label: 'ลงทะเบียน', icon: UserPlus },
      { type: 'link', href: '/admin/moveouts', label: 'ย้ายออก', icon: Wrench },
    ],
  },

  {
    type: 'group', label: 'บิล', defaultOpen: true, items: [
      { type: 'link', href: '/admin/billing', label: 'รอบบิล', icon: Receipt },
      { type: 'link', href: '/admin/invoices', label: 'ใบแจ้งหนี้', icon: ScrollText },
      { type: 'link', href: '/admin/billing/import', label: 'นำเข้าข้อมูล', icon: Upload },
    ],
  },

  {
    type: 'group', label: 'การเงิน', defaultOpen: true, items: [
      { type: 'link', href: '/admin/payments', label: 'ชำระเงิน', icon: CreditCard },
      { type: 'link', href: '/admin/overdue', label: 'ค้างชำระ', icon: AlertTriangle },
      { type: 'link', href: '/admin/payments/upload-statement', label: 'อัปโหลดสเตตเมนต์', icon: Upload },
    ],
  },

  {
    type: 'group', label: 'เอกสาร', defaultOpen: false, items: [
      { type: 'link', href: '/admin/templates', label: 'เทมเพลต', icon: FilePlus },
      { type: 'link', href: '/admin/documents', label: 'เอกสารที่สร้าง', icon: Layers, exact: true },
      { type: 'link', href: '/admin/documents/generate', label: 'สร้างเอกสาร', icon: FileText },
      { type: 'link', href: '/admin/deliveries', label: 'LINE ส่ง', icon: Send },
    ],
  },

  {
    type: 'group', label: 'ปฏิบัติการ', defaultOpen: false, items: [
      { type: 'link', href: '/admin/chat', label: 'แชท LINE', icon: MessageSquare },
      { type: 'link', href: '/admin/message-templates', label: 'เทมเพลตข้อความ', icon: FileEdit },
      { type: 'link', href: '/admin/broadcast', label: 'ประกาศ', icon: Bell },
      { type: 'link', href: '/admin/maintenance', label: 'แจ้งซ่อม', icon: Wrench },
    ],
  },

  {
    type: 'group', label: 'ข้อมูลเชิงลึก', defaultOpen: false, items: [
      { type: 'link', href: '/admin/analytics', label: 'Analytics', icon: PieChart },
      { type: 'link', href: '/admin/reports', label: 'รายงาน', icon: FileBarChart },
      { type: 'link', href: '/admin/audit-logs', label: 'ประวัติกิจกรรม', icon: ClipboardList },
    ],
  },

  {
    type: 'group', label: 'ระบบ', defaultOpen: false, items: [
      { type: 'link', href: '/admin/settings', label: 'ตั้งค่า', icon: Settings },
      { type: 'link', href: '/admin/system', label: 'ระบบ', icon: Server, exact: true },
      { type: 'link', href: '/admin/system-health', label: 'สถานะ', icon: FileText },
      { type: 'link', href: '/admin/system-jobs', label: 'งานเบื้องหลัง', icon: Cpu },
    ],
  },
];

// ── Active check ──────────────────────────────────────────────────────────
function isActive(pathname: string | null, item: NavLink): boolean {
  if (item.exact) return pathname === item.href || pathname === item.href + '/';
  return pathname?.startsWith(item.href) ?? false;
}

// Helper to render dynamic icon as component (needed for JSX tag expressions)
function IconComponent({ icon, size, strokeWidth, className }: { icon: React.ElementType; size: number; strokeWidth?: number; className?: string }) {
  const Icon = icon;
  return <Icon size={size} strokeWidth={strokeWidth ?? 1.8} className={className} />;
}

// ── Tooltip for icon-only nav ─────────────────────────────────────────────
function Tooltip({ label, side = 'right' }: { label: string; side?: 'right' | 'bottom' }) {
  return (
    <div
      className={`absolute z-50 px-2.5 py-1.5 rounded-lg bg-[var(--sidebar-bg)] text-[var(--sidebar-text-active)] text-xs font-medium whitespace-nowrap shadow-xl pointer-events-none
        ${side === 'right' ? 'left-full ml-3 top-1/2 -translate-y-1/2' : 'top-full mt-2 left-1/2 -translate-x-1/2'}
        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 delay-75`}
    >
      {label}
      {side === 'right' && (
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[var(--sidebar-bg)]" />
      )}
      {side === 'bottom' && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[var(--sidebar-bg)]" />
      )}
    </div>
  );
}

// ── Icon-only single nav link ─────────────────────────────────────────────
function IconNavItem({
  item,
  pathname,
}: {
  item: NavLink;
  pathname: string | null;
}) {
  const active = isActive(pathname, item);
  return (
    <div className="relative group">
      <Link
        href={item.href}
        className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200
          ${active
            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
            : 'text-[var(--color-text-3)] hover:bg-[var(--color-surface)]/10 hover:text-[var(--color-text-2)]'
          }`}
        title={item.label}
      >
        <IconComponent icon={item.icon} size={18} strokeWidth={active ? 2.2 : 1.8} />
      </Link>
      <Tooltip label={item.label} />
    </div>
  );
}

// ── Icon-only collapsible group ───────────────────────────────────────────
function IconNavGroup({
  group,
  pathname,
}: {
  group: Extract<NavItem, { type: 'group' }>;
  pathname: string | null;
}) {
  const hasActiveChild = group.items.some((item) => isActive(pathname, item));
  const [open, setOpen] = useState(group.defaultOpen ?? false);
  const activeItem = group.items.find((item) => isActive(pathname, item));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200
          ${hasActiveChild ? 'text-indigo-400' : 'text-[var(--color-text-3)] hover:bg-[var(--color-surface)]/10 hover:text-[var(--color-text-2)]'}`}
        title={group.label}
      >
        {activeItem ? (
          <IconComponent icon={activeItem.icon} size={18} strokeWidth={hasActiveChild ? 2.2 : 1.8} />
        ) : (
          <IconComponent icon={group.items[0].icon} size={18} />
        )}
        {/* Expand indicator */}
        <span className={`absolute bottom-1 right-1 text-[8px] transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
      <Tooltip label={group.label} />

      {/* Desktop: floating dropdown panel */}
      {open && (
        <div className="absolute left-full top-0 ml-2 z-50 bg-[var(--sidebar-bg)] rounded-xl border border-[var(--color-border)] shadow-2xl shadow-black/30 overflow-hidden min-w-[180px] animate-fade-in">
          <div className="px-3 py-2.5 border-b border-[var(--color-border)]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-3)]">{group.label}</span>
          </div>
          {group.items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium transition-colors
                  ${active
                    ? 'bg-indigo-600 text-white'
                    : 'text-[var(--color-text-3)] hover:bg-[var(--color-surface)]/5 hover:text-[var(--color-text-2)]'
                  }`}
              >
                <IconComponent icon={item.icon} size={15} strokeWidth={active ? 2.2 : 1.8} className={active ? 'text-white' : 'text-[var(--color-text-3)]'} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Mobile Nav Group (hook-safe: state at component level) ────────────────
function MobileNavGroup({
  group,
  pathname,
  onClose,
}: {
  group: Extract<NavItem, { type: 'group' }>;
  pathname: string | null;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(group.defaultOpen ?? false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)] hover:text-[var(--color-text-2)] transition-colors"
      >
        <span>{group.label}</span>
        <span className={`transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}>▾</span>
      </button>
      {open && (
        <div className="ml-3 space-y-0.5">
          {group.items.map((subItem) => {
            const active = isActive(pathname, subItem);
            return (
              <Link
                key={subItem.href}
                href={subItem.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors
                  ${active
                    ? 'bg-indigo-600 text-white'
                    : 'text-[var(--color-text-3)] hover:bg-[var(--color-surface)]/5 hover:text-[var(--color-text-2)]'
                  }`}
              >
                <subItem.icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                {subItem.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Icon-only Sidebar ────────────────────────────────────────────────────
function IconSidebar({ pathname }: { pathname: string | null }) {
  return (
    <div className="w-16 flex flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-text-active)] h-full">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-[var(--color-border)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
          <Building2 size={18} className="text-white" strokeWidth={2.5} />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 flex flex-col items-center space-y-1">
        {nav.map((item, idx) => {
          if (item.type === 'link') {
            return <IconNavItem key={item.href} item={item} pathname={pathname} />;
          }
          return <IconNavGroup key={idx} group={item} pathname={pathname} />;
        })}
      </nav>
    </div>
  );
}

// ── Modern Top Bar ─────────────────────────────────────────────────────────
function TopBar({
  pathname,
  onMobileMenuToggle,
}: {
  pathname: string | null;
  onMobileMenuToggle: () => void;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Mock search results
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    // In production, call an API. For now we simulate results.
  };

  const notificationCount = 3;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-sm px-4 md:px-6 gap-4">
      {/* Left: hamburger + logo + page title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenuToggle}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-[var(--color-text-2)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition-colors md:hidden flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Brand */}
        <Link href="/admin/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
            <Building2 size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="hidden lg:block">
            <div className="text-sm font-semibold text-[var(--color-text)] leading-tight tracking-tight">Apartment ERP</div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-3)]">Console</div>
          </div>
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-[var(--color-border)] hidden md:block" />

        {/* Page title */}
        <span className="text-sm font-medium text-[var(--color-text)] truncate">{getPageTitle(pathname)}</span>
      </div>

      {/* Center: Global Search */}
      <div ref={searchRef} className="flex-1 max-w-sm md:max-w-md relative mx-auto">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] pointer-events-none" />
          <input
            type="text"
            placeholder="ค้นหาห้อง, ผู้เช่า, ใบแจ้งหนี้..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setShowSearch(true)}
            onBlur={() => setTimeout(() => setShowSearch(false), 150)}
            className="w-full h-9 pl-9 pr-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-3)] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
        </div>

        {/* Search results dropdown */}
        {showSearch && searchQuery.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-xl shadow-[var(--shadow-md)] overflow-hidden z-50">
            {[
              { type: 'room', id: '101', label: 'ห้อง 101', icon: '📦' },
              { type: 'room', id: '202', label: 'ห้อง 202', icon: '📦' },
              { type: 'tenant', id: 't1', label: 'นายสมชาย ใจดี', icon: '👤' },
              { type: 'invoice', id: 'inv-001', label: 'ใบแจ้งหนี้ #INV-001', icon: '📄' },
            ]
              .filter((r) => r.label.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((r, i) => (
                <button
                  key={i}
                  onMouseDown={() => {
                    setSearchQuery('');
                    setShowSearch(false);
                    router.push(`/admin/${r.type === 'room' ? 'rooms' : r.type === 'tenant' ? 'tenants' : 'invoices'}/${r.id}`);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors border-b border-[var(--color-border)] last:border-0"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">{r.icon}</span>
                  <span>{r.label}</span>
                  <span className="ml-auto text-xs text-[var(--color-text-3)] capitalize">{r.type === 'invoice' ? 'ใบแจ้งหนี้' : r.type}</span>
                </button>
              ))}
          </div>
        )}
        {showSearch && searchQuery.trim().length >= 2 && !['ห้อง 101', 'ห้อง 202', 'นายสมชาย ใจดี', 'ใบแจ้งหนี้ #INV-001'].some((r) => r.includes(searchQuery)) && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-xl shadow-[var(--shadow-md)] p-4 text-center text-sm text-[var(--color-text-3)] z-50">
            ไม่พบผลลัพธ์สำหรับ &quot;{searchQuery}&quot;
          </div>
        )}
      </div>

      {/* Right: theme toggle + notifications + user */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <ThemeToggle className="flex items-center justify-center w-9 h-9 rounded-xl text-[var(--color-text-3)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition-colors" />

        <div className="h-4 w-px bg-[var(--color-border)] hidden sm:block" />

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl text-[var(--color-text-3)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Notifications"
          >
            <BellIcon size={20} />
            {notificationCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {notificationCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-xl shadow-[var(--shadow-md)] overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
                <span className="text-sm font-semibold text-[var(--color-text)]">การแจ้งเตือน</span>
                <button className="text-xs text-indigo-600 hover:text-indigo-700">ดูทั้งหมด</button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)]">
                {[
                  { id: 1, title: 'มีผู้เช่าใหม่ลงทะเบียน', time: '5 นาทีที่แล้ว', read: false },
                  { id: 2, title: 'ห้อง 305 ค้างชำระ 15 วัน', time: '1 ชั่วโมงที่แล้ว', read: false },
                  { id: 3, title: 'สร้างเอกสารสำเร็จ', time: '2 ชั่วโมงที่แล้ว', read: true },
                ].map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-[var(--color-bg)] transition-colors cursor-pointer ${!n.read ? 'bg-indigo-50/40' : ''}`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${n.read ? 'bg-[var(--color-bg)]' : 'bg-indigo-100'}`}>
                      <BellIcon size={14} className={n.read ? 'text-[var(--color-text-3)]' : 'text-indigo-600'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-text)]">{n.title}</p>
                      <p className="text-xs text-[var(--color-text-3)] mt-0.5">{n.time}</p>
                    </div>
                    {!n.read && <div className="h-2 w-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User avatar + dropdown */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-[var(--color-surface)] transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
              <span className="text-xs font-semibold text-white">O</span>
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm font-medium text-[var(--color-text)] leading-tight">ผู้ดูแลระบบ</div>
              <div className="text-xs text-[var(--color-text-3)]">เจ้าของ</div>
            </div>
            <ChevronDown size={14} className="text-[var(--color-text-3)] hidden md:block" />
          </button>

          {showUserMenu && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-xl shadow-[var(--shadow-md)] overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-[var(--color-border)]">
                <p className="text-sm font-medium text-[var(--color-text)]">ผู้ดูแลระบบ</p>
                <p className="text-xs text-[var(--color-text-3)]">owner@apartment.com</p>
              </div>
              <div className="py-1">
                <Link
                  href="/admin/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
                >
                  <Settings size={16} className="text-[var(--color-text-3)]" />
                  ตั้งค่า
                </Link>
                <LogoutButton />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Main Layout ────────────────────────────────────────────────────────────
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex">
      {/* ── Desktop Icon-only Sidebar (fixed, doesn't push content) ── */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 z-20 w-16 flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-text-active)]">
        <IconSidebar pathname={pathname} />
      </aside>

      {/* ── Mobile Sidebar Drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-[var(--sidebar-bg)]/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-text-active)] md:hidden"
            >
              {/* Mobile drawer header */}
              <div className="flex items-center justify-between px-4 h-16 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
                    <Building2 size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--sidebar-text-active)] leading-tight tracking-tight">Apartment ERP</div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-3)]">Console</div>
                  </div>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center w-9 h-9 rounded-xl text-[var(--color-text-3)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--color-surface)]/10 transition-colors"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Mobile nav content */}
              <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
                {nav.map((item, idx) => {
                  if (item.type === 'link') {
                    const active = isActive(pathname, item as NavLink);
                    return (
                      <Link
                        key={(item as NavLink).href}
                        href={(item as NavLink).href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors
                          ${active
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                            : 'text-[var(--color-text-3)] hover:bg-[var(--color-surface)]/5 hover:text-[var(--color-text-2)]'
                          }`}
                      >
                        <IconComponent icon={(item as NavLink).icon} size={18} strokeWidth={active ? 2.2 : 1.8} />
                        {(item as NavLink).label}
                      </Link>
                    );
                  }

                  return (
                    <MobileNavGroup
                      key={idx}
                      group={item as Extract<NavItem, { type: 'group' }>}
                      pathname={pathname}
                      onClose={() => setMobileOpen(false)}
                    />
                  );
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Content Area (flex-1, sidebar doesn't push) ── */}
      <div className="relative flex min-w-0 flex-col flex-1 md:ml-16">
        {/* Top Bar */}
        <TopBar pathname={pathname} onMobileMenuToggle={() => setMobileOpen(true)} />

        {/* Page content */}
        <main className="flex-1">
          <ErrorBoundary>
            <ToastProvider>
              <QueryProvider>
                <ThemeProvider>
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
                </ThemeProvider>
              </QueryProvider>
            </ToastProvider>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}