import { createHash, createHmac } from 'node:crypto';
import { ExternalServiceError } from '@/lib/utils/errors';

export type OnlyOfficeDocumentType = 'word' | 'cell' | 'slide' | 'pdf' | 'diagram';

export type OnlyOfficeEditorUser = {
  id: string;
  name: string;
  group?: string;
};

type OnlyOfficeEditorConfigInput = {
  title: string;
  url: string;
  fileType: string;
  documentType: OnlyOfficeDocumentType;
  key: string;
  callbackUrl: string;
  user: OnlyOfficeEditorUser;
  mode?: 'edit' | 'view';
};

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function getOnlyOfficeDocumentServerUrl(): string {
  const value = (process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || '').trim().replace(/\/+$/, '');
  if (!value) {
    throw new ExternalServiceError('ONLYOFFICE', new Error('ONLYOFFICE_DOCUMENT_SERVER_URL is not configured'));
  }
  return value;
}

export function getOnlyOfficeAppBaseUrl(): string {
  const value = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!value) {
    throw new ExternalServiceError('ONLYOFFICE', new Error('APP_BASE_URL is not configured'));
  }
  return value;
}

/**
 * URL that ONLYOFFICE Document Server uses to call back into this app.
 *
 * In Docker Compose the OnlyOffice container cannot reach "localhost" — it
 * needs the internal service name (e.g. http://app:3000).  Set
 * ONLYOFFICE_CALLBACK_BASE_URL to the internal URL when running in Docker;
 * leave it unset in dev/production where APP_BASE_URL is already reachable.
 *
 *   Dev (no Docker):  ONLYOFFICE_CALLBACK_BASE_URL not set → uses APP_BASE_URL
 *   Docker Compose:   ONLYOFFICE_CALLBACK_BASE_URL=http://app:3000
 *   Production:       ONLYOFFICE_CALLBACK_BASE_URL not set → uses APP_BASE_URL
 */
export function getOnlyOfficeCallbackBaseUrl(): string {
  const override = (process.env.ONLYOFFICE_CALLBACK_BASE_URL || '').trim().replace(/\/+$/, '');
  if (override) return override;
  return getOnlyOfficeAppBaseUrl();
}

/**
 * Whether the ONLYOFFICE integration is explicitly enabled via env var.
 * Set ONLYOFFICE_ENABLED=false to disable even if URL is configured.
 */
export function isOnlyOfficeEnabled(): boolean {
  const enabled = (process.env.ONLYOFFICE_ENABLED || 'true').trim().toLowerCase();
  return enabled !== 'false' && enabled !== '0' && enabled !== 'no';
}

/**
 * Whether ONLYOFFICE is fully configured and usable.
 * Requires: enabled flag ON + DOCUMENT_SERVER_URL set + APP_BASE_URL set.
 */
export function isOnlyOfficeConfigured(): boolean {
  return isOnlyOfficeEnabled() && Boolean((process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || '').trim() && (process.env.APP_BASE_URL || '').trim());
}

export function signOnlyOfficeToken(payload: Record<string, unknown>): string | undefined {
  const secret = (process.env.ONLYOFFICE_JWT_SECRET || '').trim();
  if (!secret) return undefined;

  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = toBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function createOnlyOfficeDocumentKey(...parts: Array<string | number | Date>): string {
  const raw = parts
    .map((part) => {
      if (part instanceof Date) return String(part.getTime());
      return String(part);
    })
    .join(':');

  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function inferOnlyOfficeDocumentType(fileType: string): OnlyOfficeDocumentType {
  const lower = fileType.toLowerCase();
  if (['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(lower)) return 'cell';
  if (['ppt', 'pptx', 'odp'].includes(lower)) return 'slide';
  if (['pdf'].includes(lower)) return 'pdf';
  if (['vsdx', 'vsdm', 'vssx', 'vstm'].includes(lower)) return 'diagram';
  return 'word';
}

/**
 * Verify the JWT token that ONLYOFFICE attaches to every callback request.
 *
 * ONLYOFFICE sends the token either in the Authorization header (Bearer scheme)
 * or in the JSON body as `token` when JWT_IN_BODY=true.  Pass whichever is
 * available; this function checks both sources in order.
 *
 * Returns true when:
 *   - ONLYOFFICE_JWT_SECRET is not configured (JWT disabled — dev/test mode)
 *   - A valid, correctly-signed token is present
 *
 * Returns false when the secret is configured but the token is missing or
 * the signature does not match.
 */
export function verifyOnlyOfficeCallbackToken(
  authorizationHeader: string | null,
  bodyToken?: string,
): boolean {
  const secret = (process.env.ONLYOFFICE_JWT_SECRET || '').trim();
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const headerBearer = (authorizationHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  const token = headerBearer || bodyToken || '';

  if (!token) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, bodyB64, signatureB64] = parts;
    const expected = createHmac('sha256', secret)
      .update(`${headerB64}.${bodyB64}`)
      .digest('base64url');
    return expected === signatureB64;
  } catch {
    return false;
  }
}

export function createOnlyOfficeEditorConfig(input: OnlyOfficeEditorConfigInput) {
  const config = {
    document: {
      title: input.title,
      url: input.url,
      fileType: input.fileType.toLowerCase(),
      key: input.key,
      permissions: {
        edit: input.mode !== 'view',
        download: true,
        print: true,
        copy: true,
        fillForms: true,
        modifyContentControl: true,
        modifyFilter: true,
        review: input.mode !== 'view',
      },
    },
    documentType: input.documentType,
    width: '100%',
    height: '100%',
    type: 'desktop',
    editorConfig: {
      mode: input.mode ?? 'edit',
      lang: 'en',
      callbackUrl: input.callbackUrl,
      user: {
        id: input.user.id,
        name: input.user.name,
        group: input.user.group,
      },
      customization: {
        autosave: true,
        forcesave: true,
        compactHeader: false,
        compactToolbar: false,
        toolbarNoTabs: false,
      },
      coEditing: {
        mode: 'strict',
        change: false,
      },
    },
  };

  const token = signOnlyOfficeToken(config as unknown as Record<string, unknown>);
  return {
    config,
    token,
    documentServerUrl: getOnlyOfficeDocumentServerUrl(),
  };
}
