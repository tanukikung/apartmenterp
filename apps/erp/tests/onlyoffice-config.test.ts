import { afterEach, describe, expect, it } from 'vitest';
import {
  createOnlyOfficeDocumentKey,
  createOnlyOfficeEditorConfig,
  inferOnlyOfficeDocumentType,
  verifyOnlyOfficeCallbackToken,
} from '@/lib/onlyoffice';

const originalServerUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
const originalBaseUrl = process.env.APP_BASE_URL;
const originalSecret = process.env.ONLYOFFICE_JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

describe('onlyoffice config helpers', () => {
  afterEach(() => {
    process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = originalServerUrl;
    process.env.APP_BASE_URL = originalBaseUrl;
    process.env.ONLYOFFICE_JWT_SECRET = originalSecret;
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it('maps office file types to correct document types', () => {
    expect(inferOnlyOfficeDocumentType('xlsx')).toBe('cell');
    expect(inferOnlyOfficeDocumentType('docx')).toBe('word');
    expect(inferOnlyOfficeDocumentType('pdf')).toBe('pdf');
  });

  it('builds editor config with token when jwt secret exists', () => {
    process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = 'https://docs.example.com';
    process.env.APP_BASE_URL = 'https://app.example.com';
    process.env.ONLYOFFICE_JWT_SECRET = 'test-secret';

    const result = createOnlyOfficeEditorConfig({
      title: 'template.html',
      url: 'https://app.example.com/api/files/onlyoffice/templates/abc.html',
      fileType: 'html',
      documentType: 'word',
      key: createOnlyOfficeDocumentKey('template', 'abc', 1),
      callbackUrl: 'https://app.example.com/api/onlyoffice/document-templates/abc/callback',
      user: {
        id: 'u1',
        name: 'Owner',
        group: 'ADMIN',
      },
    });

    expect(result.documentServerUrl).toBe('https://docs.example.com');
    expect(result.token).toBeTruthy();
    expect((result.config.document as { title: string }).title).toBe('template.html');
  });

  it('fails closed in production when the callback secret is missing', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.ONLYOFFICE_JWT_SECRET;

    expect(verifyOnlyOfficeCallbackToken(null)).toBe(false);
  });

  it('allows unsigned callbacks only outside production when the secret is missing', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    delete process.env.ONLYOFFICE_JWT_SECRET;

    expect(verifyOnlyOfficeCallbackToken(null)).toBe(true);
  });
});
