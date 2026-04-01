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

  // ── Sentinel-value checks ─────────────────────────────────
  // Reject known development defaults that must be changed before production
  const sentinelValues: Array<{ key: string; sentinel: string }> = [
    { key: 'NEXTAUTH_SECRET', sentinel: DEV_SECRET_SENTINEL },
    { key: 'INVOICE_ACCESS_SECRET', sentinel: 'dev-invoice-access-secret' },
    { key: 'FILE_ACCESS_SECRET', sentinel: 'dev-file-access-secret' },
  ];

  for (const { key, sentinel } of sentinelValues) {
    const val = process.env[key];
    if (val && val.trim() === sentinel) {
      if (process.env.NODE_ENV === 'production') {
        errors.push(`${key} is using a development default. Set a secure value before deploying.`);
      } else {
        warnings.push(`${key} is using a development default — fine for local dev, must be changed for production.`);
      }
    }
  }

  // ── Optional / integration variables ───────────────────────
  const optional: Array<{ key: string; feature: string }> = [
    { key: 'LINE_CHANNEL_ID', feature: 'LINE messaging' },
    { key: 'LINE_CHANNEL_SECRET', feature: 'LINE messaging' },
    { key: 'REDIS_URL', feature: 'Redis (rate-limiting / outbox worker)' },
    { key: 'CRON_SECRET', feature: 'Protected cron endpoints' },
    { key: 'APP_BASE_URL', feature: 'Absolute URL generation (emails, webhooks)' },
    { key: 'INVOICE_ACCESS_SECRET', feature: 'Signed invoice access tokens' },
    { key: 'FILE_ACCESS_SECRET', feature: 'Signed file access tokens' },
  ];

  for (const { key, feature } of optional) {
    if (!process.env[key]) {
      warnings.push(`Optional variable ${key} is not set — ${feature} will be unavailable or degraded.`);
    }
  }

  // LINE access token — accept either name (empty string is falsy, falls through to fallback)
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
