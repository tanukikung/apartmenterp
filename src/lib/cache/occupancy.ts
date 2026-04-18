/**
 * Module-level in-memory cache for occupancy data.
 *
 * LIMITATION: This cache is per-worker-process and will NOT stay in sync
 * across multiple Next.js worker processes (e.g., when using clustering or
 * containerized deployments with multiple replicas). In multi-worker setups
 * the occupancy data served may be stale for up to CACHE_TTL_MS.
 *
 * To invalidate this cache proactively:
 *   - Call invalidateOccupancyCache() exported from this module after any
 *     room status change (move-in, move-out, maintenance toggle).
 *   - Alternatively, set CACHE_TTL_MS lower (at the cost of more DB queries).
 *
 * For production with multiple workers/replicas, replace this with a shared
 * Redis cache and call cache invalidation on relevant write operations.
 */

export type OccupancyData = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenance: number;
  maintenanceRooms: number;
  selfUse: number;
  unavailable: number;
  occupancyRate: number;
  byFloor: Array<{
    floorNumber: number;
    total: number;
    occupied: number;
    vacant: number;
    maintenance: number;
    occupancyRate: number;
  }>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: OccupancyData; expiry: number } | null = null;

export function getOccupancyCache(): { value: OccupancyData; expiry: number } | null {
  return cache;
}

export function setOccupancyCache(value: OccupancyData): void {
  cache = { value, expiry: Date.now() + CACHE_TTL_MS };
}

export function invalidateOccupancyCache(): void {
  cache = null;
}

export function isOccupancyCacheValid(): boolean {
  return cache !== null && cache.expiry > Date.now();
}
