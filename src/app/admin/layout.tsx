'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

import { motion, AnimatePresence } from 'framer-motion';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ThemeToggle } from '@/components/providers/ThemeToggle';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import {
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
  Command,
  Shield,
  Files,
  BookOpen,
  Book,
  Building2,
  Landmark,
  AlarmClock,
  Mail,
  Radio,
  MessageCircle,
  UserCircle,
  TrendingUp,
  BarChart3,
  PiggyBank,
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
  { prefix: '/admin/overdue', label: 'ค้างชำระ' },
  { prefix: '/admin/expenses', label: 'ค่าใช้จ่าย' },
  { prefix: '/admin/chat', label: 'แชท' },
  { prefix: '/admin/message-templates', label: 'เทมเพลตข้อความ' },
  { prefix: '/admin/broadcast', label: 'ประกาศ' },
  { prefix: '/admin/notifications', label: 'แจ้งเตือน' },
  { prefix: '/admin/maintenance', label: 'แจ้งซ่อม' },
  { prefix: '/admin/templates', label: 'เทมเพลต' },
  { prefix: '/admin/documents/generate', label: 'สร้างเอกสาร' },
  { prefix: '/admin/documents', label: 'เอกสาร' },
  { prefix: '/admin/deliveries', label: 'ส่ง LINE' },
  { prefix: '/admin/analytics', label: 'วิเคราะห์' },
  { prefix: '/admin/reports', label: 'รายงาน' },
  { prefix: '/admin/reports/profit-loss', label: 'รายงานกำไร/ขาดทุน' },
  { prefix: '/admin/audit-logs', label: 'ประวัติกิจกรรม' },
  { prefix: '/admin/settings', label: 'ตั้งค่า' },
  { prefix: '/admin/settings/users', label: 'ตั้งค่า — ผู้ใช้' },
  { prefix: '/admin/settings/building', label: 'ตั้งค่า — อาคาร' },
  { prefix: '/admin/settings/billing-policy', label: 'ตั้งค่า — บิลลิ่ง' },
  { prefix: '/admin/settings/bank-accounts', label: 'ตั้งค่า — บัญชีธนาคาร' },
  { prefix: '/admin/settings/automation', label: 'ตั้งค่า — อัตโนมัติ' },
  { prefix: '/admin/settings/integrations', label: 'ตั้งค่า — LINE' },
  { prefix: '/admin/settings/reminders', label: 'ตั้งค่า — เตือนชำระ' },
  { prefix: '/admin/settings/billing-rules', label: 'ตั้งค่า — กฏบิล' },
  { prefix: '/admin/settings/roles', label: 'ตั้งค่า — สิทธิ์' },
  { prefix: '/admin/system', label: 'ระบบ' },
  { prefix: '/admin/system-health', label: 'สถานะระบบ' },
  { prefix: '/admin/system-jobs', label: 'งานเบื้องหลัง' },
  { prefix: '/admin/outbox', label: 'Dead-Letter Queue' },
  { prefix: '/admin/docs', label: 'คู่มือ' },
  { prefix: '/admin/settings/account', label: 'บัญชีของฉัน' },
  { prefix: '/admin/settings/rooms', label: 'ตั้งค่า — ห้องพัก' },
  { prefix: '/admin/settings/staff-requests', label: 'ตั้งค่า — คำขอผู้ใช้' },
  { prefix: '/admin/reports/collections', label: 'รายงาน — สะสมเงิน' },
  { prefix: '/admin/reports/documents', label: 'รายงาน — เอกสาร' },
  { prefix: '/admin/reports/occupancy', label: 'รายงาน — ความเข้าพัก' },
  { prefix: '/admin/reports/revenue', label: 'รายงาน — รายได้' },
  { prefix: '/admin/reports/audit', label: 'รายงาน — ประวัติกิจกรรม' },
  { prefix: '/admin/login', label: 'เข้าสู่ระบบ' },
];

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

