'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Building2,
  CreditCard,
  MessageSquare,
  Receipt,
  Shield,
  Users,
  Zap,
} from 'lucide-react';

type StatusDot = 'working' | 'configured' | 'none';

type SettingCategory = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  status?: StatusDot;
};

const CATEGORIES: SettingCategory[] = [
  {
    id: 'users',
    title: 'Admin Users',
    description: 'Create and manage operator accounts, display names, and access roles.',
    href: '/admin/settings/users',
    icon: <Users className="h-6 w-6" />,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    status: 'working',
  },
  {
    id: 'billing-policy',
    title: 'Billing Calendar',
    description:
      'Set the billing day, payment due date, and overdue cutoff used across the ERP.',
    href: '/admin/settings/billing-policy',
    icon: <Receipt className="h-6 w-6" />,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
    status: 'working',
  },
  {
    id: 'building',
    title: 'Building Profile',
    description:
      'Configure building name, address, and contact information printed on documents and invoices.',
    href: '/admin/settings/building',
    icon: <Building2 className="h-6 w-6" />,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    status: 'working',
  },
  {
    id: 'bank-accounts',
    title: 'Bank Accounts',
    description:
      'Manage bank accounts used for payment collection, statement imports, and automatic matching.',
    href: '/admin/settings/bank-accounts',
    icon: <CreditCard className="h-6 w-6" />,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    status: 'working',
  },
  {
    id: 'integrations',
    title: 'LINE Integration',
    description:
      'Connect your LINE Official Account to enable tenant messaging, invoices, and payment receipts.',
    href: '/admin/settings/integrations',
    icon: <MessageSquare className="h-6 w-6" />,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    status: 'configured',
  },
  {
    id: 'automation',
    title: 'Automation Rules',
    description:
      'Schedule automatic billing cycles, payment reminders, database backups, and overdue checks.',
    href: '/admin/settings/automation',
    icon: <Zap className="h-6 w-6" />,
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    status: 'configured',
  },
  {
    id: 'roles',
    title: 'Roles & Permissions',
    description:
      'Review the Owner, Admin, and Staff permission levels and what each role can access.',
    href: '/admin/settings/roles',
    icon: <Shield className="h-6 w-6" />,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    status: 'working',
  },
];

function StatusIndicator({ status }: { status?: StatusDot }) {
  if (!status || status === 'none') return null;
  const cls =
    status === 'working'
      ? 'bg-emerald-400'
      : 'bg-amber-400';
  const label = status === 'working' ? 'Active' : 'Configured';
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />
      <span className="text-xs font-medium text-slate-500">{label}</span>
    </span>
  );
}

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
        <div className="font-semibold leading-snug text-slate-900">{cat.title}</div>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{cat.description}</p>
      </div>

      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-xs font-semibold text-indigo-600 group-hover:underline">Open</span>
        <StatusIndicator status={cat.status} />
      </div>
    </Link>
  );
}

export default function AdminSettingsPage() {
  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Settings</h1>
          <p className="admin-page-subtitle">
            Manage building configuration, integrations, billing rules, and operator accounts.
          </p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((cat) => (
          <CategoryCard key={cat.id} cat={cat} />
        ))}
      </div>
    </main>
  );
}
