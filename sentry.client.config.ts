import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Lower sample rate for client-side tracing
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0.0,
  // Capture only errors in CI / production
  enabled: process.env.NODE_ENV !== 'test',
  // Breadcrumb limit
  maxBreadcrumbs: 50,
  // Environment tag
  environment: process.env.NODE_ENV ?? 'development',
});