// ── Nav structure ─────────────────────────────────────────────────────────
const nav: NavItem[] = [
  { type: 'link', href: '/admin/dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },

  {
    type: 'group', label: 'ห้องพัก', defaultOpen: false, items: [
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
      { type: 'link', href: '/admin/late-fees', label: 'ค่าปรับล่าช้า', icon: Clock },
    ],
  },

  {
    type: 'group', label: 'การเงิน', defaultOpen: false, items: [
      { type: 'link', href: '/admin/payments', label: 'ชำระเงิน', icon: CreditCard },
      { type: 'link', href: '/admin/overdue', label: 'ค้างชำระ', icon: AlertTriangle },
      { type: 'link', href: '/admin/expenses', label: 'ค่าใช้จ่าย', icon: PieChart },
      { type: 'link', href: '/admin/settings/billing-policy', label: 'กติกาค่าบริการ', icon: BookOpen },
    ],
  },

  {
    type: 'group', label: 'เอกสาร', defaultOpen: false, items: [
      { type: 'link', href: '/admin/templates', label: 'เทมเพลต', icon: FilePlus },
      { type: 'link', href: '/admin/documents', label: 'เอกสารที่สร้าง', icon: Files },
      { type: 'link', href: '/admin/documents/generate', label: 'สร้างเอกสาร', icon: FileText },
      { type: 'link', href: '/admin/deliveries', label: 'ส่ง LINE', icon: Send },
      { type: 'link', href: '/admin/message-templates', label: 'เทมเพลตข้อความ', icon: Mail },
    ],
  },

  {
    type: 'group', label: 'สื่อสาร', defaultOpen: false, items: [
      { type: 'link', href: '/admin/chat', label: 'แชท', icon: MessageSquare },
      { type: 'link', href: '/admin/notifications', label: 'แจ้งเตือน', icon: Bell },
      { type: 'link', href: '/admin/broadcast', label: 'ประกาศ', icon: Radio },
      { type: 'link', href: '/admin/maintenance', label: 'แจ้งซ่อม', icon: Wrench },
    ],
  },

  {
    type: 'group', label: 'รายงาน', defaultOpen: false, items: [
      { type: 'link', href: '/admin/reports', label: 'ภาพรวม', icon: FileBarChart },
      { type: 'link', href: '/admin/reports/revenue', label: 'รายได้', icon: TrendingUp },
      { type: 'link', href: '/admin/reports/occupancy', label: 'ความเข้าพัก', icon: Building2 },
      { type: 'link', href: '/admin/reports/profit-loss', label: 'กำไร/ขาดทุน', icon: BarChart3 },
      { type: 'link', href: '/admin/reports/collections', label: 'สะสมเงิน', icon: PiggyBank },
      { type: 'link', href: '/admin/reports/documents', label: 'เอกสาร', icon: FileText },
      { type: 'link', href: '/admin/audit-logs', label: 'ประวัติกิจกรรม', icon: ClipboardList },
    ],
  },

  {
    type: 'group', label: 'ระบบ', defaultOpen: false, items: [
      { type: 'link', href: '/admin/system-health', label: 'สถานะระบบ', icon: Server },
      { type: 'link', href: '/admin/system-jobs', label: 'งานเบื้องหลัง', icon: Cpu },
      { type: 'link', href: '/admin/system', label: 'ระบบ', icon: Command },
      { type: 'link', href: '/admin/outbox', label: 'DLQ', icon: AlertTriangle },
      { type: 'link', href: '/admin/docs', label: 'คู่มือ', icon: Book },
    ],
  },

  {
    type: 'group', label: 'ตั้งค่าบัญชี', defaultOpen: false, items: [
      { type: 'link', href: '/admin/settings/account', label: 'บัญชีของฉัน', icon: UserCircle },
      { type: 'link', href: '/admin/settings/users', label: 'ผู้ใช้', icon: Users },
      { type: 'link', href: '/admin/settings/roles', label: 'บทบาท', icon: Shield },
    ],
  },

  {
    type: 'group', label: 'ตั้งค่าระบบ', defaultOpen: false, items: [
      { type: 'link', href: '/admin/settings/building', label: 'อาคาร', icon: Building2 },
      { type: 'link', href: '/admin/settings/bank-accounts', label: 'บัญชีธนาคาร', icon: Landmark },
      { type: 'link', href: '/admin/settings/automation', label: 'อัตโนมัติ', icon: Cpu },
      { type: 'link', href: '/admin/settings/integrations', label: 'LINE', icon: MessageCircle },
      { type: 'link', href: '/admin/settings/reminders', label: 'เตือนชำระ', icon: AlarmClock },
      { type: 'link', href: '/admin/settings/billing-rules', label: 'กฏบิล', icon: ScrollText },
    ],
  },
];

// ── Active check ──────────────────────────────────────────────────────────
function isActive(pathname: string | null, item: NavLink): boolean {
  if (item.exact) return pathname === item.href || pathname === item.href + '/';
  return pathname?.startsWith(item.href) ?? false;
}

// ── Icon helper ───────────────────────────────────────────────────────────
function Icon({ icon, size = 18, strokeWidth = 1.8, className = '' }: { icon: React.ElementType; size?: number; strokeWidth?: number; className?: string }) {
  const I = icon;
  return <I size={size} strokeWidth={strokeWidth} className={className} />;
}

// ── Tooltip ──────────────────────────────────────────────────────────────
function Tooltip({ label, side = 'right' }: { label: string; side?: 'right' | 'bottom' }) {
  return (
    <div
      className={`absolute z-50 px-2.5 py-1.5 rounded-lg bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--sidebar-text-active))] text-xs font-medium whitespace-nowrap shadow-xl pointer-events-none
        ${side === 'right' ? 'left-full ml-3 top-1/2 -translate-y-1/2' : 'top-full mt-2 left-1/2 -translate-x-1/2'}
        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 delay-75`}
    >
      {label}
      {side === 'right' && (
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[hsl(var(--sidebar-bg))]" />
      )}
      {side === 'bottom' && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[hsl(var(--sidebar-bg))]" />
      )}
    </div>
  );
}

