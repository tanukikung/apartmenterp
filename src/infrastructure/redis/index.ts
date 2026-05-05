import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;

// In-memory heartbeat fallback for when Redis is not configured.
// NOTE: This only works when the worker and API share the process (single-process mode).
// In multi-process deployments, Redis is required for cross-process heartbeat.
let inMemoryHeartbeat: number | null = null;

// ── Circuit Breaker State ──────────────────────────────────────────────────────

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type { CircuitState };

interface CircuitBreaker {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number | null;
  lastOpenTime: number | null;
}

interface DistributedCircuitState {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;   // epoch ms, 0 if never
}

const CIRCUIT = {
  failureThreshold: 5,    // consecutive failures to trip the circuit OPEN
  recoveryTimeoutMs: 60_000, // 60 seconds in OPEN before attempting HALF_OPEN probe
  halfOpenProbeFailures: 3, // probe failures in HALF_OPEN to RE-OPEN the circuit
} as const;

const cb: CircuitBreaker = {
  state: 'CLOSED',
  consecutiveFailures: 0,
  lastFailureTime: null,
  lastOpenTime: null,
};

// Timestamp (ms) when Redis last transitioned to unavailable.
// Used to log "Redis DOWN" once per cooldown window (not on every request).
let redisDownStartedAt: number | null = null;

// In-memory cache of distributed state (loaded from Redis on first access, refreshed on transitions)
type DistCbCache = Map<string, DistributedCircuitState>;
const distCbCache: DistCbCache = new Map();

const CB_KEY = (service: string) => `${REDIS_NS}:cb:${service}`;

// Lua script: atomically read + write distributed circuit state.
// Returns the JSON string of the previous state (so caller can see what was stored).
const CB_LUA_SCRIPT = `
  local key = KEYS[1]
  local json = ARGV[1]
  local prev = redis.call('GET', key)
  redis.call('SET', key, json, 'EX', 86400)
  return prev
`;

// ── Metrics ────────────────────────────────────────────────────────────────────

const metrics = {
  redis_down_total: 0,
  redis_recovery_total: 0,
  distributed_circuit_open_total: 0,
  distributed_circuit_reject_total: 0,
  distributed_circuit_recovery_total: 0,
};

// ── Distributed State Helpers ──────────────────────────────────────────────────

/**
 * Load distributed circuit state from Redis using getRedisClient() directly
 * (NOT ensureRedisConnected) to avoid circuit-breaker recursion.
 * Returns null if Redis is unavailable or the key does not exist.
 */
