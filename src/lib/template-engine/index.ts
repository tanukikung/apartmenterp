/**
 * Minimal handlebars-like template engine for document generation.
 * Supports: {{field}}, {{#if field}}...{{/if}}, {{#each items}}...{{/each}}
 *
 * Designed for use in PDF generation — substitutes template HTML with real data.
 */

type TemplateData = Record<string, unknown>;

function escapeHtml(s: string | number | boolean | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getNestedValue(obj: TemplateData, path: string): unknown {
  return path.split('.').reduce<unknown>((cur: unknown, key: string) => {
    if (cur == null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

function isTruthy(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Depth-counter tokenizer for IF blocks — properly handles nested {{#if}}...{{/if}}.
 * Uses indexOf to find tags (avoids sticky regex lastIndex reset issues).
 */
function replaceIfBlocks(html: string, data: TemplateData): string {
  const IF_OPEN = '{{#if';
  const IF_CLOSE = '{{/if}}';
  const ELSE_MARK = '{{else}}';

  let result = '';
  let pos = 0;

  while (pos < html.length) {
    // Look for next '{{#if' at or after current position
    const ifPos = html.indexOf(IF_OPEN, pos);

    if (ifPos === -1) {
      // No more IF tags — append rest and return
      result += html.slice(pos);
      return result;
    }

    // Append everything before this IF tag unchanged
    result += html.slice(pos, ifPos);

    // An {{#if}} at position ifPos is valid (top-level) if it's NOT preceded by }}.
    // However, we must also NOT be preceded by }} from an UNCLOSED expression.
    // An unclosed expression looks like: {{expr}} → the '}}' at the end is preceded by '{'.
    // So: reject if preceded by '}}' AND the char before that '}}' is '{' (unclosed expression).
    // But accept if preceded by '}}' where the char before '}}' is NOT '{' (it's the end of a scalar).
    const precededByUnclosedClose =
      ifPos >= 3 &&
      html.slice(ifPos - 2, ifPos) === '}}' &&
      html[ifPos - 3] === '{';
    if (precededByUnclosedClose) {
      // Not a valid block start — treat as literal text, copy char and advance
      result += html[ifPos];
      pos = ifPos + 1;
      continue;
    }

    // Extract field path — find the closing '}}' after '{{#if '
    const afterIfPos = ifPos + IF_OPEN.length;
    const closeBracePos = html.indexOf('}}', afterIfPos);
    if (closeBracePos === -1) {
      // No closing '}}' — malformed, append rest and return
      result += html.slice(ifPos);
      return result;
    }

    const fieldPath = html.slice(afterIfPos, closeBracePos).trim();

    // Scan forward from after '}}' to find matching {{/if}} at depth 0
    let depth = 1;
    let scanPos = closeBracePos + 2;
    let elsePos = -1;
    let closingPos = -1;

    while (scanPos <= html.length) {
      const nextOpen = html.indexOf('{{', scanPos);
      const nextClose = html.indexOf('}}', scanPos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        const token = html.slice(nextOpen, nextClose + 2);

        if (token.startsWith('{{#if')) {
          depth++;
          scanPos = nextOpen + token.length;
        } else if (token === IF_CLOSE) {
          depth--;
          if (depth === 0) {
            closingPos = nextOpen;
            break;
          }
          scanPos = nextOpen + token.length;
        } else if (token === ELSE_MARK && depth === 1) {
          elsePos = nextOpen;
          scanPos = nextOpen + token.length;
        } else {
          scanPos = nextOpen + token.length;
        }
      } else {
        scanPos = nextClose + 2;
      }
    }

    if (closingPos === -1) {
      // No matching {{/if}} — append opening tag and advance past it
      result += html.slice(ifPos, closeBracePos + 2);
      pos = closeBracePos + 2;
      continue;
    }

    // Extract truthy/falsy content
    const truthyContent = html.slice(closeBracePos + 2, closingPos);
    const falsyContent = elsePos !== -1 ? html.slice(elsePos + ELSE_MARK.length, closingPos) : '';

    // Evaluate field truthiness
    const val = getNestedValue(data, fieldPath);

    // Recursively process inner content — nested IFs + scalar substitution
    const innerContent = isTruthy(val) ? truthyContent : falsyContent;
    const processedInner = innerContent
      ? replaceIfBlocks(innerContent, data)
          .replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m: string, p: string) => {
            const v = getNestedValue(data, p);
            return escapeHtml(v as string | number | boolean | null | undefined);
          })
      : '';

    result += processedInner;
    pos = closingPos + IF_CLOSE.length;
  }

  return result;
}

/**
 * Renders a handlebars-like HTML template with the given data object.
 * Data object uses dot-notation for nested values: { building: { name: "X" } }
 * Template uses {{building.name}} syntax.
 *
 * Supported helpers:
 *   {{fieldName}}          — scalar substitution
 *   {{#if field}}...{{/if}} — conditional block
 *   {{#each items}}...{{/each}} — array iteration (use {{this.field}} inside)
 */
export function renderTemplate(templateHtml: string, data: TemplateData): string {
  let html = templateHtml;

  // ── Pass 1: {{#each items}}...{{/each}} ─────────────────────────────────────
  // Must run before scalar substitution to avoid corrupting block placeholders.
  html = html.replace(
    /\{\{#each\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, path: string, inner: string) => {
      const list = getNestedValue(data, path);
      if (!Array.isArray(list)) return '';
      return list
        .map((item: unknown) => {
          let out = inner;
          // Replace {{this.field}} with actual values from the item
          out = out.replace(/\{\{this\.(\w+(?:\.\w+)*)\}\}/g, (_m: string, p: string) => {
            const val = getNestedValue(item as TemplateData, p);
            return escapeHtml(val as string | number | boolean | null | undefined);
          });
          // Replace bare {{this}} for scalar values
          out = out.replace(/\{\{this\}\}/g, String(item));
          return out;
        })
        .join('');
    },
  );

  // ── Pass 2: {{#if field}}...{{else}}...{{/if}} ───────────────────────────────
  // Uses depth-counter tokenizer — handles nested IF blocks correctly
  html = replaceIfBlocks(html, data);

  // ── Pass 3: Scalar {{field.path}} ───────────────────────────────────────────
  html = html.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
    const val = getNestedValue(data, path);
    return escapeHtml(val as string | number | boolean | null | undefined);
  });

  return html;
}

/**
 * Builds the full data object for invoice template rendering.
 * Combines preview data + config + billing into nested structure.
 */
export function buildInvoiceTemplateData(preview: {
  invoiceId: string;
  invoiceNumber?: string;
  roomNo: string;
  floorNo?: number | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  month: number;
  year: number;
  dueDate: string | Date;
  issuedAt?: string | Date | null;
  totalAmount: number;
  items: Array<{
    typeName: string;
    description?: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}, opts: {
  building?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    taxId?: string | null;
  };
  bankAccount?: {
    bankName?: string | null;
    accountNo?: string | null;
    accountName?: string | null;
  };
}): Record<string, unknown> {
  const THAI_MONTHS: Record<number, string> = {
    1: 'มกราคม', 2: 'กุมภาพันธ์', 3: 'มีนาคม', 4: 'เมษายน',
    5: 'พฤษภาคม', 6: 'มิถุนายน', 7: 'กรกฎาคม', 8: 'สิงหาคม',
    9: 'กันยายน', 10: 'ตุลาคม', 11: 'พฤศจิกายน', 12: 'ธันวาคม',
  };

  const fmtDate = (d: string | Date | null | undefined): string => {
    if (!d) return '-';
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return '-';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear() + 543}`;
  };

  const monthName = THAI_MONTHS[preview.month] ?? '';
  const year = preview.year + 543; // Buddhist year

  // Build billing_items array for {{#each billing_items}}
  const billingItems = preview.items.map(item => ({
    typeName: item.typeName,
    description: item.description ?? '',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unitPriceFormatted: `฿${item.unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    amount: item.total,
    amountFormatted: `฿${item.total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }));

  // Compute totals from items
  const subtotal = billingItems.reduce((sum, i) => sum + i.amount, 0);

  const data: Record<string, unknown> = {
    // Top-level scalars that templates commonly use
    invoiceId: preview.invoiceId,
    invoiceNumber: preview.invoiceNumber ?? `INV-${preview.year}${String(preview.month).padStart(2, '0')}-${preview.roomNo}`,
    issuedDate: fmtDate(preview.issuedAt ?? new Date()),
    issueDate: fmtDate(preview.issuedAt ?? new Date()),
    dueDate: fmtDate(preview.dueDate),
    billingMonthLabel: `${monthName} ${year}`,
    monthName,
    year,
    totalFormatted: `฿${preview.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,

    // Nested structures matching template field paths
    room: {
      id: preview.invoiceId,
      number: preview.roomNo,
      floorNumber: preview.floorNo ?? '-',
    },
    tenant: {
      fullName: preview.tenantName ?? '-',
      firstName: preview.tenantName?.split(' ')[0] ?? '-',
      lastName: preview.tenantName?.split(' ').slice(1).join(' ') ?? '-',
      phone: preview.tenantPhone ?? '-',
    },
    building: {
      name: opts.building?.name ?? 'อพาร์ตเมนต์',
      address: opts.building?.address ?? '',
      phone: opts.building?.phone ?? '',
      email: '',
    },
    billing: {
      recordId: preview.invoiceId,
      year: preview.year,
      month: preview.month,
      monthName,
      yearDisplay: year,
      issueDate: fmtDate(preview.issuedAt ?? new Date()),
      dueDate: fmtDate(preview.dueDate),
      rentAmount: billingItems.find(i => i.typeName.includes('เช่า') || i.typeName.includes('ค่าห้อง'))?.amount ?? 0,
      rentAmountFormatted: billingItems.find(i => i.typeName.includes('เช่า') || i.typeName.includes('ค่าห้อง'))?.amountFormatted ?? '฿0.00',
      waterUnits: 0,
      waterTotal: billingItems.find(i => i.typeName.includes('น้ำ'))?.amount ?? 0,
      waterTotalFormatted: billingItems.find(i => i.typeName.includes('น้ำ'))?.amountFormatted ?? '฿0.00',
      electricityUnits: 0,
      electricityTotal: billingItems.find(i => i.typeName.includes('ไฟ'))?.amount ?? 0,
      electricityTotalFormatted: billingItems.find(i => i.typeName.includes('ไฟ'))?.amountFormatted ?? '฿0.00',
      lateFeeAmount: billingItems.find(i => i.typeName.includes('ปรับ') || i.typeName.includes('late'))?.amount ?? 0,
      extraCharges: billingItems.filter(i =>
        !i.typeName.includes('เช่า') && !i.typeName.includes('ค่าห้อง') &&
        !i.typeName.includes('น้ำ') && !i.typeName.includes('ไฟ') &&
        !i.typeName.includes('ปรับ') && !i.typeName.includes('late')
      ),
      subtotal,
      total: preview.totalAmount,
      subtotalFormatted: `฿${subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      totalFormatted: `฿${preview.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      notes: '',
      isOverdue: false,
    },
    billing_items: billingItems,

    bankAccount: {
      bankName: opts.bankAccount?.bankName ?? '',
      accountNo: opts.bankAccount?.accountNo ?? '',
      accountName: opts.bankAccount?.accountName ?? '',
    },

    // Computed fields
    computed: {
      billingMonthLabel: `${monthName} ${year}`,
      dueDateLabel: fmtDate(preview.dueDate),
      invoiceNumber: preview.invoiceNumber ?? `INV-${preview.year}${String(preview.month).padStart(2, '0')}-${preview.roomNo}`,
      issuedDateLabel: fmtDate(preview.issuedAt ?? new Date()),
      totalAmountFormatted: `฿${preview.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      qrDataUrl: '', // QR code generated separately in the API route if needed
    },

    // Top-level convenience fields matching tpl design
    notes: '',

    // System
    system: {
      generatedAt: new Date().toISOString(),
    },
  };

  return data;
}