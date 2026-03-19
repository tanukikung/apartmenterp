'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import LogoutButton from '@/components/auth/LogoutButton';
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
  BarChart2,
  Settings,
  ClipboardList,
  Server,
  Layers,
  Cpu,
  ScrollText,
  FileSignature,
} from 'lucide-react';

/**
 * NavItem `exact` flag — when true, the item is highlighted only on an exact
 * pathname match (or with a trailing slash).  Use this whenever a nav entry's
 * href is a strict prefix of another entry's href in the same nav list.
 *
 * Current exact-match entries:
 *   /admin/system    — would otherwise swallow /admin/system-health, /admin/system-jobs
 *   /admin/documents — would otherwise swallow /admin/documents/generate
 */
type NavItem =
  | { type: 'link'; href: string; label: string; icon: React.ElementType; exact?: boolean }
  | { type: 'divider'; label: string };

// ---------------------------------------------------------------------------
// Domain boundaries (read-only reference — do not add cross-domain actions)
//
//  BillingCycle      monthly operational container per building
//  BillingRecord     per-room financial truth for a period
//  Invoice           financial delivery/lifecycle entity (DRAFT→PAID)
//  GeneratedDocument rendered template artifact (GENERATED→EXPORTED)
//
//  /admin/billing          cycle list — import, lock, navigate to detail
//  /admin/billing/[id]     cycle-scoped action center (generate, bulk send)
//  /admin/invoices         cross-cycle monitoring/search (read + convenience send)
//  /admin/documents        GeneratedDocument viewer — NOT invoice lifecycle
//  /admin/documents/generate  document template rendering engine
// ---------------------------------------------------------------------------
const nav: NavItem[] = [
  { type: 'link', href: '/admin/dashboard',  label: 'Dashboard',    icon: LayoutDashboard },

  { type: 'divider', label: 'Property' },
  { type: 'link', href: '/admin/floors',    label: 'Floors',         icon: Building2 },
  { type: 'link', href: '/admin/rooms',     label: 'Rooms',          icon: DoorOpen },
  { type: 'link', href: '/admin/tenants',              label: 'Tenants',       icon: Users },
  { type: 'link', href: '/admin/tenant-registrations', label: 'Registrations', icon: UserPlus },

  { type: 'divider', label: 'Finance' },
  { type: 'link', href: '/admin/billing',   label: 'Billing',        icon: Receipt },
  { type: 'link', href: '/admin/invoices',  label: 'Invoices',       icon: ScrollText },
  { type: 'link', href: '/admin/payments',  label: 'Payments',       icon: CreditCard },
  { type: 'link', href: '/admin/overdue',    label: 'Overdue',        icon: AlertTriangle },
  { type: 'link', href: '/admin/contracts', label: 'Contracts',      icon: FileSignature },

  { type: 'divider', label: 'Documents' },
  { type: 'link', href: '/admin/templates',          label: 'Doc Templates', icon: FilePlus },
  // exact: true — prevents /admin/documents/generate from also highlighting this entry
  { type: 'link', href: '/admin/documents',          label: 'Generated Docs', icon: Layers,   exact: true },
  { type: 'link', href: '/admin/documents/generate', label: 'Generate New',   icon: FileText },

  { type: 'divider', label: 'Communication' },
  { type: 'link', href: '/admin/chat',               label: 'Chat',           icon: MessageSquare },
  { type: 'link', href: '/admin/message-templates',  label: 'Msg Templates',  icon: FileEdit },

  { type: 'divider', label: 'Intelligence' },
  { type: 'link', href: '/admin/reports',    label: 'Reports',        icon: BarChart2 },
  { type: 'link', href: '/admin/audit-logs', label: 'Audit Logs',     icon: ClipboardList },

  { type: 'divider', label: 'System' },
  { type: 'link', href: '/admin/settings',      label: 'Settings', icon: Settings },
  // exact: true — prevents /admin/system-health, /admin/system-jobs swallowing this entry
  { type: 'link', href: '/admin/system',        label: 'System',   icon: Server, exact: true },
  { type: 'link', href: '/admin/system-health', label: 'Health',   icon: FileText },
  { type: 'link', href: '/admin/system-jobs',   label: 'Jobs',     icon: Cpu },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100 md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      {/* ── Sidebar ── */}
      <aside className="relative z-20 flex flex-col bg-[#111827] text-white">

        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
            <Building2 size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight tracking-tight">Apartment ERP</div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 mt-0.5">Management Console</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {nav.map((item, idx) => {
            if (item.type === 'divider') {
              return (
                <div key={idx} className="px-3 pt-5 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-slate-600">
                      {item.label}
                    </span>
                    <div className="flex-1 h-px bg-slate-700/50"></div>
                  </div>
                </div>
              );
            }

            // Use exact matching when the item has `exact: true` (href is a
            // strict prefix of another nav entry and must not swallow it).
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
              <div className="text-xs font-medium text-slate-300 truncate">Administrator</div>
              <div className="text-[10px] text-slate-600">Owner</div>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="relative flex min-w-0 flex-col bg-slate-50">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-sm px-6">
          {/* Left: page context label */}
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-800">Operations Console</span>
          </div>

          {/* Right: date + admin badge */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate-400" suppressHydrationWarning>
              {new Date().toLocaleDateString('th-TH', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <div className="h-4 w-px bg-slate-200"></div>
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
              <span className="text-xs font-medium text-slate-600">Admin</span>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
