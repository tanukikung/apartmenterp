/**
 * Integration tests for caching system (Phase 4)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCache,
  setCache,
  deleteCache,
  clearCache,
  getCachedOrCompute,
  CACHE_TTL,
  cacheKeys,
  cacheInvalidators,
} from '@/lib/cache';

describe('Cache System', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('basic operations', () => {
    it('should set and get cache values', () => {
      setCache('test-key', { data: 'test' });
      const value = getCache('test-key');
      expect(value).toEqual({ data: 'test' });
    });

    it('should delete cache values', () => {
      setCache('test-key', { data: 'test' });
      deleteCache('test-key');
      const value = getCache('test-key');
      expect(value).toBeNull();
    });

    it('should clear all cache', () => {
      setCache('key1', 'value1');
      setCache('key2', 'value2');
      clearCache();
      expect(getCache('key1')).toBeNull();
      expect(getCache('key2')).toBeNull();
    });

    it('should respect TTL', async () => {
      setCache('ttl-key', 'value', 1);
      expect(getCache('ttl-key')).toBe('value');
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(getCache('ttl-key')).toBeNull();
    });
  });

  describe('getCachedOrCompute', () => {
    it('should compute value on cache miss', async () => {
      const compute = vi.fn(async () => ({ computed: true }));
      const result = await getCachedOrCompute(
        'compute-key',
        compute,
        CACHE_TTL.MEDIUM
      );
      expect(result).toEqual({ computed: true });
      expect(compute).toHaveBeenCalledOnce();
    });

    it('should return cached value on hit', async () => {
      setCache('compute-key', { cached: true });
      const compute = vi.fn(async () => ({ computed: true }));
      const result = await getCachedOrCompute(
        'compute-key',
        compute,
        CACHE_TTL.MEDIUM
      );
      expect(result).toEqual({ cached: true });
      expect(compute).not.toHaveBeenCalled();
    });

    it('should cache computed result', async () => {
      const compute = vi.fn(async () => ({ computed: true }));
      await getCachedOrCompute(
        'compute-key',
        compute,
        CACHE_TTL.MEDIUM
      );
      const cached = getCache('compute-key');
      expect(cached).toEqual({ computed: true });
    });
  });

  describe('cache key builders', () => {
    it('should build consistent invoice list keys', () => {
      const key1 = cacheKeys.invoiceList(0, 10);
      const key2 = cacheKeys.invoiceList(0, 10);
      expect(key1).toBe(key2);
    });

    it('should distinguish invoice list keys by pagination', () => {
      const key1 = cacheKeys.invoiceList(0, 10);
      const key2 = cacheKeys.invoiceList(1, 10);
      expect(key1).not.toBe(key2);
    });

    it('should distinguish by status filter', () => {
      const key1 = cacheKeys.invoiceList(0, 10, 'PAID');
      const key2 = cacheKeys.invoiceList(0, 10, 'OVERDUE');
      expect(key1).not.toBe(key2);
    });

    it('should build room detail key', () => {
      const key = cacheKeys.roomDetail('room-123');
      expect(key).toContain('room-123');
    });
  });

  describe('cache invalidators', () => {
    it('should have invoice invalidator', () => {
      expect(cacheInvalidators.invoice).toBeDefined();
    });

    it('should have room invalidator', () => {
      expect(cacheInvalidators.room).toBeDefined();
    });

    it('should have payment invalidator', () => {
      expect(cacheInvalidators.payment).toBeDefined();
    });
  });

  describe('TTL constants', () => {
    it('should define appropriate TTL values', () => {
      expect(CACHE_TTL.SHORT).toBeLessThan(CACHE_TTL.MEDIUM);
      expect(CACHE_TTL.MEDIUM).toBeLessThan(CACHE_TTL.LONG);
      expect(CACHE_TTL.LONG).toBeLessThan(CACHE_TTL.VERY_LONG);
    });

    it('should have sensible TTL ranges', () => {
      expect(CACHE_TTL.SHORT).toBe(60);
      expect(CACHE_TTL.MEDIUM).toBe(300);
      expect(CACHE_TTL.LONG).toBe(3600);
    });
  });
});
