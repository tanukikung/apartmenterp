import { logger } from '@/lib/utils/logger';

// ============================================================
// Startup Environment Validation
// ============================================================
// runStartupChecks() validates the process environment at boot
// time. It is intentionally non-throwing: missing required vars
// are logged as errors so the operator can see them clearly, but
// the process is allowed to continue so Next.js can still serve
// the /api/health endpoint for observability.
// ============================================================

const DEV_SECRET_SENTINEL = 'dev-secret-key-change-in-production';

interface CheckResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

function checkEnv(): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Required variables ──────────────────────────────────────
  const required: Array<{ key: string; hint: string }> = [
    {
      key: 'DATABASE_URL',
      hint: 'Set to a PostgreSQL connection string, e.g. postgresql://user:pass@host:5432/dbname',
    },
    {
      key: 'NEXTAUTH_SECRET',
      hint: 'Generate with: openssl rand -hex 32',
    },
  ];

  for (const { key, hint } of required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}. ${hint}`);
    }
  }

  // ── Security warnings ───────────────────────────────────────
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? '';
  if (secret === DEV_SECRET_SENTINEL && process.env.NODE_ENV === 'production') {
    errors.push(
      'NEXTAUTH_SECRET is set to the insecure development default. ' +
        'Replace it with a strong random secret before deploying. ' +
        'Generate one with: openssl rand -hex 32'
    );
  } else if (secret === DEV_SECRET_SENTINEL) {
    warnings.push(
      'NEXTAUTH_SECRET is using the dev default. ' +
        'This is fine for local development but must be changed before production.'
    );
  }

  // ── Optional / integration variables ───────────────────────
  const optional: Array<{ key: string; feature: string }> = [
    { key: 'LINE_CHANNEL_ID', feature: 'LINE messaging' },
    { key: 'LINE_CHANNEL_SECRET', feature: 'LINE messaging' },
    { key: 'REDIS_URL', feature: 'Redis (rate-limiting / outbox worker)' },
    { key: 'CRON_SECRET', feature: 'Protected cron endpoints' },
    { key: 'APP_BASE_URL', feature: 'Absolute URL generation (emails, webhooks)' },
  ];

  for (const { key, feature } of optional) {
    if (!process.env[key]) {
      warnings.push(`Optional variable ${key} is not set — ${feature} will be unavailable or degraded.`);
    }
  }

  // LINE access token — accept either name
  const hasLineToken = !!(process.env.LINE_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!hasLineToken) {
    warnings.push('Optional variable LINE_ACCESS_TOKEN (or LINE_CHANNEL_ACCESS_TOKEN) is not set — LINE messaging will be unavailable.');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

let hasRun = false;

/**
 * Validate required and optional environment variables at process startup.
 *
 * - Errors are logged for missing required vars or insecure secrets in production.
 * - Warnings are logged for missing optional vars.
 * - Safe to call multiple times — only runs once per process.
 */
export function runStartupChecks(): void {
  if (hasRun) return;
  hasRun = true;

  if (process.env.NODE_ENV === 'test') return;

  const { passed, errors, warnings } = checkEnv();

  for (const msg of warnings) {
    logger.warn({ type: 'startup_check', severity: 'warning' }, msg);
  }

  for (const msg of errors) {
    logger.error({ type: 'startup_check', severity: 'error' }, msg);
  }

  if (passed && warnings.length === 0) {
    logger.info({ type: 'startup_check' }, 'Environment validation passed.');
  } else if (passed) {
    logger.info(
      { type: 'startup_check', warnings: warnings.length },
      `Environment validation passed with ${warnings.length} warning(s).`
    );
  } else {
    logger.error(
      { type: 'startup_check', errors: errors.length, warnings: warnings.length },
      `Environment validation failed with ${errors.length} error(s). ` +
        'The application may not function correctly until these are resolved.'
    );
  }
}
