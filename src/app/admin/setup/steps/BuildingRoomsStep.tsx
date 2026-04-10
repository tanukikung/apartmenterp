'use client';

import { Building2, Home, Hash, CheckCircle } from 'lucide-react';
import type { BuildingData } from '../hooks/useSetupWizard';

interface BuildingRoomsStepProps {
  building: BuildingData;
  onBuildingChange: (data: Partial<BuildingData>) => void;
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

export function BuildingRoomsStep({
  building,
  onBuildingChange,
  errors = {},
}: BuildingRoomsStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-container)]">
          <Building2 className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--on-surface)]">ข้อมูลอาคาร</h2>
          <p className="text-sm text-[var(--on-surface-variant)]">กรอกข้อมูลพื้นฐานของอาคาร</p>
        </div>
      </div>

      {/* Building Info */}
      <div className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)] p-5 space-y-5">
        <h3 className="text-sm font-semibold text-[var(--on-surface-variant)] uppercase tracking-wide">ข้อมูลอาคาร</h3>

        <FieldRow label="ชื่ออาคาร" icon={<Building2 className="h-4 w-4" />}>
          <input
            type="text"
            value={building.name}
            onChange={(e) => onBuildingChange({ name: e.target.value })}
            placeholder="อาคารชื่อ..."
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
          {errors.name && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.name}</p>}
        </FieldRow>

        <FieldRow label="ที่อยู่" icon={<Home className="h-4 w-4" />}>
          <textarea
            value={building.address}
            onChange={(e) => onBuildingChange({ address: e.target.value })}
            placeholder="123 ถนน... ตำบล... อำเภอ..."
            rows={2}
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 resize-none"
          />
          {errors.address && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.address}</p>}
        </FieldRow>

        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="โทรศัพท์" icon={<Building2 className="h-4 w-4" />}>
            <input
              type="text"
              value={building.phone}
              onChange={(e) => onBuildingChange({ phone: e.target.value })}
              placeholder="02-xxx-xxxx"
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
            {errors.phone && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.phone}</p>}
          </FieldRow>

          <FieldRow label="อีเมล" icon={<Building2 className="h-4 w-4" />}>
            <input
              type="email"
              value={building.email}
              onChange={(e) => onBuildingChange({ email: e.target.value })}
              placeholder="contact@building.com"
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
          </FieldRow>
        </div>

        <FieldRow label="เลขผู้เสียภาษี" icon={<Hash className="h-4 w-4" />}>
          <input
            type="text"
            value={building.taxId}
            onChange={(e) => onBuildingChange({ taxId: e.target.value })}
            placeholder="0-0000-00000-00-0"
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </FieldRow>
      </div>

      {/* Hardcoded Rooms Info */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          <h3 className="text-sm font-semibold text-emerald-800">ห้องพัก — กำหนดไว้แล้ว</h3>
        </div>
        <div className="space-y-1.5 text-sm text-emerald-700">
          <p>• <strong>ชั้น 1</strong> — 798/1–798/15 (15 ห้อง)</p>
          <p>• <strong>ชั้น 2–8</strong> — 3201–3232, 3301–3332, ... 3801–3832 (32 ห้อง/ชั้น)</p>
          <p className="pt-1 font-semibold">รวม 8 ชั้น · 239 ห้อง</p>
        </div>
      </div>
    </div>
  );
}
