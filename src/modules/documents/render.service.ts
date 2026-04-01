import { load } from 'cheerio';
import { DocumentFieldValueType } from '@prisma/client';
import type { DocumentRenderContext } from './resolver.service';
import type { DocumentTemplateFieldResponse } from './types';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeCollectionKey(key: string): string {
  if (key === 'billing_items') return 'billingItems';
  return key;
}

function getValueByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function coerceScalarValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function fallbackPlaceholderMap(context: DocumentRenderContext): Record<string, string> {
  const entries: Array<[string, string]> = [];

  function walk(prefix: string, value: unknown) {
    if (value === null || value === undefined) {
      entries.push([prefix, '']);
      return;
    }

    if (Array.isArray(value)) {
      return;
    }

    if (typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
        walk(prefix ? `${prefix}.${key}` : key, nestedValue);
      });
      return;
    }

    entries.push([prefix, coerceScalarValue(value)]);
  }

  walk('', context);
  return Object.fromEntries(entries.filter(([key]) => key));
}

function replaceFallbackPlaceholders(html: string, context: DocumentRenderContext): string {
  const flatMap = fallbackPlaceholderMap(context);
  let result = html;

  for (const [key, value] of Object.entries(flatMap)) {
    // Escape HTML in substituted values to prevent XSS from malicious template content
    result = result.replace(new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'), escapeHtml(value));
  }

  return result;
}

function renderScalarFields(html: string, context: DocumentRenderContext): string {
  const $ = load(html, { xml: { decodeEntities: false } });

  $('[data-template-field]').each((_, element) => {
    const key = $(element).attr('data-template-field');
    if (!key) return;

    const normalizedKey = key.startsWith('billing_items.') ? key.replace(/^billing_items\./, '') : key;

    // pageNumber / totalPages are rendered as-is (dynamic — replaced at print time)
    if (normalizedKey === 'pageNumber' || normalizedKey === 'totalPages') {
      return; // leave placeholder text
    }

    const value = getValueByPath(context, normalizedKey);
    $(element).text(coerceScalarValue(value));
  });

  return $.html();
}

function renderRepeatBlocks(html: string, context: DocumentRenderContext): string {
  const $ = load(html, { xml: { decodeEntities: false } });

  $('[data-template-repeat]').each((_, element) => {
    const repeatKey = $(element).attr('data-template-repeat');
    if (!repeatKey) return;

    const collectionValue = getValueByPath(context, normalizeCollectionKey(repeatKey));
    if (!Array.isArray(collectionValue)) {
      $(element).remove();
      return;
    }

    const templateInnerHtml = $(element).html() ?? '';
    if (collectionValue.length === 0) {
      $(element).empty();
      return;
    }

    const renderedHtml = collectionValue
      .map((item) => {
        const item$ = load(templateInnerHtml, { xml: { decodeEntities: false } });
        item$('[data-template-field]').each((__, child) => {
          const key = item$(child).attr('data-template-field');
          if (!key) return;

          const normalizedKey = key.startsWith(`${repeatKey}.`)
            ? key.slice(repeatKey.length + 1)
            : key.startsWith('billing_items.')
              ? key.replace(/^billing_items\./, '')
              : key;
          const value = getValueByPath(item, normalizedKey);
          item$(child).text(coerceScalarValue(value));
          item$(child).removeAttr('data-template-field');
        });
        let renderedItemHtml = item$.root().html() ?? '';
        for (const [entryKey, entryValue] of Object.entries(item as Record<string, unknown>)) {
          // Escape HTML in substituted values to prevent XSS
          const safeValue = escapeHtml(coerceScalarValue(entryValue));
          renderedItemHtml = renderedItemHtml.replace(
            new RegExp(`\\{\\{\\s*${repeatKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${entryKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'),
            safeValue,
          );
          renderedItemHtml = renderedItemHtml.replace(
            new RegExp(`\\{\\{\\s*${entryKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'),
            safeValue,
          );
        }
        return renderedItemHtml;
      })
      .join('');

    $(element).html(renderedHtml);
  });

  return $.html();
}

export function validateRequiredFields(context: DocumentRenderContext, fields: DocumentTemplateFieldResponse[]) {
  return fields
    .filter((field) => field.isRequired)
    .map((field) => {
      const value = field.isCollection
        ? getValueByPath(context, normalizeCollectionKey(field.path))
        : getValueByPath(context, field.path);
      return {
        key: field.key,
        label: field.label,
        missing: isMissingValue(value),
      };
    })
    .filter((result) => result.missing)
    .map((result) => ({
      key: result.key,
      label: result.label,
      message: `${result.label} is missing`,
    }));
}

export function renderTemplateHtml(
  body: string,
  context: DocumentRenderContext,
  fields: DocumentTemplateFieldResponse[],
) {
  const requiredFieldErrors = validateRequiredFields(context, fields);
  let html = body;
  html = renderRepeatBlocks(html, context);
  html = renderScalarFields(html, context);
  html = replaceFallbackPlaceholders(html, context);

  return {
    html,
    missingFields: requiredFieldErrors,
  };
}

export function inferPrimaryFieldValueType(key: string, fields: DocumentTemplateFieldResponse[]): DocumentFieldValueType {
  return fields.find((field) => field.key === key)?.valueType ?? DocumentFieldValueType.STRING;
}
