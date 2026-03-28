import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { ForbiddenError, UnauthorizedError } from '@/lib/utils/errors';

type InvoiceAccessAction = 'pdf' | 'view';

// IMPORTANT: Each environment must configure its own INVOICE_ACCESS_SECRET.
// No fallback chain — if not set in production, deny all access.
function resolveInvoiceAccessSecret(): string | null {
  const secret = process.env.INVOICE_ACCESS_SECRET;
  if (secret?.trim()) return secret.trim();
  if (process.env.NODE_ENV === 'production') return null;
  // In dev/test, return null so verifySignedInvoiceAccess short-circuits
  // (tokens are only created when getInvoiceAccessSecret() is called, which throws in production)
  return null;
}

function getInvoiceAccessSecret(): string {
  const secret = process.env.INVOICE_ACCESS_SECRET;
  if (!secret?.trim()) {
    throw new Error('INVOICE_ACCESS_SECRET must be configured');
  }
  return secret;
}

function encodeInvoiceId(invoiceId: string): string {
  return encodeURIComponent(invoiceId);
}

function signInvoicePayload(payload: string): string {
  // Only called when signed=true, which requires INVOICE_ACCESS_SECRET to be set
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

  // Reject if INVOICE_ACCESS_SECRET is not configured — deny unsigned access
  if (!process.env.INVOICE_ACCESS_SECRET?.trim()) {
    return false;
  }

  const secret = resolveInvoiceAccessSecret()!;
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