// ── Glass Sidebar Nav Item ───────────────────────────────────────────────
function SidebarNavItem({
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
          className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-150
            ${active
              ? 'text-white'
              : 'text-[hsl(var(--sidebar-text))] hover:bg-white/5 hover:text-[hsl(var(--sidebar-text-active))]'
            }`}
          title={item.label}
        >
          {active && (
            <motion.span
              layoutId="sidebar-active-pill"
              className="absolute inset-0 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary)/70)] shadow-[var(--glow-primary)]"
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">
            <Icon icon={item.icon} size={18} strokeWidth={active ? 2.2 : 1.8} />
          </span>
        </Link>
      </motion.div>
      <Tooltip label={item.label} />
    </div>
  );
}

// ── Glass Sidebar Collapsible Group ───────────────────────────────────────
function SidebarNavGroup({
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
  const [manualOpen, setManualOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setIsMounted(true); return () => { if (hideTimer.current) clearTimeout(hideTimer.current); }; }, []);

  const isOpen = dropdownPos !== null || manualOpen;

  function openDropdown() {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setManualOpen(true);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.top });
    }
  }

  function toggleDropdown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (isOpen) {
      setDropdownPos(null);
      setManualOpen(false);
    } else {
      openDropdown();
    }
  }

  function keepOpen() {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }

  function hideDropdown() {
    hideTimer.current = setTimeout(() => {
      setDropdownPos(null);
      setManualOpen(false);
    }, 200);
  }

  const SIDEBAR_LEFT = 72;

  const dropdown = isMounted && isOpen
    ? createPortal(
        <div
          style={{ position: 'fixed', top: dropdownPos?.top ?? 0, left: SIDEBAR_LEFT, zIndex: 9999 }}
          className="rounded-xl border border-white/10 bg-[hsl(var(--sidebar-bg))] shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden min-w-[220px]"
          onMouseEnter={keepOpen}
          onMouseLeave={hideDropdown}
        >
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-text))] opacity-60">{group.label}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setDropdownPos(null); setManualOpen(false); }}
              className="text-[hsl(var(--sidebar-text))] hover:text-white transition-colors p-0.5 rounded hover:bg-white/10"
              aria-label="ปิด"
            >
              <X size={12} />
            </button>
          </div>
          {group.items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { setDropdownPos(null); setManualOpen(false); }}
                className={`flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-all duration-150 border-l-2
                  ${active
                    ? 'bg-[hsl(var(--primary))]/20 text-white border-l-white'
                    : 'text-[hsl(var(--sidebar-text))] hover:bg-white/8 hover:text-white border-l-transparent'
                  }`}
              >
                <Icon icon={item.icon} size={15} strokeWidth={active ? 2.2 : 1.8} className={active ? 'text-white' : 'text-[hsl(var(--sidebar-text))]'} />
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
        onClick={toggleDropdown}
        className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors duration-150
          ${hasActiveChild ? 'text-white' : 'text-[hsl(var(--sidebar-text))] hover:bg-white/5 hover:text-[hsl(var(--sidebar-text-active))]'}`}
        title={group.label}
        aria-label={group.label}
      >
        {hasActiveChild && (
          <motion.span
            layoutId="sidebar-active-pill"
            className="absolute inset-0 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary)/70%)] shadow-[var(--glow-primary)]"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          />
        )}
        <span className="relative z-10">
          {activeItem ? (
            <Icon icon={activeItem.icon} size={18} strokeWidth={hasActiveChild ? 2.2 : 1.8} />
          ) : (
            <Icon icon={group.items[0].icon} size={18} />
          )}
        </span>
        <span className={`absolute z-10 bottom-0.5 right-0.5 text-[8px] transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} ${hasActiveChild ? 'text-white/80' : 'text-[hsl(var(--sidebar-text))]'}`}>
          ▶
        </span>
      </motion.button>
      {dropdown}
    </div>
  );
}

