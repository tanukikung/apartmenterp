'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Globe,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  Save,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BuildingProfile = {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  logoUrl: string;
  updatedAt: string | null;
};

const DEFAULTS: BuildingProfile = {
  name: '',
  address: '',
  phone: '',
  email: '',
  taxId: '',
  logoUrl: '',
  updatedAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTs(iso: string | null): string {
  if (!iso) return 'ยังไม่บันทึก';
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function LetterheadPreview({ profile }: { profile: BuildingProfile }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] shadow-sm">
      {/* Gradient header strip */}
      <div className="h-2 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

      <div className="p-6">
        {/* Logo / Name row */}
        <div className="flex items-center gap-4">
          {profile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logoUrl}
              alt="โลโก้อาคาร"
              className="h-12 w-12 rounded-xl object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm">
              <Building2 className="h-6 w-6 text-white" />
            </div>
          )}
          <div>
            <div className="text-lg font-bold leading-tight text-[var(--on-surface)]">
              {profile.name || <span className="italic text-[var(--on-surface-variant)]">ชื่ออาคาร</span>}
            </div>
            {profile.taxId && (
              <div className="mt-0.5 text-xs text-[var(--on-surface-variant)]">
                เลขที่ผู้เสียภาษี: {profile.taxId}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-[var(--outline-variant)]" />

        {/* Contact grid */}
        <div className="grid gap-2 text-sm text-[var(--on-surface-variant)]">
          {profile.address && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--on-surface-variant)]" />
              <span className="leading-snug">{profile.address}</span>
            </div>
          )}
          {profile.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-[var(--on-surface-variant)]" />
              <span>{profile.phone}</span>
            </div>
          )}
          {profile.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-[var(--on-surface-variant)]" />
              <span>{profile.email}</span>
            </div>
          )}
          {!profile.address && !profile.phone && !profile.email && (
            <p className="italic text-[var(--on-surface-variant)]">กรอกข้อมูลติดต่อเพื่อดูตัวอย่าง</p>
          )}
        </div>

        {/* Footer strip */}
        <div className="mt-5 rounded-xl bg-[var(--surface-container)] px-3 py-2 text-xs text-[var(--on-surface-variant)]">
          ตัวอย่างการแสดงผลข้อมูลอาคารบนใบแจ้งหนี้และเอกสาร
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BuildingProfilePage() {
  const [fields, setFields] = useState<BuildingProfile>(DEFAULTS);
  const [originalFields, setOriginalFields] = useState<BuildingProfile>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/building', { cache: 'no-store' });
      const json = (await res.json()) as {
        success: boolean;
        data?: BuildingProfile;
        error?: { message?: string };
      };
      if (!json.success || !json.data) throw new Error(json.error?.message ?? 'ไม่สามารถโหลดข้อมูลอาคารได้');
      setFields(json.data);
      setOriginalFields(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลอาคารได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/building', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fields.name,
          address: fields.address,
          phone: fields.phone,
          email: fields.email,
          taxId: fields.taxId,
          logoUrl: fields.logoUrl,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถบันทึกข้อมูลอาคารได้');
      await load();
      setMessage('บันทึกข้อมูลอาคารเรียบร้อยแล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลอาคารได้');
    } finally {
      setSaving(false);
    }
  }

  const isDirty =
    fields.name !== originalFields.name ||
    fields.address !== originalFields.address ||
    fields.phone !== originalFields.phone ||
    fields.email !== originalFields.email ||
    fields.taxId !== originalFields.taxId ||
    fields.logoUrl !== originalFields.logoUrl;

  function setField<K extends keyof BuildingProfile>(key: K, value: BuildingProfile[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main className="space-y-6">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Building2 className="h-5 w-5 text-[var(--on-primary)]" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[var(--on-primary)]">ข้อมูลอาคาร</h1>
              <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">ตั้งค่าชื่ออาคาร ที่อยู่ และข้อมูลติดต่อที่พิมพ์บนเอกสาร</p>
            </div>
          </div>
          <Link href="/admin/settings" className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-white/30">
            <ArrowLeft className="h-4 w-4" /> กลับ
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/settings" className="flex items-center gap-1 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]">
          ตั้งค่า
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-[var(--on-surface)]">ข้อมูลอาคาร</span>
      </div>

      {/* Alerts */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--tertiary-container)] bg-[var(--tertiary-container)]/20 px-4 py-3 text-sm font-medium text-[var(--on-tertiary-container)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--error-container)] bg-[var(--error-container)]/20 px-4 py-3 text-sm font-medium text-[var(--on-error-container)]">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Two-column layout: form + preview */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Form */}
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-6 xl:col-span-3">
          <h2 className="mb-6 text-base font-semibold text-[var(--on-surface)]">ข้อมูลอาคาร</h2>

          {loading ? (
            <div className="space-y-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="h-9 w-9 animate-pulse rounded-xl bg-[var(--surface-container)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded-lg bg-[var(--surface-container)]" />
                    <div className="h-10 w-full animate-pulse rounded-xl bg-[var(--surface-container)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <FieldRow label="ชื่ออาคาร" icon={<Building2 className="h-4 w-4" />}>
                <input
                  type="text"
                  className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  placeholder="อพาร์ตเมนต์ซันเซท"
                  value={fields.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="ที่อยู่" icon={<MapPin className="h-4 w-4" />}>
                <textarea
                  className="w-full resize-none rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  rows={3}
                  placeholder="123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10100"
                  value={fields.address}
                  onChange={(e) => setField('address', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="หมายเลขโทรศัพท์" icon={<Phone className="h-4 w-4" />}>
                <input
                  type="tel"
                  className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  placeholder="02-XXX-XXXX"
                  value={fields.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="อีเมล" icon={<Mail className="h-4 w-4" />}>
                <input
                  type="email"
                  className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  placeholder="contact@yourbuilding.com"
                  value={fields.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="เลขที่ผู้เสียภาษี" icon={<ReceiptText className="h-4 w-4" />}>
                <input
                  type="text"
                  className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm font-mono tracking-wider text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  placeholder="0-1234-56789-01-2"
                  value={fields.taxId}
                  onChange={(e) => setField('taxId', e.target.value)}
                />
              </FieldRow>

              <FieldRow
                label={
                  <>
                    URL โลโก้{' '}
                    <span className="ml-1 text-xs font-normal text-[var(--on-surface-variant)]">(ไม่บังคับ)</span>
                  </>
                }
                icon={<Globe className="h-4 w-4" />}
              >
                <input
                  type="url"
                  className="w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  placeholder="https://example.com/logo.png"
                  value={fields.logoUrl}
                  onChange={(e) => setField('logoUrl', e.target.value)}
                />
                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                  URL ที่เข้าถึงได้สาธารณะ จะแสดงบนหัวกระดาษใบแจ้งหนี้
                </p>
              </FieldRow>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="space-y-4 xl:col-span-2">
          <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5">
            <h2 className="mb-4 text-base font-semibold text-[var(--on-surface)]">ตัวอย่างหัวกระดาษ</h2>
            <LetterheadPreview profile={fields} />
          </div>

          {/* Last updated */}
          <div className="flex items-center gap-2 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-3 text-sm text-[var(--on-surface-variant)] shadow-sm">
            <Clock className="h-4 w-4 shrink-0 text-[var(--on-surface-variant)]" />
            <span>
              บันทึกล่าสุด: <span className="font-medium text-[var(--on-surface)]">{formatTs(fields.updatedAt)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-5 py-4 shadow-sm">
        <div className="text-sm text-[var(--on-surface-variant)]">
          {isDirty ? (
            <span className="font-medium text-amber-600">คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span>
          ) : (
            'ข้อมูลอาคารเป็นปัจจุบันแล้ว'
          )}
        </div>
        <div className="flex items-center gap-3">
          {isDirty && (
            <button
              onClick={() => {
                setFields(originalFields);
                setMessage(null);
                setError(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
            >
              ยกเลิก
            </button>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving || loading || !isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </main>
  );
}
