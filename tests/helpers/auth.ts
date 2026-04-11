import type { AdminRole } from '@prisma/client';
import { signSessionToken, type AuthSessionPayload } from '@/lib/auth/session';

type RequestLikeOptions = {
  url: string;
  method?: string;
  role?: AdminRole;
  plainRole?: AdminRole;
  sessionOverrides?: Partial<AuthSessionPayload>;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  bodyText?: string;
  formData?: () => Promise<unknown>;
};

function buildSessionPayload(
  role: AdminRole,
  overrides?: Partial<AuthSessionPayload>,
): AuthSessionPayload {
  return {
    sub: overrides?.sub || `test-${role.toLowerCase()}`,
    username: overrides?.username || `${role.toLowerCase()}-user`,
    displayName: overrides?.displayName || `${role} User`,
    role,
    forcePasswordChange: overrides?.forcePasswordChange ?? false,
    buildingId: overrides?.buildingId ?? null,
    exp: overrides?.exp ?? Math.floor(Date.now() / 1000) + 60 * 60,
  };
}

export function buildSignedAuthCookie(
  role: AdminRole,
  overrides?: Partial<AuthSessionPayload>,
): string {
  const token = signSessionToken(buildSessionPayload(role, overrides));
  return `auth_session=${token}; role=${role}`;
}

export function makeCookieStoreFromHeader(header?: string) {
  const parsed = parseCookieHeader(header);
  return {
    get: (key: string) => {
      const value = parsed[key];
      return value ? { name: key, value } : undefined;
    },
  };
}

export function makeRequestLike(options: RequestLikeOptions) {
  const headers = new Map<string, string>();
  for (const [key, value] of Object.entries(options.headers || {})) {
    headers.set(key.toLowerCase(), value);
  }

  const cookies: Record<string, string> = {
    ...(options.cookies || {}),
  };

  if (options.role) {
    const token = signSessionToken(buildSessionPayload(options.role, options.sessionOverrides));
    cookies.auth_session = token;
    cookies.role = options.role;
  } else if (options.plainRole) {
    cookies.role = options.plainRole;
  }

  const bodyText =
    options.bodyText ??
    (typeof options.body === 'string'
      ? options.body
      : options.body === undefined
      ? ''
      : JSON.stringify(options.body));

  return {
    url: options.url,
    method: options.method || 'GET',
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) || null,
    },
    cookies: {
      get: (key: string) => {
        const value = cookies[key];
        return value ? { name: key, value } : undefined;
      },
    },
    json: async () => {
      if (options.body !== undefined) {
        return JSON.parse(bodyText);
      }
      return bodyText ? JSON.parse(bodyText) : {};
    },
    text: async () => bodyText,
    formData: options.formData,
  } as const;
}

export function parseCookieHeader(header?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';').map((value) => value.trim())) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) continue;
    const key = part.slice(0, separatorIndex);
    const value = part.slice(separatorIndex + 1);
    result[key] = value;
  }
  return result;
}
