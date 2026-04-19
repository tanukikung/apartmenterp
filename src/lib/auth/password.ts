import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Password hashing using scrypt (OWASP-recommended, memory-hard).
 *
 * Format:  scrypt:v2:N=131072:r=8:p=1:<salt>:<key>
 *   - v2 hashes use N=2^17=131072, block size 8, parallelism 1 (OWASP 2024 minimum)
 *   - Legacy v1 hashes (plain `scrypt:salt:key` with default N=16384) are still
 *     accepted via verifyPassword and should be upgraded via `needsRehash()`
 *     on successful login.
 *
 * Why scrypt over bcrypt:
 *   - Memory-hard (resistant to GPU/ASIC attacks in a way bcrypt isn't)
 *   - Built into Node crypto — no native module install issues
 *   - Accepted by OWASP Password Storage Cheat Sheet when N ≥ 2^17
 */

const KEY_LENGTH = 64;

// OWASP 2024 recommendation: N=2^17, r=8, p=1 (≈64 MB RAM per hash)
const CURRENT_COST = {
  N: 131072,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024, // 256 MB ceiling
} as const;

export function hashPassword(password: string): string {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, CURRENT_COST).toString('hex');
  return `scrypt:v2:N=${CURRENT_COST.N}:r=${CURRENT_COST.r}:p=${CURRENT_COST.p}:${salt}:${derivedKey}`;
}

interface ParsedHash {
  version: 'v1' | 'v2';
  N: number;
  r: number;
  p: number;
  salt: string;
  key: string;
}

function parseHash(passwordHash: string): ParsedHash | null {
  if (!passwordHash || typeof passwordHash !== 'string') return null;
  const parts = passwordHash.split(':');

  // Legacy v1: scrypt:<salt>:<key>
  if (parts.length === 3 && parts[0] === 'scrypt') {
    const [, salt, key] = parts;
    if (!salt || !key) return null;
    return { version: 'v1', N: 16384, r: 8, p: 1, salt, key };
  }

  // v2: scrypt:v2:N=131072:r=8:p=1:<salt>:<key>
  if (parts.length === 7 && parts[0] === 'scrypt' && parts[1] === 'v2') {
    const N = Number(parts[2].split('=')[1]);
    const r = Number(parts[3].split('=')[1]);
    const p = Number(parts[4].split('=')[1]);
    const salt = parts[5];
    const key = parts[6];
    if (!N || !r || !p || !salt || !key) return null;
    return { version: 'v2', N, r, p, salt, key };
  }

  return null;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  if (!password || typeof password !== 'string') return false;
  const parsed = parseHash(passwordHash);
  if (!parsed) return false;

  try {
    const derivedKey = scryptSync(password, parsed.salt, KEY_LENGTH, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: 256 * 1024 * 1024,
    });
    const storedBuffer = Buffer.from(parsed.key, 'hex');
    if (derivedKey.length !== storedBuffer.length) return false;
    return timingSafeEqual(derivedKey, storedBuffer);
  } catch {
    // If scrypt throws (e.g. invalid params in legacy hash), treat as mismatch
    return false;
  }
}

/**
 * Returns true when the stored hash was created with weaker-than-current
 * cost parameters and should be re-hashed on next successful login.
 */
export function needsRehash(passwordHash: string): boolean {
  const parsed = parseHash(passwordHash);
  if (!parsed) return true; // unknown format → force rehash
  return (
    parsed.version !== 'v2' ||
    parsed.N < CURRENT_COST.N ||
    parsed.r < CURRENT_COST.r ||
    parsed.p < CURRENT_COST.p
  );
}
