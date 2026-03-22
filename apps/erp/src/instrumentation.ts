/**
 * Next.js instrumentation hook — runs once when the server starts.
 *
 * IMPORTANT: This file must only use dynamic imports. Static top-level imports
 * are processed by webpack and can bundle Node.js built-ins (crypto, fs) that
 * break in the Edge runtime. Dynamic imports are resolved at runtime by Node.js.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

type JobRunner = () => Promise<{ count: number; message: string }>;
type SetJobStatusFn = (id: string, update: Record<string, unknown>) => void;

// ── Schedule entry ────────────────────────────────────────────────────────────
type ScheduleEntry = {
  jobId: string;
  hour: number;
  minute: number;
  dayOfWeek?: number;  // 0 = Sunday
  dayOfMonth?: number; // 1–31
};

const SCHEDULES: ScheduleEntry[] = [
  { jobId: 'overdue-flag',     hour: 1, minute: 0 },
  { jobId: 'billing-generate', hour: 6, minute: 0, dayOfMonth: 1 },
  { jobId: 'invoice-send',     hour: 7, minute: 0, dayOfMonth: 1 },
  { jobId: 'late-fee',         hour: 2, minute: 0 },
  { jobId: 'db-cleanup',       hour: 3, minute: 0, dayOfWeek: 0 },
];

export async function register() {
  // Only run in the Node.js server runtime (not Edge, not during builds).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Lazy-import to avoid webpack bundling native Node modules.
  const { default: logger } = await import('./lib/utils/logger');

  logger.info('🚀 Server starting — instrumentation hook registered');

  // ── Scheduled job runner ────────────────────────────────────────────────
  let jobRunners: Record<string, JobRunner> = {};
  let setJobStatus: SetJobStatusFn = () => undefined;

  try {
    const runnerModule = await import('./modules/jobs/job-runner');
    const storeModule  = await import('./modules/jobs/job-store');
    jobRunners  = runnerModule.JOB_RUNNERS as Record<string, JobRunner>;
    setJobStatus = storeModule.setJobStatus as SetJobStatusFn;

    // Start a once-per-minute ticker that checks the schedule
    setInterval(() => {
      const now = new Date();
      const h   = now.getHours();
      const m   = now.getMinutes();
      const dow = now.getDay();
      const dom = now.getDate();

      for (const s of SCHEDULES) {
        if (s.hour !== h || s.minute !== m) continue;
        if (s.dayOfWeek  !== undefined && s.dayOfWeek  !== dow) continue;
        if (s.dayOfMonth !== undefined && s.dayOfMonth !== dom) continue;

        const runner = jobRunners[s.jobId];
        if (!runner) continue;

        const jobId = s.jobId;
        setJobStatus(jobId, { status: 'running' });
        const startMs = Date.now();

        void runner()
          .then((result) => {
            const durationMs = Date.now() - startMs;
            setJobStatus(jobId, {
              status: 'idle',
              lastRun: new Date().toISOString(),
              lastMessage: result.message,
              durationMs,
            });
            logger.info({ jobId, ...result, durationMs }, '✅ Scheduled job completed');
          })
          .catch((err: unknown) => {
            const durationMs = Date.now() - startMs;
            const message = err instanceof Error ? err.message : String(err);
            setJobStatus(jobId, {
              status: 'error',
              lastRun: new Date().toISOString(),
              lastMessage: message,
              durationMs,
            });
            logger.error({ jobId, error: message }, '❌ Scheduled job failed');
          });
      }
    }, 60_000);

    logger.info('⏰ Job scheduler started');
  } catch (err) {
    // Scheduler failure is non-fatal — jobs can still be triggered manually via the UI.
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ error: msg }, '⚠️  Job scheduler failed to start — manual execution still available');
  }
}
