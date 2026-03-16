import React from 'react';
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
  if (status === 'ok' || status === 'connected' || status === 'alive') return 'admin-status-good';
  if (status === 'degraded') return 'admin-status-warn';
  if (status === 'error' || status === 'down') return 'admin-status-bad';
  return '';
}

export default async function AdminSystemPage() {
  const [health, deep, metrics, backup] = await Promise.all([
    fetchJson<HealthData>('/api/health'),
    fetchJson<DeepHealthData>('/api/health/deep'),
    fetchJson<MetricsData>('/api/metrics'),
    fetchJson<BackupStatus>('/api/system/backup-status'),
  ]);

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">System</h1>
          <p className="admin-page-subtitle">Monitor application health, worker state, queue depth, and backup readiness.</p>
        </div>
        <div className="admin-toolbar">
          <a href="/admin/system" className="admin-button">Refresh</a>
          <RunBackupButton />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="admin-kpi">
          <div className="admin-kpi-label">System Health</div>
          <div className="mt-3">
            <span className={`admin-badge ${tone(health?.status)}`}>{health?.status || 'unavailable'}</span>
          </div>
          <div className="mt-3 text-sm text-slate-500">Env: {health?.services?.env || '-'} • DB: {health?.services?.database || '-'}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Worker</div>
          <div className="mt-3">
            <span className={`admin-badge ${tone(deep?.services?.worker?.alive ? 'alive' : 'down')}`}>
              {deep?.services?.worker?.alive ? 'alive' : 'down'}
            </span>
          </div>
          <div className="mt-3 text-sm text-slate-500">Heartbeat: {deep?.services?.worker?.lastHeartbeatMsAgo ?? '-'} ms ago</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Outbox Queue</div>
          <div className="admin-kpi-value">{metrics?.outbox?.queueLength ?? 0}</div>
          <div className="mt-2 text-sm text-slate-500">Failed events: {metrics?.outbox?.failedCount ?? 0}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Payment Match Rate</div>
          <div className="admin-kpi-value">{Math.round((metrics?.payments?.matchRate ?? 0) * 100)}%</div>
          <div className="mt-2 text-sm text-slate-500">Manual review: {metrics?.payments?.manualReviewCount ?? 0}</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Application Health</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-slate-600">
            <div>Overall: <span className={`admin-badge ${tone(health?.status)}`}>{health?.status || 'unknown'}</span></div>
            <div>Database: {health?.services?.database || '-'}</div>
            <div>Environment: {health?.services?.env || '-'}</div>
            <div>Version: {health?.version || '-'} ({health?.environment || '-'})</div>
            <div className="text-xs text-slate-500">
              Updated {health?.timestamp ? new Date(health.timestamp).toLocaleString() : '-'}
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Worker and Queue</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-slate-600">
            <div>Redis: {deep?.services?.redis || '-'}</div>
            <div>Worker: {deep?.services?.worker?.alive ? 'alive' : 'down'}</div>
            <div>Queue length: {deep?.services?.outbox?.queueLength ?? 0}</div>
            <div>Failed events: {deep?.services?.outbox?.failedCount ?? 0}</div>
            <div className="text-xs text-slate-500">
              Last heartbeat {deep?.servicesDetailed?.worker?.lastHeartbeatAt ? new Date(deep.servicesDetailed.worker.lastHeartbeatAt).toLocaleString() : '-'}
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Backup Status</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-slate-600">
            <div>Latest backup: {backup?.latestBackupAt ? new Date(backup.latestBackupAt).toLocaleString() : 'N/A'}</div>
            <div>Retention days: {backup?.retentionDays ?? '-'}</div>
            <div>Backup dir: <span className="font-mono text-xs">{backup?.dir || '-'}</span></div>
            <div>Cron: <span className="font-mono text-xs">{backup?.cron || '-'}</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
