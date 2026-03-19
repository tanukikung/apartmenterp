'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Receipt, Shield, Users } from 'lucide-react';

type SettingCategory = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
};

const CATEGORIES: SettingCategory[] = [
  {
    id: 'users',
    title: 'Admin Users',
    description: 'Create and manage operator accounts, display names, and roles.',
    href: '/admin/settings/users',
    icon: <Users className="h-6 w-6" />,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  {
    id: 'billing-policy',
    title: 'Billing Calendar',
    description: 'Manage the real billing day, due day, and overdue day used by the ERP.',
    href: '/admin/settings/billing-policy',
    icon: <Receipt className="h-6 w-6" />,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
  },
  {
    id: 'roles',
    title: 'Roles & Permissions',
    description: 'Reference the current Owner, Admin, and Staff permission levels.',
    href: '/admin/settings/roles',
    icon: <Shield className="h-6 w-6" />,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
  },
];

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
      <div className="mt-auto pt-1">
        <span className="text-xs font-semibold text-indigo-600 group-hover:underline">
          Open
        </span>
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
            Only connected settings are listed here. Unsupported configuration pages are hidden.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        Hidden in this deployment: Building Info, Bank Accounts, Automation Rules, LINE Integration,
        and Room Settings. Those pages are intentionally unavailable until backend support exists.
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((cat) => (
          <CategoryCard key={cat.id} cat={cat} />
        ))}
      </div>
    </main>
  );
}
