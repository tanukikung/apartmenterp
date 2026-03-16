'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Pause,
  Play,
  RotateCw,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JobStatus = 'idle' | 'running' | 'error';

interface Job {
  id: string;
  name: string;
  description: string;
  schedule: string;
  lastRun: string | null;
  status: JobStatus;
}

interface ToastMessage {
  jobId: string;
  message: string;
  type: 'error' | 'success';
}

// ---------------------------------------------------------------------------
// Static job config
// ---------------------------------------------------------------------------

const JOB_CONFIG: Job[] = [
  {
    id: 'billing-generate',
    name: 'Generate Billing Cycles',
    description: 'Auto-generate monthly billing cycles for active rooms',
    schedule: '1st of each month',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'invoice-send',
    name: 'Send Invoice Notifications',
    description: 'Send LINE/email notifications for new invoices',
    schedule: 'Daily 8:00 AM',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'overdue-flag',
    name: 'Flag Overdue Invoices',
    description: 'Mark invoices past due date as OVERDUE',
    schedule: 'Daily 9:00 AM',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'late-fee',
    name: 'Apply Late Fees',
    description: 'Apply penalty fees to overdue accounts',
    schedule: 'Daily 9:30 AM',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'db-cleanup',
    name: 'Database Cleanup',
    description: 'Archive old logs and optimize database tables',
    schedule: 'Weekly Sunday 2:00 AM',
    lastRun: null,
    status: 'idle',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ApiJobEntry {
  id?: string;
  status?: JobStatus;
  lastRun?: string | null;
}

function mergeApiStatus(config: Job[], apiData: ApiJobEntry[]): Job[] {
  const apiMap = new Map<string, ApiJobEntry>(
    apiData.map((entry) => [entry.id ?? '', entry]),
  );
  return config.map((job) => {
    const remote = apiMap.get(job.id);
    if (!remote) return job;
    return {
      ...job,
      status: remote.status ?? job.status,
      lastRun: remote.lastRun ?? job.lastRun,
    };
  });
}

function formatLastRun(lastRun: string | null): string {
  if (!lastRun) return 'Never';
  try {
    return new Date(lastRun).toLocaleString();
  } catch {
    return lastRun;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: JobStatus }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <Play className="w-3 h-3" />
        Running
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      <Pause className="w-3 h-3" />
      Idle
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SystemJobsPage() {
  const [jobs, setJobs] = useState<Job[]>(JOB_CONFIG);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningJobIds, setRunningJobIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // -------------------------------------------------------------------------
  // Fetch job status
  // -------------------------------------------------------------------------

  const fetchJobStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      const res = await fetch('/api/admin/jobs');
      if (!res.ok) {
        // API not available — use static config
        setJobs(JOB_CONFIG);
        return;
      }
      const json = await res.json() as { success?: boolean; data?: ApiJobEntry[] };
      if (json.success && Array.isArray(json.data)) {
        setJobs(mergeApiStatus(JOB_CONFIG, json.data));
      } else {
        setJobs(JOB_CONFIG);
      }
    } catch {
      // Network error or API not configured — use static config
      setJobs(JOB_CONFIG);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobStatus(false);
  }, [fetchJobStatus]);

  // -------------------------------------------------------------------------
  // Run a job
  // -------------------------------------------------------------------------

  const pushToast = (jobId: string, message: string, type: ToastMessage['type']) => {
    setToasts((prev) => [...prev, { jobId, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !(t.jobId === jobId && t.message === message)));
    }, 5000);
  };

  const handleRunNow = async (job: Job) => {
    if (runningJobIds.has(job.id)) return;

    setRunningJobIds((prev) => new Set(prev).add(job.id));

    // Optimistically mark as running in the list
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, status: 'running' as JobStatus } : j)),
    );

    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/run`, { method: 'POST' });

      if (res.status === 404 || res.status === 500) {
        pushToast(job.id, 'Not available in this environment.', 'error');
        setJobs((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, status: 'idle' as JobStatus } : j)),
        );
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: { message?: string } };
        pushToast(job.id, json?.error?.message ?? `Job failed with status ${res.status}.`, 'error');
        setJobs((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, status: 'error' as JobStatus } : j)),
        );
        return;
      }

      const now = new Date().toISOString();
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id ? { ...j, status: 'idle' as JobStatus, lastRun: now } : j,
        ),
      );
      pushToast(job.id, `${job.name} completed successfully.`, 'success');
    } catch {
      pushToast(job.id, 'A network error occurred. Please try again.', 'error');
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: 'error' as JobStatus } : j)),
      );
    } finally {
      setRunningJobIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">System Jobs</h1>
          <p className="admin-page-subtitle">
            Scheduled background tasks, billing automation, and system maintenance jobs.
          </p>
        </div>
        <div className="admin-toolbar">
          <button
            onClick={() => fetchJobStatus(true)}
            disabled={refreshing}
            className="admin-button inline-flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map((toast, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${
                toast.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
              )}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          <RotateCw className="w-5 h-5 animate-spin mr-2" />
          Loading jobs…
        </div>
      ) : (
        <section className="space-y-4">
          {jobs.map((job) => {
            const isRunning = runningJobIds.has(job.id) || job.status === 'running';
            const jobToast = toasts.find((t) => t.jobId === job.id);

            return (
              <div key={job.id} className="admin-card">
                <div className="admin-card-header">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="admin-card-title">{job.name}</h3>
                    <StatusBadge status={job.status} />
                  </div>
                  <button
                    onClick={() => handleRunNow(job)}
                    disabled={isRunning}
                    className="admin-button admin-button-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {isRunning ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        Running…
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Run Now
                      </>
                    )}
                  </button>
                </div>

                <div className="px-4 pb-4 space-y-3">
                  <p className="text-sm text-slate-600">{job.description}</p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="font-medium">Schedule:</span>
                      <span className="admin-badge">{job.schedule}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {job.lastRun ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                      )}
                      <span className="font-medium">Last run:</span>
                      <span>{formatLastRun(job.lastRun)}</span>
                    </div>
                  </div>

                  {/* Inline toast for this job */}
                  {jobToast && (
                    <div
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                        jobToast.type === 'success'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {jobToast.type === 'success' ? (
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {jobToast.message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Footer link */}
      <div className="mt-6">
        <Link href="/admin/system" className="text-sm text-slate-500 hover:text-slate-700">
          ← System Health
        </Link>
      </div>
    </main>
  );
}
