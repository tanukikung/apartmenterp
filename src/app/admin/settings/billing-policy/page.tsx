'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Save } from 'lucide-react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

type BillingSettings = {
  billingDay: number;
  dueDay: number;
  overdueDay: number;
};

type ApiResponse = {
  success: boolean;
  data?: BillingSettings;
  error?: { message?: string };
};

const DEFAULTS: BillingSettings = {
  billingDay: 1,
  dueDay: 5,
  overdueDay: 15,
};

function SettingRow({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className=" rounded-xl p-5 flex items-center justify-between gap-4">
      <div>
        <div className="font-semibold text-[hsl(var(--card-foreground))]">{label}</div>
        <p className="mt-1 text-sm text-[hsl(var(--on-surface-variant))]">{description}</p>
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-24 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] text-center tabular-nums focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40"
      />
    </div>
  );
}

export default function BillingPolicyPage() {
  const queryClient = useQueryClient();

  const {
    isLoading,
    data: queryData,
    error: queryError,
  } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' });
      const json = await res.json() as ApiResponse;
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดการตั้งค่าการเรียกเก็บได้');
      }
      return json;
    },
  });

  const [fields, setFields] = useState<BillingSettings>(DEFAULTS);
  const [originalFields, setOriginalFields] = useState<BillingSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'ไม่สามารถโหลดการตั้งค่าการเรียกเก็บได้');
      return;
    }
    if (queryData) {
      setFields(queryData.data as BillingSettings);
      setOriginalFields(queryData.data as BillingSettings);
      setError(null);
    }
  }, [queryData, queryError]);

  const _load = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
  }, [queryClient]);

  const isDirty = JSON.stringify(fields) !== JSON.stringify(originalFields);

  useUnsavedChanges(isDirty);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = (await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      }).then((r) => r.json())) as ApiResponse;

      if (!res.success) {
        throw new Error(res.error?.message ?? 'ไม่สามารถบันทึกการตั้งค่าการเรียกเก็บได้');
      }
      setOriginalFields(fields);
      setMessage('ปฏิทินการเรียกเก็บอัปเดตแล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกการตั้งค่าการเรียกเก็บได้');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6">
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  shadow-sm transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4 text-[hsl(var(--primary))]" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[hsl(var(--card-foreground))]">ปฏิทินการเรียกเก็บ</h1>
            <p className="text-sm text-[hsl(var(--on-surface-variant))]">
              หน้านี้เชื่อมต่อกับ API ตั้งค่าการเรียกเก็บจริง
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-blue-500/20 px-5 py-4 text-sm" style={{ background: 'rgba(99,102,241,0.05)', color: 'hsl(var(--primary))' }}>
        รองรับเฉพาะวันเรียกเก็บ วันครบกำหนด และวันค้างชำระเท่านั้น ค่าปรับ ระยะปลอดค่าปรับ และการควบคุมนโยบายอื่นๆ จะทยอยเพิ่มเมื่อมีการสนับสนุน backend
      </section>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl " />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <SettingRow
            label="วันเรียกเก็บ"
            description="วันที่สร้างรายการเรียกเก็บของแต่ละเดือน"
            value={fields.billingDay}
            min={1}
            max={28}
            onChange={(billingDay) => setFields((prev) => ({ ...prev, billingDay }))}
          />
          <SettingRow
            label="วันครบกำหนด"
            description="วันที่ใบแจ้งหนี้ครบกำหนดชำระ"
            value={fields.dueDay}
            min={1}
            max={31}
            onChange={(dueDay) => setFields((prev) => ({ ...prev, dueDay }))}
          />
          <SettingRow
            label="วันค้างชำระ"
            description="วันที่ใบแจ้งหนี้ที่ยังไม่ชำระถูกตั้งเป็นค้างชำระ"
            value={fields.overdueDay}
            min={1}
            max={31}
            onChange={(overdueDay) => setFields((prev) => ({ ...prev, overdueDay }))}
          />
        </div>
      )}

      <div className=" rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--on-surface-variant))]">
          <CalendarDays className="h-4 w-4" />
          {isDirty ? 'คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : 'ปฏิทินการเรียกเก็บเป็นปัจจุบันแล้ว'}
        </div>
        <div className="flex items-center gap-3">
          {isDirty ? (
            <button
              onClick={() => {
                setFields(originalFields);
                setMessage(null);
                setError(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-white/5"
            >
              รีเซ็ต
            </button>
          ) : null}
          <button
            onClick={() => void handleSave()}
            disabled={saving || isLoading || !isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] text-white px-4 py-2 text-sm font-medium shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--primary))]/90 disabled:cursor-not-allowed disabled:opacity-50 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
          >
            <Save className="h-4 w-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-amber-500/20 px-5 py-4 text-sm" style={{ background: 'rgba(251,191,36,0.05)' }}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p style={{ color: '#d97706' }}>
            ค่าเหล่านี้ส่งผลต่อการเรียกเก็บและการคำนวณค้างชำระในอนาคตเท่านั้น ใบแจ้งหนี้ที่มีอยู่แล้วจะไม่ถูกเขียนใหม่เมื่อเปลี่ยนปฏิทิน
          </p>
        </div>
      </section>

      {message ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          บันทึกผ่าน <code className="rounded px-1" style={{ background: 'rgba(34,197,94,0.15)' }}>PUT /api/admin/settings</code>
        </div>
      ) : null}
    </main>
  );
}