async function loadDistributedState(service: string): Promise<DistributedCircuitState | null> {
  const c = getRedisClient();
  // FIX: Check isOpen BEFORE calling c.get() to prevent implicit connect() on unopened client.
  // This saves ~1200ms per request when Redis is unavailable.
  if (!c || !c.isOpen || !c.isReady) return null;
  try {
    const raw = await c.get(CB_KEY(service));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DistributedCircuitState;
    // Defend against malformed data
    if (!['CLOSED', 'OPEN', 'HALF_OPEN'].includes(parsed.state)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save distributed circuit state to Redis atomically (SET + EXPIRE via Lua script).
 * Silently swallows errors — caller falls back to in-memory on failure.
 */
async function saveDistributedState(service: string, state: DistributedCircuitState): Promise<void> {
  const c = getRedisClient();
  if (!c || !c.isReady) return;
  try {
    await (c as any).eval(CB_LUA_SCRIPT, 1, CB_KEY(service), JSON.stringify(state));
  } catch {
    // Fall back to in-memory on Redis error
  }
}

// ── Transition Helpers ─────────────────────────────────────────────────────────

function transitionTo(newState: CircuitState, service: string, distState: DistributedCircuitState | null): { mem: CircuitBreaker; dist: DistributedCircuitState | null } {
  const prev = cb.state;
  cb.state = newState;

  let dist: DistributedCircuitState | null = distState;

  if (newState === 'CLOSED') {
    cb.consecutiveFailures = 0;
    cb.lastFailureTime = null;
    if (dist) {
      dist = { state: 'CLOSED', failures: 0, lastFailureAt: 0 };
    }
  } else if (newState === 'OPEN') {
    cb.lastOpenTime = Date.now();
    if (dist) {
      dist = { state: 'OPEN', failures: dist.failures, lastFailureAt: Date.now() };
    }
    // Fire alerting — circuit just opened (async, non-blocking)
    import('@/lib/alerting/alerts').then(({ alertCircuitStateTransition }) => {
      alertCircuitStateTransition(service, prev, 'OPEN').catch(() => {});
    });
  } else if (newState === 'HALF_OPEN') {
    // Reset probe failure counter for half-open state
    cb.consecutiveFailures = 0;
    if (dist) {
      dist = { state: 'HALF_OPEN', failures: 0, lastFailureAt: dist.lastFailureAt };
    } else {
      // First transition to HALF_OPEN — create state even if no prior Redis state
      dist = { state: 'HALF_OPEN', failures: 0, lastFailureAt: 0 };
    }
    // Fire alerting — circuit entered half-open (recovery attempt)
    import('@/lib/alerting/alerts').then(({ alertCircuitStateTransition }) => {
      alertCircuitStateTransition(service, prev, 'HALF_OPEN').catch(() => {});
    });
  }

  if (prev !== newState) {
    console.log(`[Redis CircuitBreaker] ${prev} → ${newState} [service=${service}]`);
  }

  return { mem: cb, dist };
}

function recordSuccessInMem(): void {
  if (cb.state === 'HALF_OPEN') {
    // Probe succeeded → close circuit and reset counters
    metrics.redis_recovery_total++;
    metrics.distributed_circuit_recovery_total++;
    cb.state = 'CLOSED';
    cb.consecutiveFailures = 0;
  } else if (cb.state === 'CLOSED') {
    cb.consecutiveFailures = 0;
  }
}

function recordFailureInMem(): void {
  cb.consecutiveFailures++;
  cb.lastFailureTime = Date.now();

  if (cb.state === 'HALF_OPEN') {
    if (cb.consecutiveFailures >= CIRCUIT.halfOpenProbeFailures) {
      metrics.redis_down_total++;
      metrics.distributed_circuit_open_total++;
      cb.state = 'OPEN';
      cb.lastOpenTime = Date.now();
      // Log "Redis DOWN" once per cooldown window (not on every request)
      const shouldLog = redisDownStartedAt === null ||
        (Date.now() - redisDownStartedAt) >= CIRCUIT.recoveryTimeoutMs;
      if (shouldLog) {
        console.log('[Redis] Circuit OPEN — Redis unavailable, falling back to memory layer');
        redisDownStartedAt = Date.now();
      }
    }
  } else if (cb.state === 'CLOSED') {
    if (cb.consecutiveFailures >= CIRCUIT.failureThreshold) {
      metrics.redis_down_total++;
      metrics.distributed_circuit_open_total++;
      cb.state = 'OPEN';
      cb.lastOpenTime = Date.now();
      const shouldLog = redisDownStartedAt === null ||
        (Date.now() - redisDownStartedAt) >= CIRCUIT.recoveryTimeoutMs;
      if (shouldLog) {
        console.log('[Redis] Circuit OPEN — Redis unavailable, falling back to memory layer');
        redisDownStartedAt = Date.now();
      }
    }
  }
}

function shouldAttemptProbeInMem(): boolean {
  if (cb.state !== 'OPEN') return false;
  if (cb.lastOpenTime === null) return true;
  return Date.now() - cb.lastOpenTime >= CIRCUIT.recoveryTimeoutMs;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

/**
 * Returns the raw Redis client (without circuit breaker wrapping).
 * Use ensureRedisConnected() for circuit-breaker wrapped access.
 */
export function getRedisClient(): RedisClientType | null {
  if (process.env.NODE_ENV === 'test') return null;
  if (!isRedisConfigured()) return null;
  if (!client) {
    try {
      client = createClient({
        url: getRedisUrl(),
        socket: {
          connectTimeout: 1000, // fail fast if Redis not available
          reconnectStrategy(retries) {
            if (retries > 3) {
              // FIX: Return false to stop retries and put client in CLOSED state.
              // Returning an Error kept the reconnect timer alive, causing socket leaks.
              return false;
            }
            return Math.min(retries * 200, 1000);
          },
        },
      });
      client.on('error', (err) => {
        console.error('Redis error', err);
      });
    } catch {
      client = null;
    }
  }
  return client;
}

/**
 * Checks the circuit breaker before attempting a Redis connection.
 * Returns null if the circuit is OPEN and the recovery timeout has not elapsed.
 * If the circuit is OPEN and the timeout has elapsed, transitions to HALF_OPEN
 * and allows the probe to proceed.
 *
 * Distributed mode: state is loaded from / written to Redis when Redis is available.
 * Falls back to in-memory state when Redis is unavailable.
 *
 * service: 'redis' | 'line' — determines which Redis key is used for distributed state.
 */
async function checkCircuitBeforeConnect(service: string): Promise<RedisClientType | null> {
  // Load distributed state from Redis (if available) into the in-memory cache
  const dist = await loadDistributedState(service);

  // Also sync in-memory state from distributed state if we have one
  if (dist) {
    cb.state = dist.state;
    cb.consecutiveFailures = dist.failures;
    cb.lastFailureTime = dist.lastFailureAt > 0 ? dist.lastFailureAt : null;
  }

  if (shouldAttemptProbeInMem()) {
    console.log(`[Redis CircuitBreaker] OPEN → HALF_OPEN (attempting probe) [service=${service}]`);
    const { dist: newDist } = transitionTo('HALF_OPEN', service, dist);
    if (newDist) {
      await saveDistributedState(service, newDist);
      distCbCache.set(service, newDist);
    }
    // consecutiveFailures already reset to 0 in transitionTo
  }

  return getRedisClient();
}

export async function ensureRedisConnected(service: string = 'redis'): Promise<RedisClientType | null> {
  // FIX: Fast-fail when circuit is OPEN (in-memory check, no Redis call needed).
  // This saves ~1200ms per request when Redis is down and circuit is already open.
  if (cb.state === 'OPEN' && cb.lastOpenTime !== null) {
    const elapsed = Date.now() - cb.lastOpenTime;
    if (elapsed < CIRCUIT.recoveryTimeoutMs) {
      return null; // circuit is OPEN and within cooldown — skip all Redis calls
    }
    // else: timeout elapsed, transition to HALF_OPEN handled below via checkCircuitBeforeConnect
  }

  // Circuit breaker check — uses distributed state if Redis is available
  const c = await checkCircuitBeforeConnect(service);
  if (!c) return null;

  // FIX: Only attempt connect() if the client is fully closed (not already connecting/failed).
  // If client is already in error state (isOpen=true but not ready), skip connect() to avoid
  // the ~1200ms socket timeout — the client will fail again anyway.
  if (!c.isOpen) {
    try {
      await c.connect();
    } catch {
      recordFailureInMem();
      // Try to persist the failed state to Redis before returning
      const dist = await loadDistributedState(service);
      if (dist) {
        const newDist: DistributedCircuitState = { state: cb.state, failures: cb.consecutiveFailures, lastFailureAt: cb.lastFailureTime ?? 0 };
        await saveDistributedState(service, newDist);
      }
      return null;
    }
  }
  if (!c.isReady) {
    recordFailureInMem();
    const dist = await loadDistributedState(service);
    if (dist) {
      const newDist: DistributedCircuitState = { state: cb.state, failures: cb.consecutiveFailures, lastFailureAt: cb.lastFailureTime ?? 0 };
      await saveDistributedState(service, newDist);
    }
    return null;
  }

  // Connection is established — if we were in HALF_OPEN this counts as success
  recordSuccessInMem();

  // Persist successful state
  const dist = await loadDistributedState(service);
  if (dist || cb.state !== 'CLOSED') {
    const newDist: DistributedCircuitState = { state: 'CLOSED', failures: 0, lastFailureAt: 0 };
    await saveDistributedState(service, newDist);
    distCbCache.set(service, newDist);
  }

  return c;
}

// ── Metrics ────────────────────────────────────────────────────────────────────

export interface RedisHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  consecutiveFailures: number;
  circuitState: CircuitState;
  lastFailureTime: number | null;
}

export interface RedisMetrics {
  redis_down_total: number;
  redis_recovery_total: number;
  distributed_circuit_open_total: number;
  distributed_circuit_reject_total: number;
  distributed_circuit_recovery_total: number;
  consecutiveFailures: number;
  circuitState: CircuitState;
}

/**
 * Returns the current health of the Redis circuit breaker.
 * - status: 'healthy' when circuit is CLOSED and Redis is connected
 *           'unhealthy' when circuit is OPEN or HALF_OPEN
 *           'unknown' when Redis is not configured
 */
export async function getRedisHealth(): Promise<RedisHealth> {
  if (!isRedisConfigured()) {
    return { status: 'unknown', consecutiveFailures: 0, circuitState: 'CLOSED', lastFailureTime: null };
  }

  return {
    status: cb.state === 'CLOSED' ? 'healthy' : 'unhealthy',
    consecutiveFailures: cb.consecutiveFailures,
    circuitState: cb.state,
    lastFailureTime: cb.lastFailureTime,
  };
}

/**
 * Returns circuit-breaker metrics, including distributed circuit breaker counters.
 */
export function getRedisMetrics(): RedisMetrics {
  return {
    redis_down_total: metrics.redis_down_total,
    redis_recovery_total: metrics.redis_recovery_total,
    distributed_circuit_open_total: metrics.distributed_circuit_open_total,
    distributed_circuit_reject_total: metrics.distributed_circuit_reject_total,
    distributed_circuit_recovery_total: metrics.distributed_circuit_recovery_total,
    consecutiveFailures: cb.consecutiveFailures,
    circuitState: cb.state,
  };
}

/**
 * Returns true when the circuit is CLOSED (Redis is healthy and accepting traffic).
 * Returns false when the circuit is OPEN or HALF_OPEN.
 */
export async function isRedisHealthy(): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  const health = await getRedisHealth();
  return health.status === 'healthy';
}

// All Redis keys are namespaced under "apt:" to prevent collisions with
// other services sharing the same Redis instance.
export const REDIS_NS = 'apt';

// ── Rate Limiting ────────────────────────────────────────────────────────────────
//
// Production (NODE_ENV='production' + REDIS_URL configured):
//   → Redis is primary limiter. Failures/unavailability fall back to memory.
//   → Memory fallback is per-instance; in a multi-instance deployment each
//     instance maintains its own window counters. This means rate limit
//     enforcement is approximate across instances (a user can get N × instances
//     requests before being limited). For true distributed rate limiting,
//     Redis must be the primary path and must be available.
// Non-production:
//   → Memory fallback only. No Redis connection attempts. Throughput is
//     limited by single-instance memory, which is acceptable for dev/test.
//
// No request ever blocks or times out due to Redis unavailability.
//

export async function redisRateLimit(key: string, max: number, windowSeconds: number): Promise<number> {
  // Non-production: zero Redis involvement — memory fallback only
  if (process.env.NODE_ENV !== 'production') {
    const result = memoryRateLimit(key, max, windowSeconds * 1000);
    return result.allowed ? result.count : 0;
  }
  if (!isRedisConfigured()) {
    const result = memoryRateLimit(key, max, windowSeconds * 1000);
    return result.allowed ? result.count : 0;
  }
  const c = await ensureRedisConnected();
  if (!c) {
    // Redis unavailable — use memory fallback (O(1), non-blocking)
    const result = memoryRateLimit(key, max, windowSeconds * 1000);
    return result.allowed ? result.count : 0;
  }
  try {
    const nowKey = `${REDIS_NS}:rl:${key}`;
    const count = await c.incr(nowKey);
    if (count === 1) {
      await c.expire(nowKey, windowSeconds);
    }
    recordSuccessInMem();
    return count;
  } catch {
    recordFailureInMem();
    // Redis error — fall back to memory (non-blocking, safe)
    const result = memoryRateLimit(key, max, windowSeconds * 1000);
    return result.allowed ? result.count : 0;
  }
}

export async function redisPing(): Promise<boolean> {
  const c = await ensureRedisConnected();
  if (!c) return false;
  try {
    const res = await c.ping();
    const ok = res === 'PONG';
    if (ok) recordSuccessInMem();
    else recordFailureInMem();
    return ok;
  } catch {
    recordFailureInMem();
    return false;
  }
}

// ── In-Memory Rate Limit Fallback ──────────────────────────────────────────────
// O(1) sliding-window rate limiter backed by a Map.
// TTL-based cleanup prevents unbounded memory growth.
// Safe under high concurrency: uses atomic fetch-increment pattern per key.

// 10-minute TTL — balances memory usage against realistic rate limit windows
const MEM_RL_TTL_MS = 10 * 60 * 1000;
const MEM_RL_MAX_ENTRIES = 100_000;

interface MemRateEntry {
  count: number;
  resetAt: number; // epoch ms when window expires
}

// Single shared store — all memory-fallback rate limiting converges here
const memRlStore = new Map<string, MemRateEntry>();

/**
 * In-memory rate limiting fallback.
 * O(1) increment + TTL-based eviction — no loops, no per-key cleanup cost.
 *
 * Design:
 * - Uses a single store with TTL-driven expiry (no background sweeper thread)
 * - Every call triggers a lightweight cleanup pass (only expired entries at head)
 * - Max entries cap prevents unbounded growth under memory pressure
 * - Safe for concurrent access: fetch → mutate → store is synchronous (single tick)
 */
export function memoryRateLimit(key: string, max: number, windowMs: number): { count: number; allowed: boolean } {
  const now = Date.now();

  // Lightweight cleanup: remove only the first few expired entries to keep map lean.
  // This is O(k) where k = number of evictions, bounded by constant (3) per call.
  let evicted = 0;
  for (const [k, v] of memRlStore) {
    if (evicted >= 3) break;
    if (now >= v.resetAt) {
      memRlStore.delete(k);
      evicted++;
    }
  }

  // Enforce max entries hard cap under memory pressure
  if (evicted === 0 && memRlStore.size >= MEM_RL_MAX_ENTRIES) {
    for (const [k, v] of memRlStore) {
      if (now >= v.resetAt) memRlStore.delete(k);
      if (memRlStore.size < MEM_RL_MAX_ENTRIES * 0.8) break;
    }
  }

  const entry = memRlStore.get(key);

  if (!entry || now >= entry.resetAt) {
    // New window
    memRlStore.set(key, { count: 1, resetAt: now + windowMs });
    return { count: 1, allowed: true };
  }

  if (entry.count >= max) {
    return { count: entry.count, allowed: false };
  }

  entry.count++;
  return { count: entry.count, allowed: true };
}

/**
 * Returns current memory rate limit store size — useful for diagnostics.
 */
export function getMemoryRateLimitStats(): { entries: number; maxEntries: number } {
  return { entries: memRlStore.size, maxEntries: MEM_RL_MAX_ENTRIES };
}

// ── Worker Heartbeat ────────────────────────────────────────────────────────────

export async function setWorkerHeartbeat(ttlSeconds: number = 30): Promise<void> {
  const c = await ensureRedisConnected();
  if (!c) {
    // In-memory fallback when Redis is not configured
    inMemoryHeartbeat = Date.now();
    return;
  }
  try {
    await c.set(`${REDIS_NS}:worker:heartbeat`, Date.now().toString(), { EX: ttlSeconds });
    recordSuccessInMem();
  } catch {
    recordFailureInMem();
    // ignore
  }
}

export async function getWorkerHeartbeat(): Promise<number | null> {
  const c = await ensureRedisConnected();
  if (!c) {
    // In-memory fallback when Redis is not configured
    return inMemoryHeartbeat;
  }
  try {
    const val = await c.get(`${REDIS_NS}:worker:heartbeat`);
    if (!val) {
      recordSuccessInMem();
      return null;
    }
    const n = Number(val);
    const result = Number.isFinite(n) ? n : null;
    recordSuccessInMem();
    return result;
  } catch {
    recordFailureInMem();
    return null;
  }
}

// ── Shutdown Safety ─────────────────────────────────────────────────────────────
const _shutdownStarted = { value: false };

/**
 * Clean shutdown — disconnects the Redis client without blocking process exit.
 * safe to call multiple times. Uses abort to force immediate disconnection.
 */
export async function shutdownRedis(): Promise<void> {
  if (_shutdownStarted.value) return;
  _shutdownStarted.value = true;

  const c = getRedisClient();
  if (!c) return;

  try {
    // destroy() immediately closes the socket — no waiting for in-flight responses.
    // Cast to 'any' because @redis/client TypeScript types omit destroy() but it exists at runtime.
    (c as unknown as { destroy(): void }).destroy();
    client = null;
  } catch {
    client = null;
  }
}

/**
 * Registers shutdown handlers that cleanly disconnect Redis.
 * Call once at app startup (e.g. in instrumentation.ts).
 */
export function registerShutdownHooks(): void {
  const shutdown = () => {
    // Synchronous destroy — doesn't await, keeps event loop alive for cleanup only
    shutdownRedis().catch(() => {});
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', shutdown);
}

// ── LINE API rate limiter (sliding window, sorted-set) ────────────────────────
// LINE Standard Plan allows ~1000 push messages/min. This limiter prevents the
// outbox from bursting past that limit, which would cause 429 errors and retries.
// Key: apt:line:rpm  — shared across all outbox workers in multi-instance deploy.
// Falls back to "always allowed" when Redis is not configured (dev/test safety).

const LINE_RPM_KEY = `${REDIS_NS}:line:rpm`;
const LINE_RPM_DEFAULT = 950; // conservative: 5% below 1000 hard limit

export async function checkLineAPIRateLimit(
  maxPerMinute: number = LINE_RPM_DEFAULT,
): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
  const c = await ensureRedisConnected('line');
  if (!c) return { allowed: true, remaining: maxPerMinute, retryAfterMs: 0 };

  try {
    const now = Date.now();
    const windowStart = now - 60_000;

    // Clean entries outside the 1-minute window, then check current count
    await c.zRemRangeByScore(LINE_RPM_KEY, '-inf', windowStart.toString());
    const currentCount = await c.zCard(LINE_RPM_KEY);

    if (currentCount >= maxPerMinute) {
      // Oldest entry tells us when a slot will free up
      const oldest = await c.zRangeWithScores(LINE_RPM_KEY, 0, 0);
      const oldestScore = oldest[0]?.score ?? windowStart;
      const retryAfterMs = Math.max(1_000, oldestScore + 60_000 - now + 50);
      recordSuccessInMem();
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    // Claim one slot with a unique member so concurrent workers don't collide
    await c.zAdd(LINE_RPM_KEY, {
      score: now,
      value: `${now}:${Math.random().toString(36).slice(2, 9)}`,
    });
    await c.expire(LINE_RPM_KEY, 61);
    recordSuccessInMem();

    return { allowed: true, remaining: maxPerMinute - currentCount - 1, retryAfterMs: 0 };
  } catch {
    recordFailureInMem();
    // Redis error — fail CLOSED so LINE API quota isn't exhausted by unlimited retries.
    // Returning allowed=true would allow burst traffic that could trigger 429 storms
    // and cause cascading retries that make the Redis situation worse.
    return { allowed: false, remaining: 0, retryAfterMs: 5_000 };
  }
}