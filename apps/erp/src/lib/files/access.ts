import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { ForbiddenError, UnauthorizedError } from '@/lib/utils/errors';

const DEVELOPMENT_FILE_ACCESS_SECRET = 'development-file-access-secret';

function resolveFileAccessSecret(): string | null {
  const configured =
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

  return DEVELOPMENT_FILE_ACCESS_SECRET;
}

function getFileAccessSecret(): string {
  const secret = resolveFileAccessSecret();
  if (!secret) {
    throw new Error('FILE_ACCESS_SECRET must be configured in production');
  }
  return secret;
}

function encodeStorageKey(storageKey: string): string {
  return storageKey
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', getFileAccessSecret())
    .update(payload)
    .digest('base64url');
}

export function createSignedFileAccessToken(input: {
  storageKey: string;
  inline: boolean;
  expiresAt: number;
}): string {
  return signPayload(`${input.storageKey}:${input.inline ? '1' : '0'}:${input.expiresAt}`);
}

export function verifySignedFileAccess(input: {
  storageKey: string;
  inline: boolean;
  expiresAt: number;
  token: string | null;
}): boolean {
  if (!input.token || !Number.isFinite(input.expiresAt) || input.expiresAt <= Date.now()) {
    return false;
  }

  const secret = resolveFileAccessSecret();
  if (!secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${input.storageKey}:${input.inline ? '1' : '0'}:${input.expiresAt}`)
    .digest('base64url');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(input.token, 'utf8'),
    );
  } catch {
    return false;
  }
}

export function requireOperatorOrSignedFileAccess(
  req: NextRequest,
  storageKey: string,
  inline: boolean,
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
  const allowed = verifySignedFileAccess({
    storageKey,
    inline,
    expiresAt,
    token,
  });

  if (!allowed) {
    throw new UnauthorizedError('Authentication required');
  }
}

export function buildFileAccessUrl(
  storageKey: string,
  options?: {
    absoluteBaseUrl?: string;
    inline?: boolean;
    signed?: boolean;
    expiresInSeconds?: number;
  },
): string {
  const inline = options?.inline === true;
  const path = `/api/files/${encodeStorageKey(storageKey)}`;
  const base = (options?.absoluteBaseUrl || '').replace(/\/+$/, '');
  const url = new URL(base ? `${base}${path}` : `http://local${path}`);

  if (inline) {
    url.searchParams.set('inline', '1');
  }

  if (options?.signed) {
    const expiresAt = Date.now() + (options.expiresInSeconds ?? 300) * 1000;
    const token = createSignedFileAccessToken({
      storageKey,
      inline,
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
