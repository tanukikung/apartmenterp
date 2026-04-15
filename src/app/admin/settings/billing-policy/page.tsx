'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Save } from 'lucide-react';

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
    <div className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-5">
      <div>
        <div className="font-semibold text-on-surface">{label}</div>
        <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-24 rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface text-center tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

export default function BillingPolicyPage() {
  const queryClient = useQueryClient();

  // useQuery for billing settings
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

  // Local state mirroring original behaviour
  const [fields, setFields] = useState<BillingSettings>(DEFAULTS);
  const [originalFields, setOriginalFields] = useState<BillingSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Sync from useQuery result to local state
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

  // Replace load() with invalidate + refetch
  const load = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
  }, [queryClient]);

  const isDirty = JSON.stringify(fields) !== JSON.stringify(originalFields);

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
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm transition-colors hover:border-primary30 hover:bg-surface-container"
          >
            <ArrowLeft className="h-4 w-4 text-on-primary" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-on-primary">ปฏิทินการเรียกเก็บ</h1>
            <p className="text-sm text-on-primary/80">
              หน้านี้เชื่อมต่อกับ API ตั้งค่าการเรียกเก็บจริง
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <div className="auth-alert auth-alert-success">{message}</div>
      ) : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="rounded-2xl border border-sky-100 bg-sky-50/60 px-5 py-4 text-sm text-sky-800">
        รองรับเฉพาะวันเรียกเก็บ วันครบกำหนด และวันค้างชำระเท่านั้น ค่าปรับ ระยะปลอดค่าปรับ และการควบคุมนโยบายอื่นๆ จะทยอยเพิ่มเมื่อมีการสนับสนุน backend
      </section>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-surface-container" />
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

      <div className="flex items-center justify-between rounded-xl border border-outline-variant/10 bg-surface-container-lowest px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
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
              className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
            >
              รีเซ็ต
            </button>
          ) : null}
          <button
            onClick={() => void handleSave()}
            disabled={saving || isLoading || !isDirty}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            ค่าเหล่านี้ส่งผลต่อการเรียกเก็บและการคำนวณค้างชำระในอนาคตเท่านั้น ใบแจ้งหนี้ที่มีอยู่แล้วจะไม่ถูกเขียนใหม่เมื่อเปลี่ยนปฏิทิน
          </p>
        </div>
      </section>

      {message ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          บันทึกผ่าน <code className="rounded bg-emerald-50 px-1">PUT /api/admin/settings</code>
        </div>
      ) : null}
    </main>
  );
}
