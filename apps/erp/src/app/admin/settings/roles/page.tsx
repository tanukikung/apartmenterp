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
      className="inline-flex items-center rounded-full border border-outline-variant bg-surface-container px-2.5 py-0.5 text-xs text-on-surface-variant"
    >
      {perm}
    </span>
  );
}

export default function SettingsRolesPage() {
  return (
    <main className="space-y-6">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Shield className="h-5 w-5 text-on-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-on-primary">บทบาทและสิทธิ์</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">
                ภาพรวมบทบาทระบบและระดับการเข้าถึง
              </p>
            </div>
          </div>
          <Link href="/admin/settings/users" className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-white/30">
            จัดการผู้ใช้ →
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/settings" className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface">
          <ArrowLeft className="h-4 w-4" /> Settings
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-on-surface">บทบาทและสิทธิ์</span>
      </div>

      {/* Role cards */}
      <div className="grid gap-5 md:grid-cols-3">
        {ROLES.map((r) => {
          const colorMap: Record<string, { border: string; bg: string; iconBg: string; iconColor: string; badge: string }> = {
            OWNER: { border: 'border-purple-200', bg: 'bg-purple-50/60', iconBg: 'bg-purple-100', iconColor: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' },
            ADMIN: { border: 'border-primary/20', bg: 'bg-primary-container/20', iconBg: 'bg-primary-container', iconColor: 'text-primary', badge: 'bg-primary-container text-primary' },
            STAFF: { border: 'border-outline-variant', bg: 'bg-surface-container', iconBg: 'bg-surface-container-high', iconColor: 'text-on-surface-variant', badge: 'bg-surface-container text-on-surface-variant' },
          };
          const c = colorMap[r.role] ?? colorMap.STAFF;
          return (
            <div key={r.role} className={`rounded-2xl border p-5 shadow-sm ${c.border} ${c.bg}`}>
              <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.iconBg}`}>
                  <Shield className={`h-5 w-5 ${c.iconColor}`} />
                </div>
                <div>
                  <div className="font-semibold text-on-surface">{r.label}</div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${c.badge}`}>
                    {r.role}
                  </span>
                </div>
              </div>
              <p className="mb-4 text-sm text-on-surface-variant">{r.description}</p>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant/60">Permissions</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.permissions.map((perm) => permissionBadge(perm))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Note */}
      <div className="rounded-2xl border border-primary/20 bg-primary-container/10 px-5 py-4 text-sm text-primary">
        <span className="font-semibold">Note:</span> Role assignments are managed under{' '}
        <Link href="/admin/settings/users" className="font-semibold underline underline-offset-2">
          Admin Users
        </Link>
        . Custom permission overrides are not currently supported — contact your system administrator for role changes.
      </div>
    </main>
  );
}
