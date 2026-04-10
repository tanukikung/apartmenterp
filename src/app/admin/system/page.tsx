'use client';

import React, { useState, useEffect } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { RunBackupButton } from './RunBackupButton';

type HealthData = {
  status: 'ok' | 'degraded' | 'error';
  services?: {
    database?: string;
    env?: string;
  };
  version?: string;
  environment?: string;
  timestamp?: string;
};

type DeepHealthData = {
  services?: {
    redis?: string;
    outbox?: { queueLength?: number; failedCount?: number };
    worker?: { alive?: boolean; lastHeartbeatMsAgo?: number | null };
  };
  servicesDetailed?: {
    worker?: { lastHeartbeatAt?: string | null };
  };
};

type MetricsData = {
  outbox?: { queueLength?: number; failedCount?: number };
  invoices?: { total?: number; overdue?: number };
  payments?: { matchRate?: number; manualReviewCount?: number };
};

type BackupStatus = {
  latestBackupAt: string | null;
  retentionDays: number;
  dir: string;
  cron: string;
};

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null as T | null;
    const json = await res.json();
    return (json?.data as T) ?? (null as T | null);
  } catch {
    return null as T | null;
  }
}

function tone(status?: string): string {
  if (status === 'ok' || status === 'connected' || status === 'alive') return 'bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)]';
  if (status === 'degraded') return 'bg-amber-50 text-amber-700 border border-amber-200';
  if (status === 'error' || status === 'down') return 'bg-[var(--error-container)] text-[var(--on-error-container)]';
  return 'bg-[var(--surface-container)] text-[var(--on-surface-variant)]';
}

export default function AdminSystemPage() {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [deepData, setDeepData] = useState<DeepHealthData | null>(null);
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [backupData, setBackupData] = useState<BackupStatus | null>(null);

  useEffect(() => {
    async function load() {
      const [h, d, m, b] = await Promise.all([
        fetchJson<HealthData>('/api/health'),
        fetchJson<DeepHealthData>('/api/health/deep'),
        fetchJson<MetricsData>('/api/metrics'),
        fetchJson<BackupStatus>('/api/system/backup-status'),
      ]);
      setHealthData(h);
      setDeepData(d);
      setMetricsData(m);
      setBackupData(b);
    }
    void load();
  }, []);

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[var(--on-primary)]">ระบบ</h1>
            <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">ตรวจสอบสถานะแอปพลิเคชัน เวิร์คเกอร์ ความลึกคิว และความพร้อมการสำรองข้อมูล</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/admin/system" className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-white/30">
              รีเฟรช
            </a>
            <RunBackupButton />
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-shadow">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">สถานะระบบ</div>
          <div className="mt-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${tone(healthData?.status)}`}>{healthData?.status || 'ไม่พร้อมใช้งาน'}</span>
          </div>
          <div className="mt-3 text-sm text-[var(--on-surface-variant)]">สภาพแวดล้อม: {healthData?.services?.env || '-'} · DB: {healthData?.services?.database || '-'}</div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-shadow">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">เวิร์คเกอร์</div>
          <div className="mt-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${tone(deepData?.services?.worker?.alive ? 'alive' : 'down')}`}>
              {deepData?.services?.worker?.alive ? 'เปิดใช้งาน' : 'ปิด'}
            </span>
          </div>
          <div className="mt-3 text-sm text-[var(--on-surface-variant)]">เช็คสถานะ: {deepData?.services?.worker?.lastHeartbeatMsAgo ?? '-'} มิลลิวินาทีที่แล้ว</div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-shadow">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">คิวออกบอกซ์</div>
          <div className="mt-3 text-2xl font-extrabold text-[var(--primary)]">{metricsData?.outbox?.queueLength ?? 0}</div>
          <div className="mt-2 text-sm text-[var(--on-surface-variant)]">อีเวนต์ที่ล้มเหลว: {metricsData?.outbox?.failedCount ?? 0}</div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-shadow">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">อัตราจับคู่การชำระ</div>
          <div className="mt-3 text-2xl font-extrabold text-[var(--primary)]">{Math.round((metricsData?.payments?.matchRate ?? 0) * 100)}%</div>
          <div className="mt-2 text-sm text-[var(--on-surface-variant)]">ตรวจสอบด้วยตนเอง: {metricsData?.payments?.manualReviewCount ?? 0}</div>
        </div>
      </section>

      {/* Detail Cards */}
      <section className="grid gap-6 xl:grid-cols-3">
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--outline-variant)]/10">
            <div className="text-sm font-semibold text-[var(--primary)]">สถานะแอปพลิเคชัน</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-[var(--on-surface)]">
            <div>ภาพรวม: <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${tone(healthData?.status)}`}>{healthData?.status || 'ไม่ทราบ'}</span></div>
            <div>ฐานข้อมูล: {healthData?.services?.database || '-'}</div>
            <div>สภาพแวดล้อม: {healthData?.services?.env || '-'}</div>
            <div>เวอร์ชัน: {healthData?.version || '-'} ({healthData?.environment || '-'})</div>
            <div className="text-xs text-[var(--on-surface-variant)]">
              อัปเดตล่าสุด <ClientOnly fallback="-">{healthData?.timestamp ? new Date(healthData.timestamp).toLocaleString('th-TH') : '-'}</ClientOnly>
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--outline-variant)]/10">
            <div className="text-sm font-semibold text-[var(--primary)]">เวิร์คเกอร์และคิว</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-[var(--on-surface)]">
            <div>Redis: {deepData?.services?.redis || '-'}</div>
            <div>เวิร์คเกอร์: {deepData?.services?.worker?.alive ? 'เปิดใช้งาน' : 'ปิด'}</div>
            <div>ความยาวคิว: {deepData?.services?.outbox?.queueLength ?? 0}</div>
            <div>อีเวนต์ที่ล้มเหลว: {deepData?.services?.outbox?.failedCount ?? 0}</div>
            <div className="text-xs text-[var(--on-surface-variant)]">
              เช็คสถานะล่าสุด <ClientOnly fallback="-">{deepData?.servicesDetailed?.worker?.lastHeartbeatAt ? new Date(deepData.servicesDetailed.worker.lastHeartbeatAt).toLocaleString('th-TH') : '-'}</ClientOnly>
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--outline-variant)]/10">
            <div className="text-sm font-semibold text-[var(--primary)]">สถานะการสำรองข้อมูล</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-[var(--on-surface)]">
            <div>การสำรองล่าสุด: <ClientOnly fallback="-">{backupData?.latestBackupAt ? new Date(backupData.latestBackupAt).toLocaleString('th-TH') : '-'}</ClientOnly></div>
            <div>จำนวนวันที่เก็บรักษา: {backupData?.retentionDays ?? '-'}</div>
            <div>ไดเรกทอรีสำรอง: <span className="font-mono text-xs text-[var(--on-surface-variant)]">{backupData?.dir || '-'}</span></div>
            <div>Cron: <span className="font-mono text-xs text-[var(--on-surface-variant)]">{backupData?.cron || '-'}</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
