"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, DoorOpen, Users, UserPlus, Receipt, FileText, FilePlus, CreditCard, AlertTriangle, MessageSquare, FileEdit, PieChart, Settings, ClipboardList, Layers, Cpu, ScrollText, Upload, Send, Bell, FileBarChart, Menu, X, ChevronDown, Wrench, Home, Shield } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type IconComponent = React.ElementType;

type NavLink = {
  type: "link";
  href: string;
  label: string;
  icon: IconComponent;
  exact?: boolean;
};

type NavCategory = {
  type: "category";
  name: string;
  icon: IconComponent;
  items: NavLink[];
};

// ── Menu definition matching the task categories ───────────────────────────────
// Grouped per the 8 categories requested
const MENU_CATEGORIES: NavCategory[] = [
  {
    type: "category",
    name: "ห้อง",
    icon: DoorOpen,
    items: [
      { type: "link", href: "/admin/rooms", label: "รายการห้อง", icon: DoorOpen },
      { type: "link", href: "/admin/floors", label: "จัดการชั้น", icon: Layers },
      { type: "link", href: "/admin/rooms?status=vacant", label: "ห้องว่าง", icon: Building2 },
    ],
  },
  {
    type: "category",
    name: "ผู้เช่า",
    icon: Users,
    items: [
      { type: "link", href: "/admin/tenants", label: "รายชื่อ", icon: Users },
      { type: "link", href: "/admin/contracts", label: "สัญญา", icon: FileText },
      { type: "link", href: "/admin/tenant-registrations", label: "ลงทะเบียนใหม่", icon: UserPlus },
      { type: "link", href: "/admin/moveouts", label: "ย้ายออก", icon: Wrench },
    ],
  },
  {
    type: "category",
    name: "บิล",
    icon: Receipt,
    items: [
      { type: "link", href: "/admin/billing", label: "วางบิล", icon: Receipt },
      { type: "link", href: "/admin/invoices", label: "ใบแจ้งหนี้", icon: ScrollText },
      { type: "link", href: "/admin/billing/import", label: "นำเข้าข้อมูล", icon: Upload },
      { type: "link", href: "/admin/expenses", label: "รายจ่าย", icon: CreditCard },
      { type: "link", href: "/admin/settings/billing-policy", label: "ปฏิทินบิล", icon: Receipt },
      { type: "link", href: "/admin/settings/billing-rules", label: "กติกาค่าบริการ", icon: FileEdit },
    ],
  },
  {
    type: "category",
    name: "เงิน",
    icon: CreditCard,
    items: [
      { type: "link", href: "/admin/payments", label: "รายการ", icon: CreditCard },
      { type: "link", href: "/admin/payments/review", label: "ตรวจสลิป", icon: AlertTriangle },
      { type: "link", href: "/admin/payments/review-match", label: "จับคู่", icon: FileBarChart },
      { type: "link", href: "/admin/overdue", label: "ค้างชำระ", icon: AlertTriangle },
    ],
  },
  {
    type: "category",
    name: "เอกสาร",
    icon: FilePlus,
    items: [
      { type: "link", href: "/admin/templates", label: "เทมเพลต", icon: FilePlus },
      { type: "link", href: "/admin/documents/generate", label: "สร้างเอกสาร", icon: FileText },
      { type: "link", href: "/admin/documents", label: "เอกสารทั้งหมด", icon: Layers },
      { type: "link", href: "/admin/deliveries", label: "จัดส่ง", icon: Send },
    ],
  },
  {
    type: "category",
    name: "ซ่อม",
    icon: Wrench,
    items: [
      { type: "link", href: "/admin/maintenance", label: "แจ้งซ่อม", icon: Wrench },
    ],
  },
  {
    type: "category",
    name: "รายงาน",
    icon: FileBarChart,
    items: [
      { type: "link", href: "/admin/reports", label: "รายงานต่างๆ", icon: FileBarChart },
      { type: "link", href: "/admin/reports/profit-loss", label: "กำไรขาดทุน", icon: PieChart },
      { type: "link", href: "/admin/audit-logs", label: "Audit Log", icon: ClipboardList },
      { type: "link", href: "/admin/analytics", label: "Analytics", icon: PieChart },
    ],
  },
  {
    type: "category",
    name: "ตั้งค่า",
    icon: Settings,
    items: [
      { type: "link", href: "/admin/settings", label: "ระบบ", icon: Settings },
      { type: "link", href: "/admin/settings/users", label: "ผู้ใช้", icon: Users },
      { type: "link", href: "/admin/users", label: "ผู้ดูแล", icon: Shield },
      { type: "link", href: "/admin/settings/roles", label: "บทบาท", icon: ClipboardList },
      { type: "link", href: "/admin/settings/integrations", label: "LINE", icon: MessageSquare },
      { type: "link", href: "/admin/settings/rooms", label: "ข้อมูลห้อง", icon: DoorOpen },
      { type: "link", href: "/admin/settings/building", label: "ข้อมูลอาคาร", icon: Building2 },
      { type: "link", href: "/admin/settings/bank-accounts", label: "บัญชีธนาคาร", icon: CreditCard },
      { type: "link", href: "/admin/settings/reminders", label: "การแจ้งเตือน", icon: Bell },
      { type: "link", href: "/admin/settings/automation", label: "ระบบอัตโนมัติ", icon: Cpu },
    ],
  },
];

