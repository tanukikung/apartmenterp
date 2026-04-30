'use client';

import { User, Shield } from 'lucide-react';
import type { AdminData } from '../hooks/useSetupWizard';

interface AdminAccountStepProps {
  data: AdminData;
  onChange: (data: Partial<AdminData>) => void;
  errors?: Record<string, string>;
}

function FieldRow({
  label,
  icon,
  children,
}: {
  label: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface))]/40">
        {icon}
      </div>
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--on-surface))]/70">{label}</label>
        {children}
      </div>
    </div>
  );
}

export function AdminAccountStep({ data, onChange, errors = {} }: AdminAccountStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--on-surface))]">ข้อมูลผู้ดูแลระบบ</h2>
          <p className="text-sm text-[hsl(var(--on-surface))]/40">สร้างบัญชีผู้ดูแลระบบหลักของคุณ</p>
        </div>
      </div>

      <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 space-y-5">
        <FieldRow label="Username" icon={<User className="h-4 w-4" />}>
          <input
            type="text"
            value={data.username}
            onChange={(e) => onChange({ username: e.target.value })}
            placeholder="owner"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/20 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {errors.username && <p className="mt-1 text-xs text-red-400">{errors.username}</p>}
          <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">3-32 ตัวอักษร ประกอบด้วย a-z, A-Z, 0-9, ., _, -</p>
        </FieldRow>

        <FieldRow label="Display Name" icon={<User className="h-4 w-4" />}>
          <input
            type="text"
            value={data.displayName}
            onChange={(e) => onChange({ displayName: e.target.value })}
            placeholder="ชื่อผู้ดูแลระบบ"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/20 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {errors.displayName && <p className="mt-1 text-xs text-red-400">{errors.displayName}</p>}
        </FieldRow>

        <FieldRow label="Password" icon={<Shield className="h-4 w-4" />}>
          <input
            type="password"
            value={data.password}
            onChange={(e) => onChange({ password: e.target.value })}
            placeholder="••••••••"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/20 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password}</p>}
          <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">8-128 ตัวอักษร</p>
        </FieldRow>

        <FieldRow label="ยืนยัน Password" icon={<Shield className="h-4 w-4" />}>
          <input
            type="password"
            value={data.confirmPassword}
            onChange={(e) => onChange({ confirmPassword: e.target.value })}
            placeholder="••••••••"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/20 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword}</p>}
        </FieldRow>
      </div>
    </div>
  );
}
