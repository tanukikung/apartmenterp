const BLOCK_TAG_BREAKS = /<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|section|article|header|footer)>/gi;
const OPENING_LIST_TAGS = /<(ul|ol)[^>]*>/gi;
const LIST_ITEM_TAGS = /<li[^>]*>/gi;
const BREAK_TAGS = /<br\s*\/?>/gi;
const TABLE_CELL_TAGS = /<\/t[dh]>\s*<t[dh][^>]*>/gi;
const TABLE_ROW_CLOSE_TAGS = /<\/tr>/gi;
const TABLE_OPEN_TAGS = /<(table|tbody|thead|tfoot|tr|td|th)[^>]*>/gi;
const PAGE_BREAK_MARKERS = /<div[^>]*data-page-break=["']true["'][^>]*>.*?<\/div>/gi;
const HTML_COMMENTS = /<!--[\s\S]*?-->/g;
const HTML_TAGS = /<[^>]+>/g;

const TEMPLATE_META_PATTERN = /<!--template-meta:([\s\S]*?)-->/i;
const HEADER_REGION_PATTERN = /<header[^>]*data-template-region=["']header["'][^>]*>([\s\S]*?)<\/header>/i;
const BODY_REGION_PATTERN = /<section[^>]*data-template-region=["']body["'][^>]*>([\s\S]*?)<\/section>/i;
const FOOTER_REGION_PATTERN = /<footer[^>]*data-template-region=["']footer["'][^>]*>([\s\S]*?)<\/footer>/i;

export type TemplatePageSize = 'A4' | 'LETTER';
export type TemplateMarginPreset = 'narrow' | 'normal' | 'wide';
export type TemplateFontFamily = 'sans' | 'serif' | 'sarabun';
export type TemplateFontSize = 'sm' | 'base' | 'lg';
export type TemplateLineHeight = 'normal' | 'relaxed' | 'loose';

export type TemplateDocumentMeta = {
  pageSize: TemplatePageSize;
  marginPreset: TemplateMarginPreset;
  fontFamily: TemplateFontFamily;
  fontSize: TemplateFontSize;
  lineHeight: TemplateLineHeight;
};

export type ParsedTemplateDocument = {
  meta: TemplateDocumentMeta;
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
};

export const DEFAULT_TEMPLATE_DOCUMENT_META: TemplateDocumentMeta = {
  pageSize: 'A4',
  marginPreset: 'normal',
  fontFamily: 'sans',
  fontSize: 'base',
  lineHeight: 'relaxed',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function coerceMeta(input: unknown): TemplateDocumentMeta {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_TEMPLATE_DOCUMENT_META };
  }

  const source = input as Partial<TemplateDocumentMeta>;
  return {
    pageSize: source.pageSize === 'LETTER' ? 'LETTER' : 'A4',
    marginPreset:
      source.marginPreset === 'narrow' || source.marginPreset === 'wide'
        ? source.marginPreset
        : 'normal',
    fontFamily:
      source.fontFamily === 'serif' || source.fontFamily === 'sarabun'
        ? source.fontFamily
        : 'sans',
    fontSize: source.fontSize === 'sm' || source.fontSize === 'lg' ? source.fontSize : 'base',
    lineHeight:
      source.lineHeight === 'normal' || source.lineHeight === 'loose'
        ? source.lineHeight
        : 'relaxed',
  };
}

function stripTemplateWrappers(html: string): string {
  return html
    .replace(TEMPLATE_META_PATTERN, '')
    .replace(HEADER_REGION_PATTERN, '')
    .replace(BODY_REGION_PATTERN, '$1')
    .replace(FOOTER_REGION_PATTERN, '')
    .trim();
}

export function normalizeDocumentTemplateBody(body: string): string {
  const trimmed = stripTemplateWrappers(body).trim();
  if (!trimmed) {
    return '<p></p>';
  }

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export function parseTemplateDocument(body: string): ParsedTemplateDocument {
  const metaMatch = body.match(TEMPLATE_META_PATTERN);
  let meta = { ...DEFAULT_TEMPLATE_DOCUMENT_META };

  if (metaMatch?.[1]) {
    try {
      meta = coerceMeta(JSON.parse(metaMatch[1]));
    } catch {
      meta = { ...DEFAULT_TEMPLATE_DOCUMENT_META };
    }
  }

  const headerMatch = body.match(HEADER_REGION_PATTERN);
  const footerMatch = body.match(FOOTER_REGION_PATTERN);
  const bodyMatch = body.match(BODY_REGION_PATTERN);

  const bodyWithoutMeta = body.replace(TEMPLATE_META_PATTERN, '');
  const bodyWithoutRegions = bodyWithoutMeta
    .replace(HEADER_REGION_PATTERN, '')
    .replace(FOOTER_REGION_PATTERN, '')
    .trim();

  return {
    meta,
    headerHtml: normalizeDocumentTemplateBody(headerMatch?.[1] || ''),
    bodyHtml: normalizeDocumentTemplateBody(bodyMatch?.[1] || bodyWithoutRegions),
    footerHtml: normalizeDocumentTemplateBody(footerMatch?.[1] || ''),
  };
}

export function serializeTemplateDocument(document: ParsedTemplateDocument): string {
  const meta = coerceMeta(document.meta);
  const headerHtml = normalizeDocumentTemplateBody(document.headerHtml);
  const bodyHtml = normalizeDocumentTemplateBody(document.bodyHtml);
  const footerHtml = normalizeDocumentTemplateBody(document.footerHtml);

  return [
    `<!--template-meta:${JSON.stringify(meta)}-->`,
    `<header data-template-region="header">${headerHtml}</header>`,
    `<section data-template-region="body">${bodyHtml}</section>`,
    `<footer data-template-region="footer">${footerHtml}</footer>`,
  ].join('\n');
}

export function applyTemplateVariables(
  templateBody: string,
  variables: Record<string, string>,
): string {
  let html = templateBody.replace(TEMPLATE_META_PATTERN, '').trim();
  if (!html) {
    html = normalizeDocumentTemplateBody(templateBody);
  }

  for (const [key, value] of Object.entries(variables)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(escapedKey, 'g'), escapeHtml(value));
  }

  return html;
}

export function documentTemplateHtmlToText(body: string): string {
  return body
    .replace(TEMPLATE_META_PATTERN, '')
    .replace(HEADER_REGION_PATTERN, '$1\n\n')
    .replace(BODY_REGION_PATTERN, '$1\n\n')
    .replace(FOOTER_REGION_PATTERN, '\n\n$1')
    .replace(PAGE_BREAK_MARKERS, '\n\n--- PAGE BREAK ---\n\n')
    .replace(OPENING_LIST_TAGS, '\n')
    .replace(LIST_ITEM_TAGS, '- ')
    .replace(TABLE_CELL_TAGS, ' | ')
    .replace(TABLE_ROW_CLOSE_TAGS, '\n')
    .replace(TABLE_OPEN_TAGS, '')
    .replace(BREAK_TAGS, '\n')
    .replace(BLOCK_TAG_BREAKS, '\n')
    .replace(HTML_COMMENTS, '')
    .replace(HTML_TAGS, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
