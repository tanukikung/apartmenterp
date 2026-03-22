/**
 * In-memory job status store.
 *
 * Persists for the lifetime of the server process.
 * In production with Redis, swap this out for Redis-backed storage.
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
  ['overdue-flag',     { id: 'overdue-flag',     status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['billing-generate', { id: 'billing-generate', status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['invoice-send',     { id: 'invoice-send',     status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['late-fee',         { id: 'late-fee',         status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
  ['db-cleanup',       { id: 'db-cleanup',       status: 'idle', lastRun: null, lastMessage: null, durationMs: null }],
]);

export function getJobEntry(id: string): JobEntry | undefined {
  return store.get(id);
}

export function getAllJobEntries(): JobEntry[] {
  return Array.from(store.values());
}

export function setJobStatus(
  id: string,
  update: Partial<Omit<JobEntry, 'id'>>,
): void {
  const existing = store.get(id);
  if (existing) {
    store.set(id, { ...existing, ...update });
  }
}
