'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CreditCard,
  DoorOpen,
  MessageSquare,
  Receipt,
  Shield,
  Users,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingCategory = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
};

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

const CATEGORIES: SettingCategory[] = [
  {
    id: 'building',
    title: 'Building Info',
    description: 'Set your building name, address, and contact details shown on invoices.',
    href: '/admin/settings/building',
    icon: <Building2 className="h-6 w-6" />,
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  {
    id: 'bank-accounts',
    title: 'Bank Accounts',
    description: 'Manage payment collection accounts, PromptPay IDs, and default recipients.',
    href: '/admin/settings/bank-accounts',
    icon: <CreditCard className="h-6 w-6" />,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    id: 'users',
    title: 'Admin Users',
    description: 'Create and manage admin accounts, roles, and password resets.',
    href: '/admin/settings/users',
    icon: <Users className="h-6 w-6" />,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  {
    id: 'automation',
    title: 'Automation Rules',
    description:
      'Configure billing day, due dates, overdue policies, and invoice auto-generation triggers.',
    href: '/admin/settings/automation',
    icon: <Zap className="h-6 w-6" />,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    id: 'integrations',
    title: 'LINE Integration',
    description:
      'Review LINE Messaging API credentials and webhook configuration for tenant communication.',
    href: '/admin/settings/integrations',
    icon: <MessageSquare className="h-6 w-6" />,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
  },
  {
    id: 'billing-policy',
    title: 'Billing Policy',
    description: 'Define late fees, penalty rates, billing cycles, and invoice rounding rules.',
    href: '/admin/settings/billing-policy',
    icon: <Receipt className="h-6 w-6" />,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
  },
  {
    id: 'rooms',
    title: 'Room Settings',
    description: 'Default room capacity, maintenance lock period, and checkout approval policy.',
    href: '/admin/settings/rooms',
    icon: <DoorOpen className="h-6 w-6" />,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
  },
  {
    id: 'roles',
    title: 'Roles & Permissions',
    description: 'Overview of system roles: Owner, Admin, and Staff permission levels.',
    href: '/admin/settings/roles',
    icon: <Shield className="h-6 w-6" />,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
  },
];

// ---------------------------------------------------------------------------
// Category card
// ---------------------------------------------------------------------------

function CategoryCard({ cat }: { cat: SettingCategory }) {
  return (
    <Link
      href={cat.href}
      className="admin-card cute-surface group flex flex-col gap-4 p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
            cat.iconBg,
            cat.iconColor,
          ].join(' ')}
        >
          {cat.icon}
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-colors group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-600">
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <div>
        <div className="font-semibold text-slate-900 leading-snug">{cat.title}</div>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">{cat.description}</p>
      </div>
      <div className="mt-auto pt-1">
        <span className="text-xs font-semibold text-indigo-600 group-hover:underline">
          Configure
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminSettingsPage() {
  return (
    <main className="admin-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Settings</h1>
          <p className="admin-page-subtitle">
            Configure billing, integrations, accounts, and operational defaults for your building.
          </p>
        </div>
      </section>

      {/* ── Category grid ──────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((cat) => (
          <CategoryCard key={cat.id} cat={cat} />
        ))}
      </div>

      {/* ── Quick-access footer note ────────────────────────────────────── */}
      <section className="rounded-2xl border border-sky-100 bg-sky-50/60 px-5 py-4 text-sm text-sky-800">
        <span className="font-semibold">Tip:</span> Billing day, due date, and overdue thresholds
        are set under{' '}
        <Link href="/admin/settings/automation" className="font-semibold underline underline-offset-2">
          Automation Rules
        </Link>
        . LINE credentials are read from environment variables and visible under{' '}
        <Link href="/admin/settings/integrations" className="font-semibold underline underline-offset-2">
          LINE Integration
        </Link>
        .
      </section>
    </main>
  );
}
