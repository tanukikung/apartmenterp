/**
 * In-memory job status store.
 *
 * Persists for the lifetime of the server process.
 *
 * LIMITATION: This store is single-instance only.
 * In a multi-instance deployment (e.g., Vercel with multiple warm instances,
 * or multiple Node processes behind a load balancer) each instance maintains its
 * own independent Map. Job status will be inconsistent across instances.
 *
 * For multi-instance deployments, replace this with a Redis-backed store:
 * - Store job entries in Redis hashes (one key per job id)
 * - Use Redis EXPIRE for TTL on heartbeat keys
 * - The /api/admin/jobs route should also be updated to read from Redis
 *
 * The shape matches what the /api/admin/jobs route exposes to the UI.
 */

export type JobStatus = 'idle' | 'running' | 'error';

export interface JobEntry {
  id: string;
  status: JobStatus;
  lastRun: string | null;
  lastMessage: string | null;
  durationMs: number | null;
}

// Module-level singleton — resets on server restart.
const store = new Map<string, JobEntry>([
  ['overdue-flag',      { id: 'overdue-flag',      status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['billing-generate',  { id: 'billing-generate',  status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['invoice-send',      { id: 'invoice-send',      status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['late-fee',          { id: 'late-fee',          status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['db-cleanup',        { id: 'db-cleanup',        status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['outbox-cleanup',    { id: 'outbox-cleanup',    status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['document-notify',   { id: 'document-notify',   status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['document-cleanup',  { id: 'document-cleanup',  status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['backup-cleanup',   { id: 'backup-cleanup',    status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['contract-expiry',   { id: 'contract-expiry',   status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
]);

export function getJobEntry(id: string): JobEntry | undefined {
  return store.get(id);
}

export function getAllJobEntries(): JobEntry[] {
  return Array.from(store.values());
}

export function getJobStatuses(): Record<string, JobStatus> {
  const entries = store.entries();
  const result: Record<string, JobStatus> = {};
  for (const [id, entry] of entries) {
    result[id] = entry.status;
  }
  return result;
}

export function setJobStatus(
  id: string,
  update: Partial<Omit<JobEntry, 'id'>>,
): void {
  // In-process mutex: prevent concurrent execution in single-instance deployments.
  // If the job is already running, reject a second 'running' transition.
  if (update.status === 'running' && store.get(id)?.status === 'running') {
    return;
  }

  const existing = store.get(id);
  if (existing) {
    store.set(id, { ...existing, ...update });
  }
}