// Quick-link nav items that appear before the mega-menu categories
const QUICK_LINKS: NavLink[] = [
  { type: "link", href: "/admin/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
];

// ── Active check helper ──────────────────────────────────────────────────────────
function isActive(pathname: string | null, item: NavLink): boolean {
  if (item.exact) return pathname === item.href || pathname === item.href + "/";
  return pathname?.startsWith(item.href) ?? false;
}

// ── MegaMenuDropdown ───────────────────────────────────────────────────────────
function MegaMenuDropdown({
  category,
  pathname,
  onClose,
}: {
  category: NavCategory;
  pathname: string | null;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-full left-0 mt-2 w-[560px] max-w-[calc(100vw-2rem)] rounded-xl bg-[hsl(var(--color-surface))] shadow-xl border-[hsl(var(--color-border))]/80 p-4 z-50 animate-fade-in">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[hsl(var(--color-border))]/50">
        <category.icon size={16} className="text-[hsl(var(--primary))]" />
        <span className="text-sm font-semibold text-[hsl(var(--color-text))]">{category.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {category.items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                active
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] shadow-[rgb(28,56,96)]/30"
                  : "text-[hsl(var(--color-text-2))] hover:bg-[hsl(var(--color-bg))] hover:text-[hsl(var(--color-text))]"
              }`}
            >
              <item.icon
                size={14}
                className={active ? "text-[hsl(var(--on-primary))]" : "text-[hsl(var(--color-text-3))]"}
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

// ── MegaMenu ────────────────────────────────────────────────────────────────────
export default function MegaMenu() {
  const pathname = usePathname();
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeDropdown = useCallback(() => {
    setOpenCategory(null);
  }, []);

  const handleMouseEnter = (categoryName: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpenCategory(categoryName);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setOpenCategory(null);
    }, 150);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDropdown();
    },
    [closeDropdown]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  // Close on navigation
  useEffect(() => {
    closeDropdown();
    setMobileOpen(false);
  }, [pathname, closeDropdown]);

  return (
    <>
      {/* ── Desktop Mega Menu Bar ── */}
      <div
        ref={dropdownRef}
        className="relative hidden md:flex items-center gap-0 h-12 bg-[hsl(var(--color-surface))] border-b border-[hsl(var(--color-border))] px-4"
      >
        {/* Quick links */}
        {QUICK_LINKS.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 h-12 text-[13px] font-medium transition-colors duration-150 ${
                active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--color-text-3))] hover:text-[hsl(var(--color-text))]"
              }`}
            >
              <item.icon size={15} strokeWidth={active ? 2.5 : 1.8} />
              {item.label}
            </Link>
          );
        })}

        <div className="h-4 w-px bg-[hsl(var(--color-border))] mx-1" />

        {/* Category nav items */}
        {MENU_CATEGORIES.map((cat) => {
          const isOpen = openCategory === cat.name;
          return (
            <div
              key={cat.name}
              className="relative"
              onMouseEnter={() => handleMouseEnter(cat.name)}
              onMouseLeave={handleMouseLeave}
            >
              <button
                onClick={() => setOpenCategory(isOpen ? null : cat.name)}
                className={`flex items-center gap-1.5 h-12 px-3 text-[13px] font-medium transition-colors duration-150 ${
                  isOpen
                    ? "text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))]"
                    : "text-[hsl(var(--color-text-3))] hover:text-[hsl(var(--color-text))]"
                }`}
              >
                <cat.icon size={14} strokeWidth={isOpen ? 2.5 : 1.8} />
                {cat.name}
                <ChevronDown
                  size={12}
                  className={`text-[hsl(var(--color-text-3))] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen && (
                <MegaMenuDropdown
                  category={cat}
                  pathname={pathname}
                  onClose={closeDropdown}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Mobile hamburger trigger (shown in topbar) ── */}
      <button
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={18} />
      </button>

      {/* ── Mobile Drawer ── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col bg-[hsl(var(--color-surface))] text-[hsl(var(--color-text))] md:hidden shadow-xl"
            style={{ animation: "slide-in-left 250ms cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-[hsl(var(--color-border))]">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--primary))] shadow-sm">
                  <Building2 size={14} className="text-[hsl(var(--on-primary))]" strokeWidth={2.5} />
                </div>
                <span className="text-sm font-semibold text-[hsl(var(--color-text))]">Apartment ERP</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="text-[hsl(var(--color-text-3))] hover:text-[hsl(var(--color-text-2))] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Mobile nav */}
            <nav className="flex-1 overflow-y-auto py-2 px-3">
              {/* Quick links */}
              {QUICK_LINKS.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium mb-1 ${
                      active
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))]"
                        : "text-[hsl(var(--color-text-2))] hover:bg-[hsl(var(--color-bg))]"
                    }`}
                  >
                    <item.icon size={15} strokeWidth={active ? 2.5 : 1.8} />
                    {item.label}
                  </Link>
                );
              })}

              <div className="h-px bg-[hsl(var(--color-border))] my-3" />

              {/* Categories */}
              {MENU_CATEGORIES.map((cat) => {
                const hasActiveChild = cat.items.some((item) =>
                  isActive(pathname, item)
                );
                return (
                  <div key={cat.name} className="mb-2">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <cat.icon
                        size={14}
                        className={hasActiveChild ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--color-text-3))]"}
                      />
                      <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--color-text-3))]">
                        {cat.name}
                      </span>
                    </div>
                    {cat.items.map((item) => {
                      const active = isActive(pathname, item);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium mb-0.5 ${
                            active
                              ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-l-2 border-[hsl(var(--primary))] pl-[10px]"
                              : "text-[hsl(var(--color-text-3))] hover:bg-[hsl(var(--color-bg))] hover:text-[hsl(var(--color-text))]"
                          }`}
                        >
                          <item.icon
                            size={14}
                            strokeWidth={active ? 2.5 : 1.8}
                          />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="border-t border-[hsl(var(--color-border))] p-3">
              <Link
                href="/admin/dashboard"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[hsl(var(--color-text-3))] hover:bg-[hsl(var(--color-bg))] hover:text-[hsl(var(--color-text))] transition-colors"
              >
                <Home size={15} />
                กลับหน้าแรก
              </Link>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
