'use client';

import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';

type RoleDef = {
  role: string;
  label: string;
  description: string;
  permissions: string[];
};

const ROLES: RoleDef[] = [
  {
    role: 'OWNER',
    label: 'Owner',
    description: 'Full unrestricted access to all modules, settings, and financial data.',
    permissions: [
      'All admin modules',
      'User management',
      'Settings & billing policy',
      'Financial reports',
      'Audit log access',
      'System administration',
    ],
  },
  {
    role: 'ADMIN',
    label: 'Admin',
    description: 'Full operational access excluding owner-level system configuration.',
    permissions: [
      'Property management (floors, rooms, tenants)',
      'Billing & payments',
      'Document management',
      'Chat & notifications',
      'Reports & analytics',
      'Audit logs (read-only)',
    ],
  },
  {
    role: 'STAFF',
    label: 'Staff',
    description: 'Day-to-day operations: tenant communications, payment recording, basic reporting.',
    permissions: [
      'View rooms & tenants',
      'Record payments',
      'Send messages via LINE',
      'View invoices & documents',
      'View basic reports',
    ],
  },
];

function permissionBadge(perm: string) {
  return (
    <span
      key={perm}
      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600"
    >
      {perm}
    </span>
  );
}

export default function SettingsRolesPage() {
  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link href="/admin/settings" className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Settings
          </Link>
          <span className="text-slate-300">/</span>
          <div>
            <h1 className="admin-page-title">Roles &amp; Permissions</h1>
            <p className="admin-page-subtitle">
              Overview of system roles and their access levels. Roles are assigned when creating admin users.
            </p>
          </div>
        </div>
        <div className="admin-toolbar">
          <Link href="/admin/settings/users" className="admin-button admin-button-primary flex items-center gap-2">
            Manage Users →
          </Link>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-3">
        {ROLES.map((r) => {
          const colorMap: Record<string, { border: string; bg: string; iconBg: string; iconColor: string; badge: string }> = {
            OWNER: { border: 'border-purple-200', bg: 'bg-purple-50/60', iconBg: 'bg-purple-100', iconColor: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' },
            ADMIN: { border: 'border-indigo-200', bg: 'bg-indigo-50/60', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
            STAFF: { border: 'border-slate-200', bg: 'bg-slate-50/60', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', badge: 'bg-slate-100 text-slate-700' },
          };
          const c = colorMap[r.role] ?? colorMap.STAFF;
          return (
            <div key={r.role} className={`rounded-3xl border p-5 shadow-sm ${c.border} ${c.bg}`}>
              <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${c.iconBg}`}>
                  <Shield className={`h-5 w-5 ${c.iconColor}`} />
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{r.label}</div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${c.badge}`}>
                    {r.role}
                  </span>
                </div>
              </div>
              <p className="mb-4 text-sm text-slate-600">{r.description}</p>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Permissions</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.permissions.map((perm) => permissionBadge(perm))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50/60 px-5 py-4 text-sm text-sky-800">
        <span className="font-semibold">Note:</span> Role assignments are managed under{' '}
        <Link href="/admin/settings/users" className="font-semibold underline underline-offset-2">
          Admin Users
        </Link>
        . Custom permission overrides are not currently supported — contact your system administrator for role changes.
      </div>
    </main>
  );
}
