import { describe, expect, it } from 'vitest';
import {
  applyTemplateVariables,
  documentTemplateHtmlToText,
  parseTemplateDocument,
  serializeTemplateDocument,
} from '@/lib/templates/document-template';

describe('document template helpers', () => {
  it('parses and serializes header, body, footer, and layout metadata', () => {
    const serialized = serializeTemplateDocument({
      meta: {
        pageSize: 'LETTER',
        orientation: 'PORTRAIT',
        marginPreset: 'wide',
        fontFamily: 'sarabun',
        fontSize: 'lg',
        lineHeight: 'loose',
      },
      headerHtml: '<p>Header title</p>',
      bodyHtml: '<p>Body content</p>',
      footerHtml: '<p>Footer content</p>',
    });

    const parsed = parseTemplateDocument(serialized);

    expect(parsed.meta).toEqual({
      pageSize: 'LETTER',
      orientation: 'PORTRAIT',
      marginPreset: 'wide',
      fontFamily: 'sarabun',
      fontSize: 'lg',
      lineHeight: 'loose',
    });
    expect(parsed.headerHtml).toContain('Header title');
    expect(parsed.bodyHtml).toContain('Body content');
    expect(parsed.footerHtml).toContain('Footer content');
  });

  it('replaces merge variables across document regions', () => {
    const template = serializeTemplateDocument({
      meta: {
        pageSize: 'A4',
        orientation: 'PORTRAIT',
        marginPreset: 'normal',
        fontFamily: 'sans',
        fontSize: 'base',
        lineHeight: 'relaxed',
      },
      headerHtml: '<p>{{buildingName}}</p>',
      bodyHtml: '<p>Hello {{tenantName}}</p>',
      footerHtml: '<p>{{invoiceNumber}}</p>',
    });

    const html = applyTemplateVariables(template, {
      '{{buildingName}}': 'Apartment ERP',
      '{{tenantName}}': 'Somchai',
      '{{invoiceNumber}}': 'INV-001',
    });

    expect(html).toContain('Apartment ERP');
    expect(html).toContain('Somchai');
    expect(html).toContain('INV-001');
  });

  it('preserves region separation when converting to text', () => {
    const text = documentTemplateHtmlToText(
      serializeTemplateDocument({
        meta: {
          pageSize: 'A4',
          orientation: 'PORTRAIT',
          marginPreset: 'normal',
          fontFamily: 'sans',
          fontSize: 'base',
          lineHeight: 'relaxed',
        },
        headerHtml: '<p>Header note</p>',
        bodyHtml: '<p>Main content</p><div data-page-break="true">Page break</div><p>Page two</p>',
        footerHtml: '<p>Footer note</p>',
      }),
    );

    expect(text).toContain('Header note');
    expect(text).toContain('Main content');
    expect(text).toContain('--- PAGE BREAK ---');
    expect(text).toContain('Page two');
    expect(text).toContain('Footer note');
  });
});
