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
} from 'lucide-react';

type NavItem =
  | { type: 'link'; href: string; label: string; icon: React.ElementType }
  | { type: 'divider'; label: string };

const nav: NavItem[] = [
  { type: 'link', href: '/admin/dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
  { type: 'divider', label: 'Property' },
  { type: 'link', href: '/admin/floors',     label: 'Floors',        icon: Building2 },
  { type: 'link', href: '/admin/rooms',      label: 'Rooms',         icon: DoorOpen },
  { type: 'link', href: '/admin/tenants',               label: 'Tenants',         icon: Users },
  { type: 'link', href: '/admin/tenant-registrations',  label: 'Registrations',   icon: UserPlus },
  { type: 'divider', label: 'Finance' },
  { type: 'link', href: '/admin/billing',    label: 'Billing',       icon: Receipt },
  { type: 'link', href: '/admin/documents',  label: 'Documents',     icon: Layers },
  { type: 'link', href: '/admin/payments',   label: 'Payments',      icon: CreditCard },
  { type: 'link', href: '/admin/overdue',    label: 'Overdue',       icon: AlertTriangle },
  { type: 'divider', label: 'Communication' },
  { type: 'link', href: '/admin/chat',                label: 'Chat',              icon: MessageSquare },
  { type: 'link', href: '/admin/message-templates',  label: 'Msg Templates',     icon: FileEdit },
  { type: 'link', href: '/admin/document-templates', label: 'Doc Templates',     icon: FilePlus },
  { type: 'divider', label: 'Intelligence' },
  { type: 'link', href: '/admin/reports',    label: 'Reports',       icon: BarChart2 },
  { type: 'link', href: '/admin/audit-logs', label: 'Audit Logs',    icon: ClipboardList },
  { type: 'divider', label: 'System' },
  { type: 'link', href: '/admin/settings',   label: 'Settings',      icon: Settings },
  { type: 'link', href: '/admin/system',     label: 'System',        icon: Server },
  { type: 'link', href: '/admin/system-health', label: 'Health',     icon: FileText },
  { type: 'link', href: '/admin/system-jobs',   label: 'Jobs',        icon: Cpu },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-slate-100 md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      {/* Sidebar */}
      <aside className="relative z-20 flex flex-col bg-slate-900 text-white">
        {/* Brand */}
        <div className="flex items-center gap-3 border-b border-slate-700/60 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-lg">
            <Building2 size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">Apartment ERP</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Admin Console</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {nav.map((item, idx) => {
            if (item.type === 'divider') {
              return (
                <div key={idx} className="px-3 pt-4 pb-1">
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">
                    {item.label}
                  </span>
                </div>
              );
            }
            // Exact match for short hrefs that are prefixes of others
            const exactMatch = item.href === '/admin/system';
            const active = exactMatch
              ? pathname === item.href || pathname === item.href + '/'
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors
                  ${active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
              >
                <item.icon
                  size={15}
                  className={active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-700/60 px-3 py-3">
          <LogoutButton />
        </div>
      </aside>

      {/* Main */}
      <div className="relative flex min-w-0 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
          <div>
            <div className="text-sm font-semibold text-slate-800">Operations Console</div>
            <div className="text-xs text-slate-400">Building management · billing · messaging · analytics</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              Admin
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              {new Date().toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </header>
        <main className="flex-1 bg-slate-50">{children}</main>
      </div>
    </div>
  );
}
