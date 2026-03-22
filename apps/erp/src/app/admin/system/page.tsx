'use client';

import React, { useState, useEffect } from 'react';
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
  if (status === 'ok' || status === 'connected' || status === 'alive') return 'bg-tertiary-container text-on-tertiary-container';
  if (status === 'degraded') return 'bg-amber-50 text-amber-700 border border-amber-200';
  if (status === 'error' || status === 'down') return 'bg-error-container text-on-error-container';
  return 'bg-surface-container text-on-surface-variant';
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
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-on-primary">System</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">Monitor application health, worker state, queue depth, and backup readiness.</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/admin/system" className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-white/30">
              Refresh
            </a>
            <RunBackupButton />
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-shadow">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">System Health</div>
          <div className="mt-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${tone(healthData?.status)}`}>{healthData?.status || 'unavailable'}</span>
          </div>
          <div className="mt-3 text-sm text-on-surface-variant">Env: {healthData?.services?.env || '-'} · DB: {healthData?.services?.database || '-'}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-shadow">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Worker</div>
          <div className="mt-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${tone(deepData?.services?.worker?.alive ? 'alive' : 'down')}`}>
              {deepData?.services?.worker?.alive ? 'alive' : 'down'}
            </span>
          </div>
          <div className="mt-3 text-sm text-on-surface-variant">Heartbeat: {deepData?.services?.worker?.lastHeartbeatMsAgo ?? '-'} ms ago</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-shadow">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Outbox Queue</div>
          <div className="mt-3 text-2xl font-extrabold text-primary">{metricsData?.outbox?.queueLength ?? 0}</div>
          <div className="mt-2 text-sm text-on-surface-variant">Failed events: {metricsData?.outbox?.failedCount ?? 0}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-shadow">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Payment Match Rate</div>
          <div className="mt-3 text-2xl font-extrabold text-primary">{Math.round((metricsData?.payments?.matchRate ?? 0) * 100)}%</div>
          <div className="mt-2 text-sm text-on-surface-variant">Manual review: {metricsData?.payments?.manualReviewCount ?? 0}</div>
        </div>
      </section>

      {/* Detail Cards */}
      <section className="grid gap-6 xl:grid-cols-3">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/10">
            <div className="text-sm font-semibold text-primary">Application Health</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-on-surface">
            <div>Overall: <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${tone(healthData?.status)}`}>{healthData?.status || 'unknown'}</span></div>
            <div>Database: {healthData?.services?.database || '-'}</div>
            <div>Environment: {healthData?.services?.env || '-'}</div>
            <div>Version: {healthData?.version || '-'} ({healthData?.environment || '-'})</div>
            <div className="text-xs text-on-surface-variant">
              Updated {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleString() : '-'}
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/10">
            <div className="text-sm font-semibold text-primary">Worker and Queue</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-on-surface">
            <div>Redis: {deepData?.services?.redis || '-'}</div>
            <div>Worker: {deepData?.services?.worker?.alive ? 'alive' : 'down'}</div>
            <div>Queue length: {deepData?.services?.outbox?.queueLength ?? 0}</div>
            <div>Failed events: {deepData?.services?.outbox?.failedCount ?? 0}</div>
            <div className="text-xs text-on-surface-variant">
              Last heartbeat {deepData?.servicesDetailed?.worker?.lastHeartbeatAt ? new Date(deepData.servicesDetailed.worker.lastHeartbeatAt).toLocaleString() : '-'}
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/10">
            <div className="text-sm font-semibold text-primary">Backup Status</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-on-surface">
            <div>Latest backup: {backupData?.latestBackupAt ? new Date(backupData.latestBackupAt).toLocaleString() : 'N/A'}</div>
            <div>Retention days: {backupData?.retentionDays ?? '-'}</div>
            <div>Backup dir: <span className="font-mono text-xs text-on-surface-variant">{backupData?.dir || '-'}</span></div>
            <div>Cron: <span className="font-mono text-xs text-on-surface-variant">{backupData?.cron || '-'}</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
