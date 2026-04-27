'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
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
// Static job config (description / schedule live here; status merges from API)
// ---------------------------------------------------------------------------

const JOB_CONFIG: Job[] = [
  {
    id: 'billing-generate',
    name: 'สร้างรอบบิลอัตโนมัติ',
    description: 'สร้างรอบบิลรายเดือนอัตโนมัติสำหรับห้องที่ใช้งานอยู่',
    schedule: 'ทุกวันที่ 1 ของเดือน',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'invoice-send',
    name: 'ส่งแจ้งเตือนใบแจ้งหนี้',
    description: 'ส่งการแจ้งเตือน LINE/อีเมลสำหรับใบแจ้งหนี้ใหม่',
    schedule: 'ทุกวัน 08:00 น.',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'overdue-flag',
    name: 'ตั้งสถานะใบแจ้งหนี้ค้างชำระ',
    description: 'ตั้งใบแจ้งหนี้ที่เกินกำหนดชำระเป็นค้างชำระ',
    schedule: 'ทุกวัน 09:00 น.',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'late-fee',
    name: 'คิดค่าปรับ',
    description: 'คิดค่าปรับสำหรับบัญชีที่ค้างชำระ',
    schedule: 'ทุกวัน 02:00 น.',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'db-cleanup',
    name: 'ล้างข้อมูลฐานข้อมูล',
    description: 'เก็บถาวร log เก่าและปรับปรุงตารางฐานข้อมูล',
    schedule: 'ทุกวันอาทิตย์ 02:00 น.',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'contract-expiry',
    name: 'ตรวจสอบสัญญาใกล้หมด',
    description: 'ส่งแจ้งเตือนสัญญาเช่าที่ใกล้หมดอายุ (30/60/90 วัน)',
    schedule: 'ทุกวัน 09:00 น.',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'auto-reminder',
    name: 'ส่งเตือนชำระเงิน',
    description: 'ส่งเตือน LINE ให้ผู้เช่าที่มียอดค้างตาม ReminderConfig',
    schedule: 'ทุกวัน 08:00 น.',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'outbox-cleanup',
    name: 'ล้าง outbox queue',
    description: 'ลบ outbox event ที่เก่ากว่า 30 วัน',
    schedule: 'ทุกวันอาทิตย์ 04:00 น.',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'document-notify',
    name: 'แจ้งเตือนเอกสาร',
    description: 'ส่ง LINE แจ้งเตือนเอกสารที่รอดำเนินการ',
    schedule: 'ทุกวัน 07:00 น.',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'document-cleanup',
    name: 'ล้างไฟล์เอกสาร',
    description: 'เก็บถาวร/ลบไฟล์เอกสารที่หมดอายุ',
    schedule: 'ทุกวันอาทิตย์ 07:00 น.',
    lastRun: null,
    status: 'idle',
  },
  {
    id: 'backup-cleanup',
    name: 'ล้างไฟล์สำรอง',
    description: 'ลบไฟล์ backup เก่ากว่า retention period',
    schedule: 'ทุกวัน 08:00 น.',
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

function mergeApiStatus(config: Job[], apiJobs: ApiJobEntry[]): Job[] {
  const apiMap = new Map<string, ApiJobEntry>(
    apiJobs.map((entry) => [entry.id ?? '', entry]),
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
  if (!lastRun) return 'ยังไม่เคยรัน';
  try {
    return new Date(lastRun).toLocaleString('th-TH');
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
        กำลังรัน
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-error-container text-on-error-container">
        <XCircle className="w-3 h-3" />
        ข้อผิดพลาด
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      <Pause className="w-3 h-3" />
      รอดำเนินการ
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SystemJobsPage() {
  const [jobs, setJobs] = useState<Job[]>(JOB_CONFIG);
  const [workerAvailable, setWorkerAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningJobIds, setRunningJobIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // -------------------------------------------------------------------------
  // Fetch job status
  // -------------------------------------------------------------------------

  const fetchJobStatus = useCallback(async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);

    try {
      const res = await fetch('/api/admin/jobs');
      if (!res.ok) {
        setJobs(JOB_CONFIG);
        setWorkerAvailable(false);
        return;
      }
      const json = await res.json() as {
        success?: boolean;
        data?: { jobs?: ApiJobEntry[]; workerAvailable?: boolean };
      };
      if (json.success && json.data) {
        if (Array.isArray(json.data.jobs)) {
          setJobs(mergeApiStatus(JOB_CONFIG, json.data.jobs));
        }
        setWorkerAvailable(json.data.workerAvailable ?? false);
      } else {
        setJobs(JOB_CONFIG);
        setWorkerAvailable(false);
      }
    } catch {
      setJobs(JOB_CONFIG);
      setWorkerAvailable(false);
    } finally {
      setLoading(false);
      if (isRefreshing) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobStatus(false);
  }, [fetchJobStatus]);

  // -------------------------------------------------------------------------
  // Run a job — only reachable when workerAvailable === true
  // -------------------------------------------------------------------------

  const pushToast = (jobId: string, message: string, type: ToastMessage['type']) => {
    setToasts((prev) => [...prev, { jobId, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !(t.jobId === jobId && t.message === message)));
    }, 5000);
  };

  const handleRunNow = async (job: Job) => {
    if (!workerAvailable || runningJobIds.has(job.id)) return;

    setRunningJobIds((prev) => new Set(prev).add(job.id));
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, status: 'running' as JobStatus } : j)),
    );

    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/run`, { method: 'POST' });
      const json = await res.json().catch(() => ({})) as {
        error?: { message?: string };
      };

      if (!res.ok) {
        const msg = json?.error?.message ?? `งานล้มเหลว (รหัส ${res.status})`;
        pushToast(job.id, msg, 'error');
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
      pushToast(job.id, `${job.name} ถูกส่งไปทำงานสำเร็จแล้ว`, 'success');
    } catch {
      pushToast(job.id, 'เกิดข้อผิดพลาดเครือข่าย กรุณาลองใหม่', 'error');
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
    <main className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-on-primary">งานระบบ</h1>
          <p className="text-sm text-on-primary/80">
            งานเบื้องหลังที่กำหนดเวลาไว้ ระบบอัตโนมัติบิลลิ่ง และงานบำรุงรักษาระบบ
          </p>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => fetchJobStatus(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'กำลังรีเฟรช…' : 'รีเฟรช'}
          </button>
        </div>
      </section>

      {/* Worker unavailable notice — shown until workerAvailable is confirmed true */}
      {workerAvailable === false && (
        <div className="flex items-start gap-3 rounded-lg border border-warning-container/30 bg-warning-container/10 px-4 py-3 text-sm text-on-warning-container">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-on-warning-container" />
          <div>
            <span className="font-semibold">เวิร์กเกอร์เบื้องหลังไม่ทำงาน</span>
            {' '}งานจะทำงานอัตโนมัติตามตารางเวลาที่กำหนดไว้เมื่อเวิร์กเกอร์ทำงานอยู่ การรันด้วยตนเองไม่พร้อมใช้งานในสภาพแวดล้อมนี้
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map((toast, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${
                toast.type === 'success'
                  ? 'border-success-container/30 bg-success-container/10 text-on-success-container'
                  : 'border-error-container/30 bg-error-container/10 text-on-error-container'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-on-success-container" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-on-error-container" />
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
          กำลังโหลดงาน...
        </div>
      ) : (
        <section className="space-y-4">
          {jobs.map((job) => {
            const isRunning = runningJobIds.has(job.id) || job.status === 'running';
            // "Run now" is only actionable when the worker is confirmed alive.
            const canRun = workerAvailable === true && !isRunning;
            const jobToast = toasts.find((t) => t.jobId === job.id);

            return (
              <div key={job.id} className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
                <div className="px-5 py-4 border-b border-outline-variant">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-semibold text-primary flex items-center gap-2">{job.name}</h3>
                    <StatusBadge status={job.status} />
                  </div>
                  <button
                    onClick={() => canRun && handleRunNow(job)}
                    disabled={!canRun}
                    title={
                      !workerAvailable
                        ? 'เวิร์กเกอร์เบื้องหลังไม่ทำงาน — ไม่สามารถรันด้วยตนเองได้'
                        : isRunning
                        ? 'งานกำลังรันอยู่แล้ว'
                        : `รัน ${job.name} ทันที`
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 mt-3"
                  >
                    {isRunning ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        กำลังรัน...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        {workerAvailable ? 'รันทันที' : 'ไม่พร้อม'}
                      </>
                    )}
                  </button>
                </div>

                <div className="px-4 pb-4 space-y-3">
                  <p className="text-sm text-slate-600">{job.description}</p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="font-medium">เวลา:</span>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-surface-container text-on-surface-variant">{job.schedule}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {job.lastRun ? (
                        <CheckCircle className="w-3.5 h-3.5 text-on-success-container" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                      )}
                      <span className="font-medium">รันล่าสุด:</span>
                      <span>{formatLastRun(job.lastRun)}</span>
                    </div>
                  </div>

                  {/* Inline toast for this job */}
                  {jobToast && (
                    <div
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                        jobToast.type === 'success'
                          ? 'bg-success-container/20 text-on-success-container border border-success-container/30'
                          : 'bg-error-container/20 text-on-error-container border border-error-container/30'
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
          ← สถานะระบบ
        </Link>
      </div>
    </main>
  );
}
