'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Building2,
  CreditCard,
  MessageSquare,
  Receipt,
  Settings,
  Shield,
  Users,
  Zap,
} from 'lucide-react';

type StatusKind = 'active' | 'reference';

type SettingCategory = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  iconBg: string;
  status?: StatusKind;
};

// ─── Category definitions ─────────────────────────────────────────────────────

const ACCESS_CONTROL: SettingCategory[] = [
  {
    id: 'users',
    title: 'Admin Users',
    description: 'Create and manage operator accounts, display names, and access roles.',
    href: '/admin/settings/users',
    icon: <Users className="h-5 w-5" />,
    iconBg: 'bg-gradient-to-br from-violet-500 to-violet-700',
    status: 'active',
  },
  {
    id: 'roles',
    title: 'Roles & Permissions',
    description: 'Review the Owner, Admin, and Staff permission levels and what each role can access.',
    href: '/admin/settings/roles',
    icon: <Shield className="h-5 w-5" />,
    iconBg: 'bg-gradient-to-br from-slate-500 to-slate-700',
    status: 'reference',
  },
];

const PROPERTY_FINANCE: SettingCategory[] = [
  {
    id: 'building',
    title: 'Building Profile',
    description: 'Configure building name, address, and contact information printed on documents and invoices.',
    href: '/admin/settings/building',
    icon: <Building2 className="h-5 w-5" />,
    iconBg: 'bg-gradient-to-br from-sky-500 to-sky-700',
    status: 'active',
  },
  {
    id: 'bank-accounts',
    title: 'Bank Accounts',
    description: 'Manage bank accounts used for payment collection, statement imports, and automatic matching.',
    href: '/admin/settings/bank-accounts',
    icon: <CreditCard className="h-5 w-5" />,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-emerald-700',
    status: 'active',
  },
  {
    id: 'billing-policy',
    title: 'Billing Calendar',
    description: 'Set the billing day, payment due date, and overdue cutoff used across the ERP.',
    href: '/admin/settings/billing-policy',
    icon: <Receipt className="h-5 w-5" />,
    iconBg: 'bg-gradient-to-br from-rose-500 to-rose-700',
    status: 'active',
  },
];

const INTEGRATIONS: SettingCategory[] = [
  {
    id: 'integrations',
    title: 'LINE Integration',
    description: 'Connect your LINE Official Account to enable tenant messaging, invoices, and payment receipts.',
    href: '/admin/settings/integrations',
    icon: <MessageSquare className="h-5 w-5" />,
    iconBg: 'bg-gradient-to-br from-green-500 to-green-700',
    status: 'active',
  },
  {
    id: 'automation',
    title: 'Automation Rules',
    description: 'Schedule automatic billing cycles, payment reminders, database backups, and overdue checks.',
    href: '/admin/settings/automation',
    icon: <Zap className="h-5 w-5" />,
    iconBg: 'bg-gradient-to-br from-purple-500 to-purple-700',
    status: 'active',
  },
];

// ─── Card component ───────────────────────────────────────────────────────────

function CategoryCard({ cat }: { cat: SettingCategory }) {
  return (
    <Link
      href={cat.href}
      className="group admin-card flex flex-col gap-0 p-0 overflow-hidden transition-shadow hover:shadow-md"
    >
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div
            className={[
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm',
              cat.iconBg,
            ].join(' ')}
          >
            <span className="text-white">{cat.icon}</span>
          </div>
          {cat.status && (
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span
                className={[
                  'h-1.5 w-1.5 rounded-full',
                  cat.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400',
                ].join(' ')}
              />
              <span className={cat.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}>
                {cat.status === 'active' ? 'Active' : 'Reference'}
              </span>
            </span>
          )}
        </div>
        <div className="font-semibold text-slate-900 text-sm leading-snug">{cat.title}</div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{cat.description}</p>
      </div>
      <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/50 flex items-center justify-between">
        <span className="text-xs font-medium text-indigo-600 group-hover:text-indigo-700 transition-colors">
          Configure →
        </span>
      </div>
    </Link>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 mt-2">
      {title}
    </h2>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  return (
    <main className="admin-page">

      {/* ── Page-level header with gradient accent ── */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5 shadow-sm mb-2">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.25),_transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <Settings className="h-5 w-5 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Settings</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage building configuration, integrations, billing rules, and operator accounts.
            </p>
          </div>
        </div>
      </section>

      {/* ── Access Control ── */}
      <div>
        <SectionHeading title="Access Control" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ACCESS_CONTROL.map((cat) => (
            <CategoryCard key={cat.id} cat={cat} />
          ))}
        </div>
      </div>

      {/* ── Property & Finance ── */}
      <div>
        <SectionHeading title="Property & Finance" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PROPERTY_FINANCE.map((cat) => (
            <CategoryCard key={cat.id} cat={cat} />
          ))}
        </div>
      </div>

      {/* ── Integrations ── */}
      <div>
        <SectionHeading title="Integrations" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {INTEGRATIONS.map((cat) => (
            <CategoryCard key={cat.id} cat={cat} />
          ))}
        </div>
      </div>

      {/* ── Footer note ── */}
      <p className="text-xs text-slate-400 text-center pt-2 pb-1">
        Changes to settings take effect immediately unless noted otherwise.
      </p>

    </main>
  );
}
