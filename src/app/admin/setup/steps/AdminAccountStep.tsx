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
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-container)] text-[var(--on-surface-variant)]">
        {icon}
      </div>
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium text-[var(--on-surface)]">{label}</label>
        {children}
      </div>
    </div>
  );
}

export function AdminAccountStep({ data, onChange, errors = {} }: AdminAccountStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-container)]">
          <Shield className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--on-surface)]">ข้อมูลผู้ดูแลระบบ</h2>
          <p className="text-sm text-[var(--on-surface-variant)]">สร้างบัญชีผู้ดูแลระบบหลักของคุณ</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)] p-5 space-y-5">
        <FieldRow label="Username" icon={<User className="h-4 w-4" />}>
          <input
            type="text"
            value={data.username}
            onChange={(e) => onChange({ username: e.target.value })}
            placeholder="owner"
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
          {errors.username && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.username}</p>}
          <p className="mt-1 text-xs text-[var(--on-surface-variant)]">3-32 ตัวอักษร ประกอบด้วย a-z, A-Z, 0-9, ., _, -</p>
        </FieldRow>

        <FieldRow label="Display Name" icon={<User className="h-4 w-4" />}>
          <input
            type="text"
            value={data.displayName}
            onChange={(e) => onChange({ displayName: e.target.value })}
            placeholder="ชื่อผู้ดูแลระบบ"
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
          {errors.displayName && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.displayName}</p>}
        </FieldRow>

        <FieldRow label="Password" icon={<Shield className="h-4 w-4" />}>
          <input
            type="password"
            value={data.password}
            onChange={(e) => onChange({ password: e.target.value })}
            placeholder="••••••••"
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
          {errors.password && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.password}</p>}
          <p className="mt-1 text-xs text-[var(--on-surface-variant)]">8-128 ตัวอักษร</p>
        </FieldRow>

        <FieldRow label="ยืนยัน Password" icon={<Shield className="h-4 w-4" />}>
          <input
            type="password"
            value={data.confirmPassword}
            onChange={(e) => onChange({ confirmPassword: e.target.value })}
            placeholder="••••••••"
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
          {errors.confirmPassword && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.confirmPassword}</p>}
        </FieldRow>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <p className="text-sm text-blue-800">
          <strong>หมายเหตุ:</strong> คุณจะถูกบังคับให้เปลี่ยนรหัสผ่านหลังจากเข้าสู่ระบบครั้งแรก
        </p>
      </div>
    </div>
  );
}
