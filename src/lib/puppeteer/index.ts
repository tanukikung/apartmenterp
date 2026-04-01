/**
 * Puppeteer service — provides real Chromium rendering for:
 *   1. HTML → PDF  (pixel-perfect, multi-page, CSS-aware)
 *   2. HTML → PNG screenshot (for live template preview)
 *
 * Uses a singleton Browser instance to avoid the ~1-2 s cold-start cost
 * on every call.  The browser is launched once and reused across requests.
 */

import puppeteer, { type Browser } from 'puppeteer';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PdfOptions = {
  title?: string;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  printBackground?: boolean;
  scale?: number;
};

export type ScreenshotOptions = {
  width?: number;
  height?: number;
  fullPage?: boolean;
};

// ─── Browser singleton ────────────────────────────────────────────────────────

let _browserPromise: Promise<Browser> | null = null;

async function acquireBrowser(): Promise<Browser> {
  if (_browserPromise) return _browserPromise;

  _browserPromise = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });

  return _browserPromise;
}

/**
 * Warm-up the browser early (call once at startup).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function warmupBrowser(): Promise<void> {
  await acquireBrowser();
}

// ─── HTML → full document ────────────────────────────────────────────────────

function wrapHtmlDocument(html: string, options: PdfOptions): string {
  const {
    title = 'Document',
    pageSize = 'A4',
    orientation = 'portrait',
    marginTop = '15mm',
    marginBottom = '15mm',
    marginLeft = '15mm',
    marginRight = '15mm',
  } = options;

  const sizeMap: Record<string, string> = {
    A4: '210mm 297mm',
    Letter: '8.5in 11in',
    Legal: '8.5in 14in',
  };

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      font-family: 'Sarabun', 'Noto Sans Thai', 'Segoe UI', sans-serif;
      font-size: 15px;
      line-height: 1.6;
      color: #1a1a1a;
      background: white;
    }

    @page {
      size: ${sizeMap[pageSize]} ${orientation};
      margin: ${marginTop} ${marginRight} ${marginBottom} ${marginLeft};
    }

    body { orphans: 3; widows: 3; }

    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ccc; padding: 4px 8px; }
    img { max-width: 100%; height: auto; }
    h1, h2, h3 { page-break-after: avoid; }
    p { page-break-inside: avoid; }

    /* Print-specific resets */
    @media print {
      html, body { background: white; }
    }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Render HTML string to a PDF Buffer using a real Chromium browser.
 * Supports multi-page, CSS media queries, embedded fonts, backgrounds.
 */
export async function htmlToPdfBuffer(
  html: string,
  options: PdfOptions = {},
): Promise<Buffer> {
  const browser = await acquireBrowser();
  const page = await browser.newPage();

  try {
    const wrappedHtml = wrapHtmlDocument(html, options);

    await page.setContent(wrappedHtml, {
      waitUntil: 'networkidle0',
      timeout: 30_000,
    });

    // Wait for any web fonts to load
    await page.evaluate(() => document.fonts.ready);

    const pdfBuffer = await page.pdf({
      format: options.pageSize ?? 'A4',
      landscape: options.orientation === 'landscape',
      margin: {
        top: options.marginTop ?? '15mm',
        bottom: options.marginBottom ?? '15mm',
        left: options.marginLeft ?? '15mm',
        right: options.marginRight ?? '15mm',
      },
      printBackground: options.printBackground ?? true,
      scale: options.scale ?? 1,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

/**
 * Render HTML string to a PNG screenshot Buffer.
 * Used for live template-editor preview — shows exactly what the PDF looks like.
 */
export async function htmlToScreenshot(
  html: string,
  options: ScreenshotOptions = {},
): Promise<Buffer> {
  const browser = await acquireBrowser();
  const page = await browser.newPage();

  try {
    // Emulate a desktop viewport
    const width = options.width ?? 794; // ~A4 width at 96 DPI
    await page.setViewport({
      width,
      height: options.height ?? 1123,
      deviceScaleFactor: 2, // Retina-quality screenshot
    });

    const wrappedHtml = wrapHtmlDocument(html, {
      ...options,
      printBackground: true,
    });

    await page.setContent(wrappedHtml, {
      waitUntil: 'networkidle0',
      timeout: 30_000,
    });

    await page.evaluate(() => document.fonts.ready);

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: options.fullPage ?? true,
      omitBackground: false,
    });

    return Buffer.from(screenshot);
  } finally {
    await page.close();
  }
}