// ── Mobile Nav Group ─────────────────────────────────────────────────────
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
        className="flex w-full items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--color-text-3))] hover:text-[hsl(var(--color-text-2))] transition-colors"
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
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-150
                  ${active
                    ? 'bg-[hsl(var(--primary))] text-white shadow-[var(--glow-primary)]'
                    : 'text-[hsl(var(--color-text-3))] hover:bg-[hsl(var(--color-surface))/5 hover:text-[hsl(var(--color-text-2))]'
                  }`}
              >
                <Icon icon={subItem.icon} size={16} strokeWidth={active ? 2.2 : 1.8} />
                {subItem.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Glass Sidebar ────────────────────────────────────────────────────────
function GlassSidebar({ pathname }: { pathname: string | null }) {
  return (
    <div
      className="w-16 flex flex-col h-full shrink-0"
      style={{
        background: 'hsl(var(--sidebar-bg))',
      }}
    >
      <nav className="flex-1 py-4 px-2 flex flex-col items-center space-y-1 overflow-y-auto">
        {nav.map((item, idx) => {
          if (item.type === 'link') {
            return <SidebarNavItem key={(item as NavLink).href} item={item as NavLink} pathname={pathname} />;
          }
          return <SidebarNavGroup key={idx} group={item as Extract<NavItem, { type: 'group' }>} pathname={pathname} />;
        })}
      </nav>
    </div>
  );
}

// ── Command Palette ───────────────────────────────────────────────────────
function CommandPalette({
  onClose,
}: {
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Flatten all nav items for search
  const allLinks = nav.flatMap((item) =>
    item.type === 'group' ? item.items : [item as NavLink]
  );

  const filtered = query.trim().length < 1
    ? []
    : allLinks.filter((link) =>
        link.label.toLowerCase().includes(query.toLowerCase())
      );

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          background: 'hsl(var(--color-surface))',
          border: '1px solid hsl(var(--color-border))',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'hsl(var(--color-border))' }}>
          <Search size={18} className="text-[hsl(var(--color-text-3))] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="ค้นหาห้อง, ผู้เช่า, ใบแจ้งหนี้, เมนู..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered.length > 0) {
                router.push(filtered[0].href);
                onClose();
              }
            }}
            className="flex-1 bg-transparent text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text-3))] focus:outline-none"
          />
          <kbd className="hidden sm:flex h-5 items-center rounded border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-1.5 text-[10px] font-medium text-[hsl(var(--color-text-3))]">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && query.trim().length > 0 ? (
            <div className="py-8 text-center text-sm text-[hsl(var(--color-text-3))]">ไม่พบผลลัพธ์สำหรับ &quot;{query}&quot;</div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-[hsl(var(--color-text-3))]">พิมพ์เพื่อค้นหาเมนู...</div>
          ) : (
            filtered.map((link) => (
              <button
                key={link.href}
                onClick={() => { router.push(link.href); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[hsl(var(--color-text))] hover:bg-[hsl(var(--color-bg))] transition-colors"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                  <Icon icon={link.icon} size={16} strokeWidth={2} />
                </span>
                <span className="font-medium">{link.label}</span>
                <span className="ml-auto text-xs text-[hsl(var(--color-text-3))]">{link.href}</span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

// ── Top Bar ──────────────────────────────────────────────────────────────
function TopBar({
  pathname,
  onMobileMenuToggle,
  onCommandPalette,
}: {
  pathname: string | null;
  onMobileMenuToggle: () => void;
  onCommandPalette: () => void;
}) {
  const _router = useRouter();
  const [_searchQuery, setSearchQuery] = useState('');
  const [_showSearch, setShowSearch] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [sessionUser, setSessionUser] = useState<{ displayName: string; username: string; role: string } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const _searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onCommandPalette();
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [onCommandPalette]);

  // Fetch current user session
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.authenticated && data.data?.user) {
          setSessionUser(data.data.user);
        }
      })
      .catch(() => {});
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

  const [_searchResults, setSearchResults] = useState<{
    rooms: Array<{ roomNo: string; floorNo: number | null; roomStatus: string }>;
    tenants: Array<{ id: string; firstName: string; lastName: string; phone: string | null; email: string | null }>;
    invoices: Array<{ id: string; roomNo: string; year: number; month: number; status: string }>;
  } | null>(null);
  const [_searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const _handleSearch = (q: string) => {
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
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[hsl(var(--sidebar-bg))] shrink-0 px-4 md:px-6 gap-4"
      style={{
        background: 'hsl(var(--sidebar-bg))',
      }}
    >
      {/* Left: hamburger + page title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMobileMenuToggle}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-[hsl(var(--sidebar-text))] hover:bg-white/10 hover:text-white transition-colors md:hidden flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <Link href="/admin/dashboard" className="flex items-center gap-2 flex-shrink-0 group">
          <div className="hidden lg:block">
            <div className="text-sm font-semibold leading-tight tracking-tight text-[hsl(var(--sidebar-text-active))]">Apartment ERP</div>
          </div>
        </Link>

        <div className="h-5 w-px bg-white/10 hidden md:block" />

        <AnimatePresence mode="wait">
          <motion.span
            key={pathname}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="text-sm font-medium text-[hsl(var(--sidebar-text-active))] truncate"
          >
            {getPageTitle(pathname)}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Center: Command Palette Trigger */}
      <div className="flex-1 max-w-sm md:max-w-md mx-auto">
        <button
          onClick={onCommandPalette}
          className="w-full flex items-center gap-3 h-9 px-4 rounded-xl border transition-all duration-150 text-sm text-[hsl(var(--color-text-3))] hover:border-[hsl(var(--primary))] hover:shadow-[var(--glow-primary)] group"
          style={{
            background: 'hsl(var(--color-bg))',
            borderColor: 'hsl(var(--color-border))',
          }}
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1 text-left">ค้นหาห้อง, ผู้เช่า, ใบแจ้งหนี้...</span>
          <div className="hidden md:flex items-center gap-1">
            <kbd className="flex h-5 items-center rounded border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-1.5 text-[10px] font-medium text-[hsl(var(--color-text-3))]">
              <Command size={10} />
            </kbd>
            <kbd className="flex h-5 items-center rounded border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-1.5 text-[10px] font-medium text-[hsl(var(--color-text-3))]">K</kbd>
          </div>
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <ThemeToggle className="flex items-center justify-center w-9 h-9 rounded-xl text-[hsl(var(--color-text-3))] hover:bg-white/5 hover:text-[hsl(var(--color-text))] transition-colors" />

        <div className="h-4 w-px bg-[hsl(var(--color-border))] hidden sm:block" />

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl text-[hsl(var(--color-text-3))] hover:bg-white/5 hover:text-[hsl(var(--color-text))] transition-colors"
            aria-label="Notifications"
          >
            <BellIcon size={20} />
            {unreadCount > 0 && (
              <span
                className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                style={{ background: 'hsl(var(--color-danger))', color: 'white' }}
              >
                {unreadCount}
              </span>
            )}
          </motion.button>

          {showNotifs && (
            <div
              className="absolute top-full right-0 mt-2 w-80 rounded-xl overflow-hidden z-50"
              style={{
                background: 'hsl(var(--color-surface))',
                border: '1px solid hsl(var(--color-border))',
                boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
              }}
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid hsl(var(--color-border))' }}>
                <span className="text-sm font-semibold text-[hsl(var(--color-text))]">การแจ้งเตือน</span>
                <button className="text-xs font-medium transition-colors" style={{ color: 'hsl(var(--primary))' }}>ดูทั้งหมด</button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                {notifLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <BellIcon size={24} className="text-[hsl(var(--color-text-3))]" />
                    <p className="text-sm text-[hsl(var(--color-text-3))]">ไม่มีการแจ้งเตือน</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-[hsl(var(--color-bg))] transition-colors cursor-pointer ${n.status !== 'SENT' && n.status !== 'CANCELLED' ? 'bg-[hsl(var(--primary))]/5' : ''}`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${n.status !== 'SENT' && n.status !== 'CANCELLED' ? 'bg-[hsl(var(--primary))]/10' : 'bg-[hsl(var(--color-bg))]'}`}>
                        <BellIcon size={14} className={n.status !== 'SENT' && n.status !== 'CANCELLED' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--color-text-3))]'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[hsl(var(--color-text))]">{n.content}</p>
                        <p className="text-xs text-[hsl(var(--color-text-3))] mt-0.5">{n.roomNo ? `ห้อง ${n.roomNo} · ` : ''}{formatNotifTime(n.createdAt)}</p>
                      </div>
                      {n.status !== 'SENT' && n.status !== 'CANCELLED' && <div className="h-2 w-2 rounded-full bg-[hsl(var(--primary))] mt-2 shrink-0" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/5 transition-colors"
          >
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 70%))',
                boxShadow: 'var(--glow-primary)',
              }}
            >
              {sessionUser ? (sessionUser.displayName || sessionUser.username).charAt(0).toUpperCase() : '?'}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm font-medium text-white leading-tight">{sessionUser?.displayName || sessionUser?.username || 'ผู้ใช้'}</div>
              <div className="text-xs text-white/60">{sessionUser?.role === 'OWNER' ? 'เจ้าของ' : sessionUser?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}</div>
            </div>
            <ChevronDown size={14} className="text-white/60 hidden md:block" />
          </motion.button>

          {showUserMenu && (
            <div
              className="absolute top-full right-0 mt-2 w-60 rounded-2xl overflow-hidden z-50"
              style={{
                background: 'hsl(var(--color-surface))',
                border: '1px solid hsl(var(--color-border))',
                boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
              }}
            >
              <div className="px-4 py-3.5 flex items-center gap-3" style={{ borderBottom: '1px solid hsl(var(--color-border))' }}>
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 70%))',
                    boxShadow: 'var(--glow-primary)',
                  }}
                >
                  {sessionUser ? (sessionUser.displayName || sessionUser.username).charAt(0).toUpperCase() : '?'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--color-text))]">{sessionUser?.displayName || sessionUser?.username || 'ผู้ใช้'}</p>
                  <p className="text-xs text-[hsl(var(--color-text-3))]">{sessionUser?.role === 'OWNER' ? 'เจ้าของ' : sessionUser?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}</p>
                </div>
              </div>
              <div className="py-2">
                <Link
                  href="/admin/settings/account"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm text-[hsl(var(--color-text))] hover:bg-[hsl(var(--color-bg))] transition-colors"
                >
                  <Settings size={15} className="text-[hsl(var(--color-text-3))]" />
                  ตั้งค่าบัญชี
                </Link>
                <button
                  onClick={async () => {
                    setShowUserMenu(false);
                    await fetch('/api/auth/logout', { method: 'POST' });
                    window.location.href = '/login';
                  }}
                  className="w-full flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  ออกจากระบบ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Page Transition Wrapper ───────────────────────────────────────────────
const pageVariants = {
  initial: { opacity: 0, x: 12, y: 0 },
  animate: { opacity: 1, x: 0, y: 0 },
  exit: { opacity: 0, x: -12, y: 0 },
};

const pageTransition = {
  duration: 0.22,
  ease: [0.25, 0.1, 0.25, 0.9] as [number, number, number, number],
};

// ── Main Layout ───────────────────────────────────────────────────────────
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  const openCommandPalette = useCallback(() => setCmdPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setCmdPaletteOpen(false), []);

  useEffect(() => {
    const title = getPageTitle(pathname);
    if (typeof document !== 'undefined') {
      document.title = title === 'Apartment ERP' ? title : `${title} · Apartment ERP`;
    }
  }, [pathname]);

  return (
    <ThemeProvider>
      <div className="min-h-screen flex" style={{ background: 'hsl(var(--color-bg))' }}>
        {/* ── Desktop Glass Sidebar ── */}
        <aside className="hidden md:flex shrink-0">
          <GlassSidebar pathname={pathname} />
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
                className="fixed inset-0 z-40 md:hidden"
                style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
                onClick={() => setMobileOpen(false)}
              />
              <motion.aside
                initial={{ x: -288 }}
                animate={{ x: 0 }}
                exit={{ x: -288 }}
                transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col md:hidden"
                style={{
                  background: 'hsl(var(--sidebar-bg))',
                }}
              >
                {/* Mobile drawer header */}
                <div
                  className="flex items-center justify-between px-4 h-14 shrink-0"
                  style={{ borderBottom: '1px solid hsl(var(--sidebar-bg))' }}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[hsl(var(--sidebar-text-active))] leading-tight tracking-tight">Apartment ERP</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-center w-9 h-9 rounded-xl text-[hsl(var(--sidebar-text))] hover:text-white hover:bg-white/10 transition-colors"
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
                        <motion.div
                          key={(item as NavLink).href}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Link
                            href={(item as NavLink).href}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150
                              ${active
                                ? 'text-white shadow-[var(--glow-primary)]'
                                : 'text-[hsl(var(--color-text-3))] hover:bg-white/5 hover:text-[hsl(var(--color-text-2))]'
                              }`}
                            style={active ? { background: 'hsl(var(--primary))' } : undefined}
                          >
                            <Icon icon={(item as NavLink).icon} size={18} strokeWidth={active ? 2.2 : 1.8} />
                            {(item as NavLink).label}
                          </Link>
                        </motion.div>
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

        {/* ── Main Content ── */}
        <div className="relative flex min-w-0 flex-col flex-1">
          <TopBar pathname={pathname} onMobileMenuToggle={() => setMobileOpen(true)} onCommandPalette={openCommandPalette} />

          {/* Page content with transitions */}
          <main className="flex-1 px-4 md:px-6 pt-6 pb-8">
            <ErrorBoundary>
              <ToastProvider>
                <QueryProvider>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={pathname}
                      initial={pageVariants.initial}
                      animate={pageVariants.animate}
                      exit={pageVariants.exit}
                      transition={pageTransition}
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

      {/* Command Palette */}
      <AnimatePresence>
        {cmdPaletteOpen && <CommandPalette onClose={closeCommandPalette} />}
      </AnimatePresence>
    </ThemeProvider>
  );
}
