'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  Clock,
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
  { prefix: '/admin/moveouts', label: 'ย้ายออก' },
  { prefix: '/admin/billing', label: 'รอบบิล' },
  { prefix: '/admin/billing/import', label: 'นำเข้าข้อมูลบิล' },
  { prefix: '/admin/billing/batches', label: 'ชุดข้อมูลบิล' },
  { prefix: '/admin/invoices', label: 'ใบแจ้งหนี้' },
  { prefix: '/admin/late-fees', label: 'ค่าปรับล่าช้า' },
  { prefix: '/admin/payments', label: 'ชำระเงิน' },
  { prefix: '/admin/payments/upload-statement', label: 'อัปโหลด Statement' },
  { prefix: '/admin/payments/review', label: 'ตรวจสอบการชำระเงิน' },
  { prefix: '/admin/payments/review-match', label: 'ตรวจสอบการจับคู่' },
  { prefix: '/admin/overdue', label: 'ค้างชำระ' },
  { prefix: '/admin/expenses', label: 'ค่าใช้จ่าย' },
  { prefix: '/admin/chat', label: 'แชท' },
  { prefix: '/admin/message-templates', label: 'เทมเพลตข้อความ' },
  { prefix: '/admin/broadcast', label: 'ประกาศ' },
  { prefix: '/admin/maintenance', label: 'แจ้งซ่อม' },
  { prefix: '/admin/templates', label: 'เทมเพลต' },
  { prefix: '/admin/documents/generate', label: 'สร้างเอกสาร' },
  { prefix: '/admin/documents', label: 'เอกสาร' },
  { prefix: '/admin/deliveries', label: 'ส่ง LINE' },
  { prefix: '/admin/analytics', label: 'Analytics' },
  { prefix: '/admin/reports', label: 'รายงาน' },
  { prefix: '/admin/reports/profit-loss', label: 'รายงานกำไร/ขาดทุน' },
  { prefix: '/admin/audit-logs', label: 'ประวัติกิจกรรม' },
  { prefix: '/admin/settings', label: 'ตั้งค่า' },
  { prefix: '/admin/settings/users', label: 'ตั้งค่า — ผู้ใช้' },
  { prefix: '/admin/settings/roles', label: 'ตั้งค่า — บทบาท' },
  { prefix: '/admin/settings/building', label: 'ตั้งค่า — อาคาร' },
  { prefix: '/admin/settings/billing-policy', label: 'ตั้งค่า — บิลลิ่ง' },
  { prefix: '/admin/settings/bank-accounts', label: 'ตั้งค่า — บัญชีธนาคาร' },
  { prefix: '/admin/settings/automation', label: 'ตั้งค่า — อัตโนมัติ' },
  { prefix: '/admin/settings/integrations', label: 'ตั้งค่า — LINE' },
  { prefix: '/admin/system-health', label: 'สถานะระบบ' },
  { prefix: '/admin/system-jobs', label: 'งานเบื้องหลัง' },
  { prefix: '/admin/outbox', label: 'Dead-Letter Queue' },
];

// Sort most-specific first so /admin/billing/import wins over /admin/billing
const PAGE_TITLES_SORTED = [...PAGE_TITLES].sort((a, b) => b.prefix.length - a.prefix.length);

function getPageTitle(pathname: string | null): string {
  if (!pathname) return 'Apartment ERP';
  for (const { prefix, label } of PAGE_TITLES_SORTED) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return label;
    }
  }
  return 'Apartment ERP';
}

