import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Enable tracing in production / staging only
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.0,
  // Capture only errors in CI / production
  enabled: process.env.NODE_ENV !== 'test',
  // Breadcrumb limit to keep overhead low
  maxBreadcrumbs: 50,
  // Ignore common non-actionable errors
  ignoreErrors: [
    'Non-Error promise rejection',
    'Failed to fetch',
    'Network request failed',
  ],
  // Attach stack traces to non-error events
  attachStacktrace: process.env.NODE_ENV !== 'production',
  // Environment tag
  environment: process.env.NODE_ENV ?? 'development',
});