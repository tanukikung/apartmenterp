import type { NextRequest } from 'next/server';

export type ApiAccessClass =
  | 'public'
  | 'session'
  | 'operator'
  | 'system-or-operator'
  | 'custom';

export interface ApiRoutePolicy {
  pattern: string;
  methods?: string[];
  accessClass: ApiAccessClass;
  guardApplied: string;
}

const CSRF_EXEMPT_GUARDS = new Set([
  'verifyLineSignature',
  'verifyOnlyOfficeCallbackToken',
  'requireOperatorOrSignedInvoiceAccess',
]);

const FORCE_PASSWORD_CHANGE_EXEMPT_POLICIES: Array<{ pattern: string; methods: string[] }> = [
  { pattern: '/api/auth/change-password', methods: ['POST'] },
  { pattern: '/api/auth/logout', methods: ['POST'] },
  { pattern: '/api/auth/me', methods: ['GET'] },
];

const EXPLICIT_POLICIES: ApiRoutePolicy[] = [
  {
    pattern: '/api/auth/bootstrap-status',
    methods: ['GET'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/auth/login',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/auth/signup',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/auth/forgot-password',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/auth/reset-password',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/auth/logout',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/auth/me',
    methods: ['GET'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/auth/change-password',
    methods: ['POST'],
    accessClass: 'session',
    guardApplied: 'requireAuthSession',
  },
  {
    pattern: '/api/health',
    methods: ['GET'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/health/deep',
    methods: ['GET'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/metrics',
    methods: ['GET'],
    accessClass: 'public',
    guardApplied: 'public',
  },
  {
    pattern: '/api/system/backup-status',
    methods: ['GET'],
    accessClass: 'operator',
    guardApplied: 'requireRole(ADMIN)',
  },
  {
    pattern: '/api/line/webhook',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'verifyLineSignature',
  },
  {
    pattern: '/api/onlyoffice/document-templates/[id]/callback',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'verifyOnlyOfficeCallbackToken',
  },
  {
    pattern: '/api/onlyoffice/billing-batches/[id]/callback',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'verifyOnlyOfficeCallbackToken',
  },
  {
    pattern: '/api/templates/[id]/callback',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'verifyOnlyOfficeCallbackToken',
  },
  {
    pattern: '/api/invoices/[id]/pdf',
    methods: ['GET'],
    accessClass: 'custom',
    guardApplied: 'requireOperatorOrSignedInvoiceAccess',
  },
  {
    pattern: '/api/invoice/[id]/pdf',
    methods: ['GET'],
    accessClass: 'custom',
    guardApplied: 'requireOperatorOrSignedInvoiceAccess',
  },
  {
    pattern: '/api/invoices/[id]/view',
    methods: ['POST'],
    accessClass: 'custom',
    guardApplied: 'requireOperatorOrSignedInvoiceAccess',
  },
  {
    pattern: '/api/files/[...key]',
    methods: ['GET'],
    accessClass: 'custom',
    guardApplied: 'requireOperatorOrSignedFileAccess',
  },
  {
    pattern: '/api/system/backup/run',
    methods: ['POST'],
    accessClass: 'system-or-operator',
    guardApplied: 'getVerifiedActor(allowSystem)',
  },
  {
    pattern: '/api/maintenance/create',
    methods: ['POST'],
    accessClass: 'public',
    guardApplied: 'legacyTenantPublic',
  },
  {
    pattern: '/api/maintenance/my',
    methods: ['GET'],
    accessClass: 'public',
    guardApplied: 'legacyTenantPublic',
  },
];

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function matchApiRoutePattern(pathname: string, pattern: string): boolean {
  const actualSegments = normalizePath(pathname).split('/').filter(Boolean);
  const patternSegments = normalizePath(pattern).split('/').filter(Boolean);

  for (let i = 0; i < patternSegments.length; i += 1) {
    const expected = patternSegments[i];
    const actual = actualSegments[i];

    if (expected?.startsWith('[...') && expected.endsWith(']')) {
      return true;
    }

    if (!actual) {
      return false;
    }

    if (expected?.startsWith('[') && expected.endsWith(']')) {
      continue;
    }

    if (expected !== actual) {
      return false;
    }
  }

  return actualSegments.length === patternSegments.length;
}

export function resolveApiRoutePolicy(
  pathname: string,
  method: string,
): ApiRoutePolicy | null {
  if (!pathname.startsWith('/api/')) {
    return null;
  }

  const normalizedMethod = method.toUpperCase();
  const explicit = EXPLICIT_POLICIES.find((policy) => {
    if (policy.methods && !policy.methods.includes(normalizedMethod)) {
      return false;
    }
    return matchApiRoutePattern(pathname, policy.pattern);
  });

  if (explicit) {
    return explicit;
  }

  return {
    pattern: pathname,
    methods: [normalizedMethod],
    accessClass: 'operator',
    guardApplied: 'requireOperator',
  };
}

export function hasValidCronSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret');
  return Boolean(secret && process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

export function isCsrfExemptApiRoute(pathname: string, method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  // Auth endpoints submitted via native HTML form (no JS) must be exempt so that
  // browsers which omit the Origin header on same-origin form POSTs don't get blocked.
  if (
    (pathname === '/api/auth/logout' ||
      pathname === '/api/auth/login' ||
      pathname === '/api/auth/signup' ||
      pathname === '/api/auth/forgot-password' ||
      pathname === '/api/auth/reset-password') &&
    normalizedMethod === 'POST'
  ) {
    return true;
  }

  const policy = resolveApiRoutePolicy(pathname, normalizedMethod);
  return Boolean(policy && CSRF_EXEMPT_GUARDS.has(policy.guardApplied));
}

export function isForcePasswordChangeExemptRoute(pathname: string, method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return FORCE_PASSWORD_CHANGE_EXEMPT_POLICIES.some((policy) => (
    policy.methods.includes(normalizedMethod) && matchApiRoutePattern(pathname, policy.pattern)
  ));
}
