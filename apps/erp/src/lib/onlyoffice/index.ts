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

export function isOnlyOfficeConfigured(): boolean {
  return Boolean((process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || '').trim() && (process.env.APP_BASE_URL || '').trim());
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
