/**
 * Caching Layer
 * Provides consistent caching interface with TTL support
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheOptions {
  ttl?: number; // seconds
  key?: string;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private timers = new Map<string, NodeJS.Timeout>();

  set<T>(key: string, value: T, ttlSeconds?: number): void {
    const expiresAt = Date.now() + (ttlSeconds || 300) * 1000;

    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
    }

    this.cache.set(key, { value, expiresAt });

    // Auto-cleanup
    if (ttlSeconds) {
      const timer = setTimeout(() => {
        this.cache.delete(key);
        this.timers.delete(key);
      }, ttlSeconds * 1000);

      this.timers.set(key, timer);
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
      this.timers.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  has(key: string): boolean {
    return this.cache.has(key) && Date.now() <= this.cache.get(key)!.expiresAt;
  }
}

const memoryCache = new MemoryCache();

// Cache key builders
export const cacheKeys = {
  // Invoices
  invoiceList: (page: number, pageSize: number, status?: string) =>
    `invoice:list:${page}:${pageSize}:${status ?? 'all'}`,
  invoiceDetail: (id: string) => `invoice:${id}`,
  invoicesByRoom: (roomId: string) => `invoice:room:${roomId}`,

  // Rooms
  roomList: (page: number, pageSize: number) => `room:list:${page}:${pageSize}`,
  roomDetail: (id: string) => `room:${id}`,
  roomsFloor: (floorId: string) => `room:floor:${floorId}`,

  // Tenants
  tenantList: (page: number, pageSize: number) => `tenant:list:${page}:${pageSize}`,
  tenantDetail: (id: string) => `tenant:${id}`,

  // Contracts
  contractList: (page: number, pageSize: number) => `contract:list:${page}:${pageSize}`,
  contractDetail: (id: string) => `contract:${id}`,
  contractsRoom: (roomId: string) => `contract:room:${roomId}`,

  // Payments
  paymentList: (page: number, pageSize: number) => `payment:list:${page}:${pageSize}`,
  paymentDetail: (id: string) => `payment:${id}`,

  // Analytics
  analytics: (type: string, period: string) => `analytics:${type}:${period}`,

  // System
  health: 'system:health',
  settings: 'system:settings',
};

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  // Short-lived (changes frequently)
  SHORT: 60, // 1 minute

  // Medium (changes occasionally)
  MEDIUM: 300, // 5 minutes

  // Long (changes rarely)
  LONG: 3600, // 1 hour

  // Very long (almost never changes)
  VERY_LONG: 86400, // 24 hours
};

// Cache operations
export async function getCachedOrCompute<T>(
  key: string,
  compute: () => Promise<T>,
  ttl: number = CACHE_TTL.MEDIUM
): Promise<T> {
  // Try cache first
  const cached = memoryCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Compute and cache
  const result = await compute();
  memoryCache.set(key, result, ttl);
  return result;
}

export function getCache<T>(key: string): T | null {
  return memoryCache.get<T>(key);
}

export function setCache<T>(key: string, value: T, ttl?: number): void {
  memoryCache.set(key, value, ttl);
}

export function deleteCache(key: string): void {
  memoryCache.delete(key);
}

export function clearCache(): void {
  memoryCache.clear();
}

export function invalidatePattern(pattern: string): void {
  // Note: In production, use Redis or similar for efficient pattern invalidation
  // This is a simplified in-memory implementation
  console.log(`Cache invalidation pattern: ${pattern}`);
}

// Cache invalidation helpers
export const cacheInvalidators = {
  invoice: () => {
    invalidatePattern('^invoice:');
    invalidatePattern('^analytics:');
  },
  room: () => {
    invalidatePattern('^room:');
    invalidatePattern('^contract:room:');
  },
  tenant: () => {
    invalidatePattern('^tenant:');
  },
  contract: () => {
    invalidatePattern('^contract:');
  },
  payment: () => {
    invalidatePattern('^payment:');
    invalidatePattern('^analytics:');
  },
};