// ── Icon-only nav items ────────────────────────────────────────────────────
// 7 groups — กระชับพอดี: ห้องพัก | บิล | การเงิน | เอกสาร | สื่อสาร | รายงาน | ตั้งค่า
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
    type: 'group', label: 'บิล', defaultOpen: false, items: [
      { type: 'link', href: '/admin/billing', label: 'รอบบิล', icon: Receipt },
      { type: 'link', href: '/admin/invoices', label: 'ใบแจ้งหนี้', icon: ScrollText },
      { type: 'link', href: '/admin/billing/import', label: 'นำเข้าข้อมูล', icon: Upload },
      { type: 'link', href: '/admin/billing/batches', label: 'ชุดข้อมูล', icon: Layers },
    ],
  },

  {
    type: 'group', label: 'การเงิน', defaultOpen: false, items: [
      { type: 'link', href: '/admin/payments', label: 'ชำระเงิน', icon: CreditCard },
      { type: 'link', href: '/admin/overdue', label: 'ค้างชำระ', icon: AlertTriangle },
      { type: 'link', href: '/admin/late-fees', label: 'ค่าปรับล่าช้า', icon: Clock },
      { type: 'link', href: '/admin/expenses', label: 'ค่าใช้จ่าย', icon: PieChart },
    ],
  },

  {
    type: 'group', label: 'เอกสาร', defaultOpen: false, items: [
      { type: 'link', href: '/admin/templates', label: 'เทมเพลต', icon: FilePlus },
      { type: 'link', href: '/admin/documents', label: 'เอกสารที่สร้าง', icon: Layers, exact: true },
      { type: 'link', href: '/admin/documents/generate', label: 'สร้างเอกสาร', icon: FileText },
      { type: 'link', href: '/admin/deliveries', label: 'ส่ง LINE', icon: Send },
    ],
  },

  {
    type: 'group', label: 'สื่อสาร', defaultOpen: false, items: [
      { type: 'link', href: '/admin/chat', label: 'แชท', icon: MessageSquare },
      { type: 'link', href: '/admin/message-templates', label: 'เทมเพลตข้อความ', icon: FileEdit },
      { type: 'link', href: '/admin/broadcast', label: 'ประกาศ', icon: Bell },
      { type: 'link', href: '/admin/maintenance', label: 'แจ้งซ่อม', icon: Wrench },
    ],
  },

  {
    type: 'group', label: 'รายงาน', defaultOpen: false, items: [
      { type: 'link', href: '/admin/analytics', label: 'Analytics', icon: PieChart },
      { type: 'link', href: '/admin/reports', label: 'รายงาน', icon: FileBarChart },
      { type: 'link', href: '/admin/audit-logs', label: 'ประวัติกิจกรรม', icon: ClipboardList },
    ],
  },

  {
    type: 'group', label: 'ตั้งค่า', defaultOpen: false, items: [
      { type: 'link', href: '/admin/settings', label: 'ภาพรวม', icon: Settings, exact: true },
      { type: 'link', href: '/admin/settings/users', label: 'ผู้ใช้', icon: Users },
      { type: 'link', href: '/admin/settings/building', label: 'อาคาร', icon: Building2 },
      { type: 'link', href: '/admin/settings/billing-policy', label: 'บิลลิ่ง', icon: Receipt },
      { type: 'link', href: '/admin/settings/bank-accounts', label: 'บัญชีธนาคาร', icon: CreditCard },
      { type: 'link', href: '/admin/settings/automation', label: 'อัตโนมัติ', icon: Cpu },
      { type: 'link', href: '/admin/settings/integrations', label: 'LINE', icon: MessageSquare },
      { type: 'link', href: '/admin/system-health', label: 'สถานะระบบ', icon: Server },
      { type: 'link', href: '/admin/outbox', label: 'DLQ', icon: AlertTriangle },
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
      className={`absolute z-50 px-2.5 py-1.5 rounded-lg bg-sidebar-bg text-sidebar-text-active text-xs font-medium whitespace-nowrap shadow-xl pointer-events-none
        ${side === 'right' ? 'left-full ml-3 top-1/2 -translate-y-1/2' : 'top-full mt-2 left-1/2 -translate-x-1/2'}
        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 delay-75`}
    >
      {label}
      {side === 'right' && (
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-sidebar-bg" />
      )}
      {side === 'bottom' && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-sidebar-bg" />
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
      <motion.div
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      >
        <Link
          href={item.href}
          className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors duration-150
            ${active
              ? 'text-white'
              : 'text-color-text-3 hover:bg-white/5 hover:text-color-text-2'
            }`}
          title={item.label}
        >
          {active && (
            <motion.span
              layoutId="sidebar-active-pill"
              className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/40"
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">
            <IconComponent icon={item.icon} size={18} strokeWidth={active ? 2.2 : 1.8} />
          </span>
        </Link>
      </motion.div>
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
  const activeItem = group.items.find((item) => isActive(pathname, item));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setIsMounted(true); return () => { if (hideTimer.current) clearTimeout(hideTimer.current); }; }, []);

  // Called only from the TRIGGER div — opens dropdown and positions it
  function openDropdown() {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.top });
    }
  }

  // Called from DROPDOWN div — just cancel the pending close, don't re-render
  function keepOpen() {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }

  function hideDropdown() {
    // 200ms delay — enough to cross the 8px gap AND move between items
    hideTimer.current = setTimeout(() => setDropdownPos(null), 200);
  }

  const SIDEBAR_LEFT = 72; // 64px sidebar + 8px gap

  const dropdown = isMounted && dropdownPos
    ? createPortal(
        <div
          style={{ position: 'fixed', top: dropdownPos.top, left: SIDEBAR_LEFT, zIndex: 9999 }}
          className="bg-sidebar-bg rounded-xl border border-color-border shadow-2xl shadow-black/30 overflow-y-auto max-h-[80vh] min-w-[180px]"
          onMouseEnter={keepOpen}
          onMouseLeave={hideDropdown}
        >
          <div className="px-3 py-2.5 border-b border-color-border">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-sidebar-text">{group.label}</span>
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
                    : 'text-sidebar-text hover:bg-white/5 hover:text-white'
                  }`}
              >
                <IconComponent icon={item.icon} size={15} strokeWidth={active ? 2.2 : 1.8} className={active ? 'text-white' : 'text-sidebar-text'} />
                {item.label}
              </Link>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <div
      className="relative"
      onMouseEnter={openDropdown}
      onMouseLeave={hideDropdown}
    >
      <motion.button
        ref={triggerRef}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 26 }}
        className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors duration-150
          ${hasActiveChild ? 'text-white' : 'text-sidebar-text hover:bg-white/5 hover:text-white'}`}
        title={group.label}
      >
        {hasActiveChild && (
          <motion.span
            layoutId="sidebar-active-pill"
            className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/40"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          />
        )}
        <span className="relative z-10">
          {activeItem ? (
            <IconComponent icon={activeItem.icon} size={18} strokeWidth={hasActiveChild ? 2.2 : 1.8} />
          ) : (
            <IconComponent icon={group.items[0].icon} size={18} />
          )}
        </span>
        <span className={`absolute z-10 bottom-1 right-1 text-[8px] transition-transform duration-200 ${dropdownPos ? 'rotate-90' : ''} ${hasActiveChild ? 'text-white/80' : 'text-color-text-3'}`}>
          ▶
        </span>
      </motion.button>
      {dropdown}
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
        className="flex w-full items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-color-text-3 hover:text-color-text-2 transition-colors"
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
                    : 'text-color-text-3 hover:bg-color-surface/5 hover:text-color-text-2'
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
    <div className="w-16 flex flex-col bg-sidebar-bg text-sidebar-text-active h-full">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-color-border">
        <motion.div
          whileHover={{ rotate: -8, scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/40 ring-1 ring-white/20"
        >
          <Building2 size={18} className="text-white relative z-10" strokeWidth={2.5} />
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
        </motion.div>
      </div>

      <nav className="flex-1 py-4 px-2 flex flex-col items-center space-y-1">
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Global "/" shortcut → focus the search input
  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      searchInputRef.current?.focus();
      setShowSearch(true);
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

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

  // Real global search
  const [searchResults, setSearchResults] = useState<{
    rooms: Array<{ roomNo: string; floorNo: number | null; roomStatus: string }>;
    tenants: Array<{ id: string; firstName: string; lastName: string; phone: string | null; email: string | null }>;
    invoices: Array<{ id: string; roomNo: string; year: number; month: number; status: string }>;
  } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.data ?? null);
        }
      } catch {
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const [notifLoading, setNotifLoading] = useState(true);
  const [notifications, setNotifications] = useState<Array<{ id: string; content: string; type: string; roomNo: string; createdAt: string; status: string }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch('/api/notifications?limit=20&unreadOnly=true');
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.data?.notifications ?? []);
          setUnreadCount(data.data?.unreadCount ?? 0);
        }
      } catch {
        // silently fail
      } finally {
        setNotifLoading(false);
      }
    }
    fetchNotifications();
  }, []);

  function formatNotifTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'เพิ่งจะ';
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} วันที่แล้ว`;
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-color-border bg-color-surface/80 backdrop-blur-xl backdrop-saturate-150 px-4 md:px-6 gap-4">
      {/* Left: hamburger + logo + page title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenuToggle}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-color-text-2 hover:bg-color-surface hover:text-color-text transition-colors md:hidden flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Brand */}
        <Link href="/admin/dashboard" className="flex items-center gap-2.5 flex-shrink-0 group">
          <motion.div
            whileHover={{ rotate: -6, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/40 ring-1 ring-white/20"
          >
            <Building2 size={16} className="text-white" strokeWidth={2.5} />
          </motion.div>
          <div className="hidden lg:block">
            <div className="text-sm font-semibold leading-tight tracking-tight gradient-text">Apartment ERP</div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-color-text-3">Console</div>
          </div>
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-color-border hidden md:block" />

        {/* Page title — animates on route change */}
        <AnimatePresence mode="wait">
          <motion.span
            key={pathname}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="text-sm font-medium text-color-text truncate"
          >
            {getPageTitle(pathname)}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Center: Global Search */}
      <div ref={searchRef} className="flex-1 max-w-sm md:max-w-md relative mx-auto">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-color-text-3 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="ค้นหาห้อง, ผู้เช่า, ใบแจ้งหนี้..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setShowSearch(true)}
            onBlur={() => setTimeout(() => setShowSearch(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowSearch(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="ค้นหาทั่วระบบ (กด / เพื่อโฟกัส)"
            className="w-full h-9 pl-9 pr-12 rounded-xl border border-color-border bg-color-bg text-sm text-color-text placeholder:text-color-text-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          {/* Keyboard hint */}
          <kbd className="pointer-events-none hidden md:flex absolute right-2.5 top-1/2 -translate-y-1/2 h-5 items-center rounded border border-color-border bg-color-surface px-1.5 text-[10px] font-medium text-color-text-3">
            /
          </kbd>
        </div>

        {/* Search results dropdown */}
        {showSearch && searchQuery.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-color-surface rounded-xl border border-color-border shadow-xl shadow-app-md overflow-hidden z-50">
            {searchLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            ) : searchResults ? (
              (searchResults.rooms.length === 0 && searchResults.tenants.length === 0 && searchResults.invoices.length === 0) ? (
                <div className="py-6 text-center text-sm text-color-text-3">ไม่พบผลลัพธ์สำหรับ &quot;{searchQuery}&quot;</div>
              ) : (
                <>
                  {searchResults.rooms.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-color-text-3 border-b border-color-border">ห้องพัก</div>
                      {searchResults.rooms.map((r) => (
                        <button
                          key={r.roomNo}
                          onMouseDown={() => { setSearchQuery(''); setShowSearch(false); router.push(`/admin/rooms?roomNo=${r.roomNo}`); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-color-text hover:bg-color-bg transition-colors border-b border-color-border last:border-0"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><DoorOpen size={14} /></span>
                          <span>ห้อง {r.roomNo}</span>
                          <span className="ml-auto text-xs text-color-text-3">ชั้น {r.floorNo}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.tenants.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-color-text-3 border-b border-color-border">ผู้เช่า</div>
                      {searchResults.tenants.map((t) => (
                        <button
                          key={t.id}
                          onMouseDown={() => { setSearchQuery(''); setShowSearch(false); router.push(`/admin/tenants/${t.id}`); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-color-text hover:bg-color-bg transition-colors border-b border-color-border last:border-0"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 text-green-600"><Users size={14} /></span>
                          <span>{t.firstName} {t.lastName}</span>
                          <span className="ml-auto text-xs text-color-text-3">{t.phone ?? t.email ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.invoices.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-color-text-3 border-b border-color-border">ใบแจ้งหนี้</div>
                      {searchResults.invoices.map((inv) => (
                        <button
                          key={inv.id}
                          onMouseDown={() => { setSearchQuery(''); setShowSearch(false); router.push(`/admin/invoices/${inv.id}`); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-color-text hover:bg-color-bg transition-colors border-b border-color-border last:border-0"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600"><ScrollText size={14} /></span>
                          <span>ห้อง {inv.roomNo} · {inv.month}/{inv.year}</span>
                          <span className="ml-auto text-xs text-color-text-3">{inv.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )
            ) : null}
          </div>
        )}
      </div>

      {/* Right: theme toggle + notifications + user */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <ThemeToggle className="flex items-center justify-center w-9 h-9 rounded-xl text-color-text-3 hover:bg-color-surface hover:text-color-text transition-colors" />

        <div className="h-4 w-px bg-color-border hidden sm:block" />

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl text-color-text-3 hover:bg-color-surface hover:text-color-text transition-colors"
            aria-label="Notifications"
          >
            <BellIcon size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-color-surface rounded-xl border border-color-border shadow-xl shadow-app-md overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-color-border">
                <span className="text-sm font-semibold text-color-text">การแจ้งเตือน</span>
                <button className="text-xs text-indigo-600 hover:text-indigo-700">ดูทั้งหมด</button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-color-border">
                {notifLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <BellIcon size={24} className="text-color-text-3" />
                    <p className="text-sm text-color-text-3">ไม่มีการแจ้งเตือน</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-color-bg transition-colors cursor-pointer ${n.status !== 'SENT' && n.status !== 'CANCELLED' ? 'bg-indigo-50/40' : ''}`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${n.status !== 'SENT' && n.status !== 'CANCELLED' ? 'bg-indigo-100' : 'bg-color-bg'}`}>
                        <BellIcon size={14} className={n.status !== 'SENT' && n.status !== 'CANCELLED' ? 'text-indigo-600' : 'text-color-text-3'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-color-text">{n.content}</p>
                        <p className="text-xs text-color-text-3 mt-0.5">{n.roomNo ? `ห้อง ${n.roomNo} · ` : ''}{formatNotifTime(n.createdAt)}</p>
                      </div>
                      {n.status !== 'SENT' && n.status !== 'CANCELLED' && <div className="h-2 w-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar + dropdown */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-color-surface transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
              <span className="text-xs font-semibold text-white">O</span>
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm font-medium text-color-text leading-tight">ผู้ดูแลระบบ</div>
              <div className="text-xs text-color-text-3">เจ้าของ</div>
            </div>
            <ChevronDown size={14} className="text-color-text-3 hidden md:block" />
          </button>

          {showUserMenu && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-color-surface rounded-xl border border-color-border shadow-xl shadow-app-md overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-color-border">
                <p className="text-sm font-medium text-color-text">ผู้ดูแลระบบ</p>
                <p className="text-xs text-color-text-3">owner@apartment.com</p>
              </div>
              <div className="py-1">
                <Link
                  href="/admin/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-color-text hover:bg-color-bg transition-colors"
                >
                  <Settings size={16} className="text-color-text-3" />
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

  // Sync the browser tab title to the current page
  useEffect(() => {
    const title = getPageTitle(pathname);
    if (typeof document !== 'undefined') {
      document.title = title === 'Apartment ERP' ? title : `${title} · Apartment ERP`;
    }
  }, [pathname]);

  return (
    <ThemeProvider>
    <div className="min-h-screen bg-color-bg flex">
      {/* ── Desktop Icon-only Sidebar (fixed, doesn't push content) ── */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 z-20 w-16 flex-col bg-sidebar-bg text-sidebar-text-active">
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
              className="fixed inset-0 bg-sidebar-bg/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-sidebar-bg text-sidebar-text-active md:hidden"
            >
              {/* Mobile drawer header */}
              <div className="flex items-center justify-between px-4 h-16 border-b border-color-border">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
                    <Building2 size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-sidebar-text-active leading-tight tracking-tight">Apartment ERP</div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-color-text-3">Console</div>
                  </div>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center w-9 h-9 rounded-xl text-color-text-3 hover:text-sidebar-text-active hover:bg-color-surface/10 transition-colors"
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
                            : 'text-color-text-3 hover:bg-color-surface/5 hover:text-color-text-2'
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
                <AnimatePresence mode="wait">
                  <motion.div
                    key={pathname}
                    initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                    transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
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
    </ThemeProvider>
  );
}