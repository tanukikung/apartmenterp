import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().optional(),
  ADMIN_TOKEN: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  APP_BASE_URL: z.string().url().optional(),
  ADMIN_SIGNUP_CODE: z.string().min(1).optional(),
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
  if (env.NODE_ENV === 'production') return null;
  return 'development-auth-secret';
}

export function getAuthSecret(): string {
  const secret = resolveAuthSecret();
  if (!secret) {
    throw new Error('AUTH_SECRET, NEXTAUTH_SECRET, or ADMIN_TOKEN must be configured in production');
  }
  return secret;
}
