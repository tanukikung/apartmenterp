import { describe, it, expect } from 'vitest';

describe('Runtime guards in test mode', () => {
  it('cron scheduler does not initialize in tests', async () => {
    const cron = await import('@/server/cron');
    // Calling startCronIfEnabled should be a no-op in tests
    cron.startCronIfEnabled();
    expect(cron.isCronInitialized()).toBe(false);
  });

  it('redis client is null in tests', async () => {
    const { getRedisClient } = await import('@/infrastructure/redis');
    expect(getRedisClient()).toBeNull();
  });
});

