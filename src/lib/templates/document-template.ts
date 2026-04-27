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

export type TemplatePageSize = 'A5' | 'A4' | 'A3' | 'LETTER' | 'LEGAL' | 'CUSTOM';
export type TemplateOrientation = 'PORTRAIT' | 'LANDSCAPE';
export type TemplateMarginPreset = 'narrow' | 'normal' | 'wide' | 'custom';
export type TemplateFontFamily = 'sans' | 'serif' | 'sarabun';
export type TemplateFontSize = 'sm' | 'base' | 'lg';
export type TemplateLineHeight = 'normal' | 'relaxed' | 'loose';

export type TemplateDocumentMeta = {
  pageSize: TemplatePageSize;
  orientation: TemplateOrientation;
  marginPreset: TemplateMarginPreset;
  fontFamily: TemplateFontFamily;
  fontSize: TemplateFontSize;
  lineHeight: TemplateLineHeight;
  /** Used when pageSize is CUSTOM */
  customWidthMm?: number;
  customHeightMm?: number;
  /** Used when marginPreset is 'custom' — all four sides in mm */
  customMarginTopMm?: number;
  customMarginBottomMm?: number;
  customMarginLeftMm?: number;
  customMarginRightMm?: number;
};

export type ParsedTemplateDocument = {
  meta: TemplateDocumentMeta;
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
};

export const DEFAULT_TEMPLATE_DOCUMENT_META: TemplateDocumentMeta = {
  pageSize: 'A4',
  orientation: 'PORTRAIT',
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

  const VALID_SIZES = ['A5', 'A4', 'A3', 'LETTER', 'LEGAL', 'CUSTOM'] as const;
  const source = input as Partial<TemplateDocumentMeta>;
  return {
    pageSize: VALID_SIZES.includes(source.pageSize as typeof VALID_SIZES[number]) ? (source.pageSize as TemplatePageSize) : 'A4',
    orientation: source.orientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT',
    marginPreset:
      source.marginPreset === 'narrow' || source.marginPreset === 'wide'
        ? source.marginPreset
        : source.marginPreset === 'custom' ? 'custom' : 'normal',
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

// ── Plain-text mail-merge ────────────────────────────────────────────────────
//
// Used by the LINE messaging path where the template body is plain text (not
// HTML) and values must not be HTML-escaped. Accepts variable keys with or
// without double braces — `tenantName` and `{{tenantName}}` both work.
//
export function applyPlainTextTemplateVariables(
  body: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  let out = body;
  for (const [rawKey, rawValue] of Object.entries(variables)) {
    const value = rawValue == null ? '' : String(rawValue);
    const bare = rawKey.replace(/^\{\{|\}\}$/g, '').trim();
    if (!bare) continue;
    const pattern = new RegExp(`\\{\\{\\s*${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g');
    out = out.replace(pattern, value);
  }
  return out;
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

// ── Invoice mail-merge substitution ──────────────────────────────────────────
//
// Replaces data-template-field inner content with real invoice data before
// the HTML is converted to plain text for the PDF notes section.
//
export function substituteInvoiceTemplateFields(
  html: string,
  data: {
    roomNo: string;
    floorNo?: number | null;
    tenantName?: string | null;
    tenantPhone?: string | null;
    periodLabel: string;
    dueDateLabel: string;
    totalFormatted: string;
    items: Array<{
      typeName: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  },
): string {
  let out = html;

  // ── Scalar fields ──────────────────────────────────────────────────────────
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const scalars: Record<string, string> = {
    'room\\.number':                   esc(data.roomNo),
    'room\\.floorNumber':              esc(String(data.floorNo ?? '-')),
    'tenant\\.fullName':               esc(data.tenantName ?? '-'),
    'tenant\\.phone':                  esc(data.tenantPhone ?? '-'),
    'computed\\.billingMonthLabel':    esc(data.periodLabel),
    'computed\\.dueDateLabel':         esc(data.dueDateLabel),
    'computed\\.totalAmountFormatted': esc(data.totalFormatted),
  };

  for (const [field, value] of Object.entries(scalars)) {
    // Replace inner text of any tag with data-template-field="<field>"
    out = out.replace(
      new RegExp(
        `(<[^>]+data-template-field="${field}"[^>]*>)[^<]*(</[^>]*>)`,
        'g',
      ),
      `$1${value}$2`,
    );
  }

  // ── Billing items repeat ───────────────────────────────────────────────────
  // Find <tbody data-template-repeat="billing_items">...</tbody> and expand rows
  out = out.replace(
    /(<tbody[^>]+data-template-repeat="billing_items"[^>]*>)([\s\S]*?)(<\/tbody>)/gi,
    (_match, open, inner, close) => {
      const rows = data.items.map(item => {
        let row = inner;
        const itemScalars: Record<string, string> = {
          'billing_items\\.typeName':          esc(item.typeName),
          'billing_items\\.quantity':           esc(String(item.quantity)),
          'billing_items\\.unitPriceFormatted': esc(item.unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
          'billing_items\\.amountFormatted':    esc(item.total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
        };
        for (const [f, v] of Object.entries(itemScalars)) {
          row = row.replace(
            new RegExp(`(<[^>]+data-template-field="${f}"[^>]*>)[^<]*(</[^>]*>)`, 'g'),
            `$1${v}$2`,
          );
        }
        return row;
      });
      return `${open}${rows.join('')}${close}`;
    },
  );

  return out;
}
