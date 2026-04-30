/**
 * WebSocket Audit Service — lightweight in-memory metrics for LINE chat WebSocket connections.
 *
 * Metrics are tracked in-memory with no heavy computation. Connection history is capped
 * at MAX_HISTORY entries using FIFO eviction.
 */

import { logger } from '@/lib/utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────────

export type AuditSnapshot = {
  connections: number;
  messagesDelivered: number;
  messagesFailed: number;
  reconnections: number;
  avgLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  uptime: string; // ISO duration string e.g. PT1H30M
  connectionHistory: ConnectionEvent[];
};

export type ConnectionEvent = {
  timestamp: string; // ISO string
  event: 'connect' | 'disconnect';
  conversationId: string;
  userId: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_HISTORY = 1000;
const PERSIST_INTERVAL_MS = 30_000; // 30 seconds

// ─── State ────────────────────────────────────────────────────────────────────────

let connections = 0;
let messagesDelivered = 0;
let messagesFailed = 0;
let reconnections = 0;
const latencyMsHistogram: number[] = [];
let startTime = Date.now();

// Connection history — FIFO capped at MAX_HISTORY
const connectionHistory: ConnectionEvent[] = [];

let persistTimer: ReturnType<typeof setInterval> | null = null;

// ─── Internal helpers ──────────────────────────────────────────────────────────

function evictOldest(): void {
  if (connectionHistory.length >= MAX_HISTORY) {
    connectionHistory.shift();
  }
}

function computeAvgLatency(): number | null {
  if (latencyMsHistogram.length === 0) return null;
  const sum = latencyMsHistogram.reduce((a, b) => a + b, 0);
  return Math.round(sum / latencyMsHistogram.length);
}

// ─── Persistence stub ──────────────────────────────────────────────────────────

/**
 * Periodic persistence hook. Called every PERSIST_INTERVAL_MS.
 * Currently a no-op — extend this to flush metrics to DB or Redis if needed.
 */
function persistMetrics(): void {
  // TODO: persist to DB or Redis if audit needs to survive server restarts
  logger.debug({
    type: 'ws_audit_persist',
    connections,
    messagesDelivered,
    messagesFailed,
    reconnections,
    avgLatencyMs: computeAvgLatency(),
  });
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a successful WebSocket message delivery.
 * @param conversationId - LINE conversation ID
 * @param latencyMs - delivery latency in ms (webhookReceivedTime -> WebSocket deliveryTime)
 */
export function recordMessageDelivered(conversationId: string, latencyMs: number): void {
  messagesDelivered++;
  if (latencyMs >= 0) {
    latencyMsHistogram.push(latencyMs);
    // Keep histogram bounded — evict oldest if over 2x MAX_HISTORY
    if (latencyMsHistogram.length > MAX_HISTORY * 2) {
      latencyMsHistogram.splice(0, latencyMsHistogram.length - MAX_HISTORY);
    }
  }
  logger.debug({ type: 'ws_message_delivered', conversationId, latencyMs });
}

/**
 * Record a WebSocket connection event.
 * @param conversationId - LINE conversation ID
 * @param userId - LINE user ID
 */
export function recordConnection(conversationId: string, userId: string): void {
  connections++;
  evictOldest();
  connectionHistory.push({
    timestamp: new Date().toISOString(),
    event: 'connect',
    conversationId,
    userId,
  });
  logger.debug({ type: 'ws_connection', conversationId, userId });
}

/**
 * Record a WebSocket disconnection event.
 * @param conversationId - LINE conversation ID
 * @param userId - LINE user ID
 */
export function recordDisconnection(conversationId: string, userId: string): void {
  if (connections > 0) connections--;
  evictOldest();
  connectionHistory.push({
    timestamp: new Date().toISOString(),
    event: 'disconnect',
    conversationId,
    userId,
  });
  logger.debug({ type: 'ws_disconnection', conversationId, userId });
}

/**
 * Record a reconnection event (client reconnecting after a disconnect).
 * This is a subset of connections — tracked separately for health monitoring.
 * @param conversationId - LINE conversation ID
 * @param userId - LINE user ID
 */
export function recordReconnection(conversationId: string, userId: string): void {
  reconnections++;
  // Also record as a connection
  recordConnection(conversationId, userId);
}

/**
 * Record a failed message delivery (e.g., WebSocket send error).
 * @param conversationId - LINE conversation ID
 */
export function recordMessageFailed(conversationId: string): void {
  messagesFailed++;
  logger.debug({ type: 'ws_message_failed', conversationId });
}

/**
 * Return a full audit snapshot. Safe to call frequently — O(1) for counters.
 */
export function getAuditSnapshot(): AuditSnapshot {
  const avg = computeAvgLatency();
  const min = latencyMsHistogram.length > 0 ? Math.min(...latencyMsHistogram) : null;
  const max = latencyMsHistogram.length > 0 ? Math.max(...latencyMsHistogram) : null;

  const elapsedMs = Date.now() - startTime;
  const uptime = formatDuration(elapsedMs);

  return {
    connections,
    messagesDelivered,
    messagesFailed,
    reconnections,
    avgLatencyMs: avg,
    minLatencyMs: min,
    maxLatencyMs: max,
    uptime,
    connectionHistory: [...connectionHistory],
  };
}

/**
 * Reset all counters and history. Does not reset startTime.
 */
export function resetCounters(): void {
  connections = 0;
  messagesDelivered = 0;
  messagesFailed = 0;
  reconnections = 0;
  latencyMsHistogram.length = 0;
  connectionHistory.length = 0;
  startTime = Date.now();
  logger.info({ type: 'ws_audit_reset' });
}

/**
 * Start the periodic persistence timer. Call once at server startup.
 */
export function startAuditPersistence(): void {
  if (persistTimer !== null) return;
  persistTimer = setInterval(persistMetrics, PERSIST_INTERVAL_MS);
}

/**
 * Stop the persistence timer. Call at server shutdown if needed.
 */
export function stopAuditPersistence(): void {
  if (persistTimer !== null) {
    clearInterval(persistTimer);
    persistTimer = null;
  }
}

// ─── Duration formatter (Intl) ───────────────────────────────────────────────

/**
 * Format milliseconds as an ISO 8601 duration string (e.g. PT1H30M5S).
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = ['PT'];
  if (hours > 0) parts.push(`${hours}H`);
  if (minutes > 0) parts.push(`${minutes}M`);
  if (seconds > 0 || parts.length === 1) parts.push(`${seconds}S`);
  return parts.join('');
}
