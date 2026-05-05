/**
 * Global emergency kill-switch (read-only mode).
 *
 * When active, all mutating API endpoints return 503 until the flag is cleared.
 * The state is stored in Redis at key `apt:system:readonly` (string "true" | "false").
 * Falls back to `false` (allow mutations) when Redis is unavailable.
 */

import { ensureRedisConnected } from '@/infrastructure/redis';
import { logger } from '@/lib/utils/logger';

const READONLY_KEY = 'apt:system:readonly';

/**
 * Returns true when the system is in read-only mode (kill-switch active).
 * Fails open: returns false if Redis is unavailable.
 */
export async function isSystemReadOnly(): Promise<boolean> {
  const redis = await ensureRedisConnected();
  if (!redis) return false;

  try {
    const val = await redis.get(READONLY_KEY);
    return val === 'true';
  } catch (err) {
    logger.warn({ type: 'redis_readonly_check_failed', error: String(err) });
    return false;
  }
}

/**
 * Sets the read-only kill-switch.
 * Requires OWNER role. Logs the change with actorId.
 *
 * @param enabled - true to activate read-only mode, false to deactivate
 * @param actorId - the user who triggered the change
 */
export async function setSystemReadOnly(enabled: boolean, actorId: string): Promise<void> {
  const redis = await ensureRedisConnected();
  if (!redis) {
    throw new Error('Redis not available');
  }

  await redis.set(READONLY_KEY, enabled ? 'true' : 'false');

  logger.info({
    type: 'system_readonly_set',
    enabled,
    actorId,
  });
}