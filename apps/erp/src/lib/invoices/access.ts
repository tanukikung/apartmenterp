import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { ForbiddenError, UnauthorizedError } from '@/lib/utils/errors';

type InvoiceAccessAction = 'pdf' | 'view';

const DEVELOPMENT_INVOICE_ACCESS_SECRET = 'development-invoice-access-secret';

function resolveInvoiceAccessSecret(): string | null {
  const configured =
    process.env.INVOICE_ACCESS_SECRET ||
    process.env.FILE_ACCESS_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.ADMIN_TOKEN;

  if (configured?.trim()) {
    return configured.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return DEVELOPMENT_INVOICE_ACCESS_SECRET;
}

function getInvoiceAccessSecret(): string {
  const secret = resolveInvoiceAccessSecret();
  if (!secret) {
    throw new Error('INVOICE_ACCESS_SECRET must be configured in production');
  }
  return secret;
}

function encodeInvoiceId(invoiceId: string): string {
  return encodeURIComponent(invoiceId);
}

function signInvoicePayload(payload: string): string {
  return crypto.createHmac('sha256', getInvoiceAccessSecret()).update(payload).digest('base64url');
}

export function createSignedInvoiceAccessToken(input: {
  invoiceId: string;
  action: InvoiceAccessAction;
  expiresAt: number;
}): string {
  return signInvoicePayload(`${input.invoiceId}:${input.action}:${input.expiresAt}`);
}

export function verifySignedInvoiceAccess(input: {
  invoiceId: string;
  action: InvoiceAccessAction;
  expiresAt: number;
  token: string | null;
}): boolean {
  if (!input.token || !Number.isFinite(input.expiresAt) || input.expiresAt <= Date.now()) {
    return false;
  }

  const secret = resolveInvoiceAccessSecret();
  if (!secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${input.invoiceId}:${input.action}:${input.expiresAt}`)
    .digest('base64url');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(input.token, 'utf8'));
  } catch {
    return false;
  }
}

export function buildInvoiceAccessUrl(
  invoiceId: string,
  options?: {
    absoluteBaseUrl?: string;
    action?: InvoiceAccessAction;
    signed?: boolean;
    expiresInSeconds?: number;
  },
): string {
  const action = options?.action ?? 'pdf';
  const path =
    action === 'view'
      ? `/api/invoices/${encodeInvoiceId(invoiceId)}/view`
      : `/api/invoices/${encodeInvoiceId(invoiceId)}/pdf`;
  const base = (options?.absoluteBaseUrl || '').replace(/\/+$/, '');
  const url = new URL(base ? `${base}${path}` : `http://local${path}`);

  if (options?.signed) {
    const expiresAt = Date.now() + (options.expiresInSeconds ?? 60 * 60 * 24 * 30) * 1000;
    const token = createSignedInvoiceAccessToken({
      invoiceId,
      action,
      expiresAt,
    });
    url.searchParams.set('expires', String(expiresAt));
    url.searchParams.set('token', token);
  }

  if (base) {
    return url.toString();
  }

  return `${url.pathname}${url.search}`;
}

export function requireOperatorOrSignedInvoiceAccess(
  req: NextRequest,
  invoiceId: string,
  action: InvoiceAccessAction,
): void {
  const session = getSessionFromRequest(req);
  if (session) {
    if (!['ADMIN', 'STAFF'].includes(session.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    return;
  }

  const url = new URL(req.url);
  const expiresAt = Number(url.searchParams.get('expires') || '');
  const token = url.searchParams.get('token');
  const allowed = verifySignedInvoiceAccess({
    invoiceId,
    action,
    expiresAt,
    token,
  });

  if (!allowed) {
    throw new UnauthorizedError('Authentication required');
  }
}
