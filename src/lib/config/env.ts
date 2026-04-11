import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().optional(),
  ADMIN_TOKEN: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  APP_BASE_URL: z.string().url().optional(),
  ADMIN_SIGNUP_CODE: z.string().min(1).optional(),
  ALLOWED_ORIGINS: z.string().optional(), // comma-separated list of allowed origins for CORS (production)
  LINE_CHANNEL_ID: z.string().min(1).optional(),
  LINE_CHANNEL_SECRET: z.string().min(1).optional(),
  LINE_ACCESS_TOKEN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Never throw at import time; return best-effort with defaults
    const partial: Env = {
      NODE_ENV: (process.env.NODE_ENV as Env['NODE_ENV']) ?? 'development',
      DATABASE_URL: process.env.DATABASE_URL,
      ADMIN_TOKEN: process.env.ADMIN_TOKEN,
      AUTH_SECRET: process.env.AUTH_SECRET,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      APP_BASE_URL: process.env.APP_BASE_URL,
      ADMIN_SIGNUP_CODE: process.env.ADMIN_SIGNUP_CODE,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID,
      LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,
      LINE_ACCESS_TOKEN: process.env.LINE_ACCESS_TOKEN,
    };
    return partial;
  }
  return parsed.data;
}

export function envHealth(): {
  status: 'ok' | 'degraded';
  missing: string[];
} {
  const env = getEnv();
  const missing: string[] = [];

  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  // Optional integrations
  // LINE credentials are optional for core app health

  return {
    status: missing.length === 0 ? 'ok' : 'degraded',
    missing,
  };
}

export function isAuthEnabled(): boolean {
  const env = getEnv();
  return Boolean((env.AUTH_SECRET || env.NEXTAUTH_SECRET || env.ADMIN_TOKEN) && env.DATABASE_URL);
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  const env = getEnv();
  if (!env.ADMIN_TOKEN) return false;
  return token === env.ADMIN_TOKEN;
}

export function resolveAuthSecret(): string | null {
  const env = getEnv();
  const configured = env.AUTH_SECRET || env.NEXTAUTH_SECRET || env.ADMIN_TOKEN;
  if (configured) return configured;
  // Never use a fallback secret in production — getAuthSecret() will throw
  return null;
}

export function getAuthSecret(): string {
  const secret = resolveAuthSecret();
  if (!secret) {
    throw new Error('AUTH_SECRET, NEXTAUTH_SECRET, or ADMIN_TOKEN must be configured in production');
  }
  return secret;
}

/**
 * Returns the list of allowed CORS origins.
 * - In development/test: allows localhost origins dynamically derived from APP_BASE_URL or NEXTAUTH_URL.
 * - In production: requires ALLOWED_ORIGINS env var; falls back to APP_BASE_URL only if set.
 */
export function getAllowedOrigins(): string[] {
  const env = getEnv();
  if (env.NODE_ENV === 'production') {
    if (env.ALLOWED_ORIGINS) {
      return env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    }
    // Fallback to APP_BASE_URL in production if ALLOWED_ORIGINS is not configured
    if (env.APP_BASE_URL) {
      return [env.APP_BASE_URL];
    }
    return [];
  }
  // Development / test: allow localhost variants from APP_BASE_URL or NEXTAUTH_URL
  const configured = [env.APP_BASE_URL, process.env.NEXTAUTH_URL].filter(Boolean) as string[];
  const origins = configured.map((url) => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }).filter(Boolean) as string[];
  // Always add localhost:3000 and localhost:3001 for local dev convenience
  const devDefaults = ['http://localhost:3000', 'http://localhost:3001'];
  return [...new Set([...devDefaults, ...origins])];
}

/**
 * Returns true if the given origin is allowed for CORS.
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (process.env.NODE_ENV !== 'production') return true; // permissive in dev/test
  return getAllowedOrigins().includes(origin);
}
