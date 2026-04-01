import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use vi.mock to test the actual module while allowing reset between tests
vi.mock('@/lib/line/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/line/client')>();
  return {
    ...actual,
    // Re-use the same reset mechanism but from within the mock
    resetLineClient: actual.resetLineClient,
  };
});

import { isLineConfigured } from '@/lib/line/is-configured';
import { getLineConfig, resetLineClient } from '@/lib/line/client';

describe('LINE config resolution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Snapshot and restore process.env
    process.env = { ...originalEnv };
    // Reset the singleton cache so each test gets fresh env reads
    resetLineClient();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetLineClient();
  });

  /**
   * Helper: set LINE env vars to minimal usable state.
   * Callers can override individual properties as needed.
   */
  function setLineEnv(overrides: Partial<{
    LINE_CHANNEL_ID: string;
    LINE_CHANNEL_SECRET: string;
    LINE_ACCESS_TOKEN: string | undefined;
    LINE_CHANNEL_ACCESS_TOKEN: string | undefined;
  }> = {}) {
    process.env.LINE_CHANNEL_ID = overrides.LINE_CHANNEL_ID ?? '2007393140';
    process.env.LINE_CHANNEL_SECRET = overrides.LINE_CHANNEL_SECRET ?? 'secret';
    if (overrides.LINE_ACCESS_TOKEN === undefined) {
      delete process.env.LINE_ACCESS_TOKEN;
    } else {
      process.env.LINE_ACCESS_TOKEN = overrides.LINE_ACCESS_TOKEN;
    }

    if (overrides.LINE_CHANNEL_ACCESS_TOKEN === undefined) {
      delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    } else {
      process.env.LINE_CHANNEL_ACCESS_TOKEN = overrides.LINE_CHANNEL_ACCESS_TOKEN;
    }
  }

  // -------------------------------------------------------------------------
  // isLineConfigured() — empty-string semantics
  // -------------------------------------------------------------------------

  describe('isLineConfigured()', () => {
    it('returns true when LINE_CHANNEL_ACCESS_TOKEN is set and LINE_ACCESS_TOKEN is empty string', () => {
      // This is the bug scenario: .env has LINE_ACCESS_TOKEN="" but LINE_CHANNEL_ACCESS_TOKEN="..."
      setLineEnv({ LINE_ACCESS_TOKEN: '', LINE_CHANNEL_ACCESS_TOKEN: 'valid_long_lived_token' });
      expect(isLineConfigured()).toBe(true);
    });

    it('returns true when LINE_ACCESS_TOKEN (non-empty) is set', () => {
      setLineEnv({ LINE_ACCESS_TOKEN: 'valid_access_token', LINE_CHANNEL_ACCESS_TOKEN: '' });
      expect(isLineConfigured()).toBe(true);
    });

    it('returns true when both tokens are non-empty (LINE_ACCESS_TOKEN takes priority)', () => {
      setLineEnv({ LINE_ACCESS_TOKEN: 'primary_token', LINE_CHANNEL_ACCESS_TOKEN: 'fallback_token' });
      expect(isLineConfigured()).toBe(true);
    });

    it('returns false when LINE_ACCESS_TOKEN is empty and LINE_CHANNEL_ACCESS_TOKEN is empty', () => {
      setLineEnv({ LINE_ACCESS_TOKEN: '', LINE_CHANNEL_ACCESS_TOKEN: '' });
      expect(isLineConfigured()).toBe(false);
    });

    it('returns false when neither token is set', () => {
      setLineEnv({ LINE_ACCESS_TOKEN: undefined, LINE_CHANNEL_ACCESS_TOKEN: undefined });
      expect(isLineConfigured()).toBe(false);
    });

    it('returns false when LINE_CHANNEL_ID is missing', () => {
      setLineEnv({ LINE_CHANNEL_ID: '', LINE_ACCESS_TOKEN: 'token', LINE_CHANNEL_ACCESS_TOKEN: 'token' });
      expect(isLineConfigured()).toBe(false);
    });

    it('returns false when LINE_CHANNEL_SECRET is missing', () => {
      setLineEnv({ LINE_CHANNEL_SECRET: '', LINE_ACCESS_TOKEN: 'token', LINE_CHANNEL_ACCESS_TOKEN: 'token' });
      expect(isLineConfigured()).toBe(false);
    });

    it('treats LINE_ACCESS_TOKEN="" (empty string) as unset — does not count as configured', () => {
      // Confirms the P2 fix: empty string should be equivalent to missing/unset
      setLineEnv({ LINE_ACCESS_TOKEN: '', LINE_CHANNEL_ACCESS_TOKEN: undefined });
      expect(isLineConfigured()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getLineConfig() — token fallback resolution
  // -------------------------------------------------------------------------

  describe('getLineConfig() token fallback', () => {
    it('uses LINE_CHANNEL_ACCESS_TOKEN when LINE_ACCESS_TOKEN is empty string', () => {
      setLineEnv({ LINE_ACCESS_TOKEN: '', LINE_CHANNEL_ACCESS_TOKEN: 'fallback_token' });
      const config = getLineConfig();
      expect(config.accessToken).toBe('fallback_token');
    });

    it('uses LINE_ACCESS_TOKEN when it is non-empty', () => {
      setLineEnv({ LINE_ACCESS_TOKEN: 'primary_token', LINE_CHANNEL_ACCESS_TOKEN: 'fallback_token' });
      const config = getLineConfig();
      expect(config.accessToken).toBe('primary_token');
    });

    it('throws when both tokens are empty strings', () => {
      setLineEnv({ LINE_ACCESS_TOKEN: '', LINE_CHANNEL_ACCESS_TOKEN: '' });
      expect(() => getLineConfig()).toThrow('LINE credentials not configured');
    });

    it('throws when neither token is set', () => {
      setLineEnv({ LINE_ACCESS_TOKEN: undefined, LINE_CHANNEL_ACCESS_TOKEN: undefined });
      expect(() => getLineConfig()).toThrow('LINE credentials not configured');
    });

    it('returns channelId and channelSecret correctly', () => {
      setLineEnv({ LINE_ACCESS_TOKEN: 'token' });
      const config = getLineConfig();
      expect(config.channelId).toBe('2007393140');
      expect(config.channelSecret).toBe('secret');
    });
  });
});
