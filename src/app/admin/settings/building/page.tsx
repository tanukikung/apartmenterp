'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Globe,
  MapPin,
  Phone,
  ReceiptText,
  Save,
  XCircle,
} from 'lucide-react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

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
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ">
        {icon}
      </div>
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--on-surface))]">{label}</label>
        {children}
      </div>
    </div>
  );
}

function LetterheadPreview({ profile }: { profile: BuildingProfile }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))]  shadow-md">
      <div className="h-1 w-full bg-gradient-to-r from-[hsl(var(--primary))] via-purple-500 to-pink-500" />
      <div className="p-5">
        <div className="flex items-center gap-4">
          {profile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logoUrl}
              alt="โลโก้อาคาร"
              className="h-12 w-12 rounded-xl object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-purple-600 shadow-sm">
              <Building2 className="h-6 w-6 text-white" />
            </div>
          )}
          <div>
            <div className="text-base font-bold leading-tight text-[hsl(var(--card-foreground))]">
              {profile.name || <span className="italic text-[hsl(var(--on-surface-variant))]">ชื่ออาคาร</span>}
            </div>
            {profile.taxId && (
              <div className="mt-0.5 text-xs text-[hsl(var(--on-surface-variant))]">
                เลขที่ผู้เสียภาษี: {profile.taxId}
              </div>
            )}
          </div>
        </div>
        <div className="my-4 border-t border-[hsl(var([hsl(var(--color-border))]))]" />
        <div className="space-y-2 text-sm text-[hsl(var(--on-surface-variant))]">
          {profile.address && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="leading-snug">{profile.address}</span>
            </div>
          )}
          {profile.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>{profile.phone}</span>
            </div>
          )}
          {profile.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span>{profile.email}</span>
            </div>
          )}
          {!profile.address && !profile.phone && !profile.email && (
            <p className="italic">กรอกข้อมูลติดต่อเพื่อดูตัวอย่าง</p>
          )}
        </div>
        <div className="mt-4 rounded-xl  px-3 py-2 text-xs text-[hsl(var(--on-surface-variant))]">
          ตัวอย่างการแสดงผลข้อมูลอาคารบนใบแจ้งหนี้และเอกสาร
        </div>
      </div>
    </div>
  );
}

function Mail(props: React.SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BuildingProfilePage() {
  const queryClient = useQueryClient();

  const {
    isLoading,
    data: queryData,
    error: queryError,
  } = useQuery({
    queryKey: ['settings-building'],
    queryFn: async () => {
      const res = await fetch('/api/settings/building', { cache: 'no-store' });
      const json = await res.json() as {
        success: boolean;
        data?: BuildingProfile;
        error?: { message?: string };
      };
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดข้อมูลอาคารได้');
      }
      return json;
    },
  });

  const [fields, setFields] = useState<BuildingProfile>(DEFAULTS);
  const [originalFields, setOriginalFields] = useState<BuildingProfile>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'ไม่สามารถโหลดข้อมูลอาคารได้');
      return;
    }
    if (queryData) {
      setFields(queryData.data as BuildingProfile);
      setOriginalFields(queryData.data as BuildingProfile);
      setError(null);
    }
  }, [queryData, queryError]);

  const load = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['settings-building'] });
  }, [queryClient]);

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
      load();
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

  useUnsavedChanges(isDirty);

  function setField<K extends keyof BuildingProfile>(key: K, value: BuildingProfile[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main className="space-y-6">
      {/* Page header */}
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/settings"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  shadow-sm transition-all hover:scale-105 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4 text-[hsl(var(--primary))]" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">ข้อมูลอาคาร</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">ตั้งค่าชื่ออาคาร ที่อยู่ และข้อมูลติดต่อที่พิมพ์บนเอกสาร</p>
            </div>
          </div>
        </div>
      </section>

      {/* Alerts */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Form */}
        <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  p-6 xl:col-span-3">
          <h2 className="mb-6 text-sm font-semibold text-[hsl(var(--card-foreground))]">ข้อมูลอาคาร</h2>

          {isLoading ? (
            <div className="space-y-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="h-9 w-9 animate-pulse rounded-xl " />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded-lg " />
                    <div className="h-10 w-full animate-pulse rounded-xl " />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <FieldRow label="ชื่ออาคาร" icon={<Building2 className="h-4 w-4 text-[hsl(var(--primary))]" />}>
                <input
                  type="text"
                  className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40"
                  placeholder="อพาร์ตเมนต์ซันเซท"
                  value={fields.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="ที่อยู่" icon={<MapPin className="h-4 w-4 text-[hsl(var(--primary))]" />}>
                <textarea
                  className="w-full resize-none rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40"
                  rows={3}
                  placeholder="123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10100"
                  value={fields.address}
                  onChange={(e) => setField('address', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="หมายเลขโทรศัพท์" icon={<Phone className="h-4 w-4 text-[hsl(var(--primary))]" />}>
                <input
                  type="tel"
                  className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40"
                  placeholder="02-XXX-XXXX"
                  value={fields.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="อีเมล" icon={<Mail className="h-4 w-4 text-[hsl(var(--primary))]" />}>
                <input
                  type="email"
                  className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40"
                  placeholder="contact@yourbuilding.com"
                  value={fields.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </FieldRow>

              <FieldRow label="เลขที่ผู้เสียภาษี" icon={<ReceiptText className="h-4 w-4 text-[hsl(var(--primary))]" />}>
                <input
                  type="text"
                  className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm font-mono tracking-wider text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40"
                  placeholder="0-1234-56789-01-2"
                  value={fields.taxId}
                  onChange={(e) => setField('taxId', e.target.value)}
                />
              </FieldRow>

              <FieldRow
                label={
                  <>
                    URL โลโก้{' '}
                    <span className="ml-1 text-xs font-normal text-[hsl(var(--on-surface-variant))]">(ไม่บังคับ)</span>
                  </>
                }
                icon={<Globe className="h-4 w-4 text-[hsl(var(--primary))]" />}
              >
                <input
                  type="url"
                  className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40"
                  placeholder="https://example.com/logo.png"
                  value={fields.logoUrl}
                  onChange={(e) => setField('logoUrl', e.target.value)}
                />
                <p className="mt-1 text-xs text-[hsl(var(--on-surface-variant))]">
                  URL ที่เข้าถึงได้สาธารณะ จะแสดงบนหัวกระดาษใบแจ้งหนี้
                </p>
              </FieldRow>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="space-y-4 xl:col-span-2">
          <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  p-5">
            <h2 className="mb-4 text-sm font-semibold text-[hsl(var(--card-foreground))]">ตัวอย่างหัวกระดาษ</h2>
            <LetterheadPreview profile={fields} />
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  px-4 py-3 text-sm text-[hsl(var(--on-surface-variant))] shadow-sm">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              บันทึกล่าสุด: <span className="font-medium text-[hsl(var(--card-foreground))]">{fields.updatedAt ? new Date(fields.updatedAt).toLocaleString('th-TH') : 'ยังไม่บันทึก'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className=" rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="text-sm text-[hsl(var(--on-surface-variant))]">
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
              className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-white/5"
            >
              ยกเลิก
            </button>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving || isLoading || !isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] text-white px-5 py-2 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--primary))]/90 disabled:cursor-not-allowed disabled:opacity-50 hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
          >
            <Save className="h-4 w-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </main>
  );
}