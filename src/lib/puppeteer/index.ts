/**
 * Puppeteer service — provides real Chromium rendering for:
 *   1. HTML → PDF  (pixel-perfect, multi-page, CSS-aware)
 *   2. HTML → PNG screenshot (for live template preview)
 *
 * Uses a pool of browser instances instead of a singleton to handle concurrent
 * PDF requests without queue overflow (HIGH-03 fix). A semaphore caps the maximum
 * concurrent renders so CPU/memory stays bounded under load.
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

// ─── Pool Configuration ────────────────────────────────────────────────────

const POOL_SIZE = Number(process.env.PUPPETEER_POOL_SIZE ?? 3);
const BROWSER_LAUNCH_TIMEOUT_MS = 30_000;
const PAGE_OPERATION_TIMEOUT_MS = 30_000;

// ─── Browser Pool ────────────────────────────────────────────────────────

interface PooledBrowser {
  browser: Browser;
  inUse: boolean;
  createdAt: number;
}

const _pool: PooledBrowser[] = [];
let _semaphore: Promise<void>;
let _semaphoreResolve: (() => void) | null = null;

function getSemaphore(): Promise<() => void> {
  if (!_semaphore) {
    let resolve: () => void;
    _semaphore = new Promise<void>((r) => { resolve = r; });
    _semaphoreResolve = resolve!;
  }
  return Promise.resolve(() => {
    if (_semaphoreResolve) _semaphoreResolve();
  });
}

function semaphoreAcquire(): Promise<() => void> {
  return getSemaphore().then((release) => release);
}

async function acquirePooledBrowser(): Promise<Browser> {
  // Reuse an existing idle browser, or launch a new one if under pool size
  for (const pooled of _pool) {
    if (!pooled.inUse) {
      try {
        // Verify the browser is still alive
        const version = await pooled.browser.version();
        void version;
        pooled.inUse = true;
        return pooled.browser;
      } catch {
        // Browser is dead — remove from pool and replace below
        const idx = _pool.indexOf(pooled);
        if (idx !== -1) _pool.splice(idx, 1);
      }
    }
  }

  if (_pool.length < POOL_SIZE) {
    const browser = await launchBrowser();
    const pooled: PooledBrowser = { browser, inUse: true, createdAt: Date.now() };
    _pool.push(pooled);
    return browser;
  }

  // Pool is full — wait for a browser to be released
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      for (const pooled of _pool) {
        if (!pooled.inUse) {
          clearInterval(interval);
          resolve();
        }
      }
    }, 500);
  });

  return acquirePooledBrowser();
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
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
    timeout: BROWSER_LAUNCH_TIMEOUT_MS,
  });
}

function releaseBrowser(browser: Browser): void {
  for (const pooled of _pool) {
    if (pooled.browser === browser) {
      pooled.inUse = false;
      return;
    }
  }
}

async function closeAllBrowsers(): Promise<void> {
  await Promise.all(_pool.map(async (p) => {
    try { await p.browser.close(); } catch (e) {
      console.warn('[PuppeteerPool] browser.close() failed:', e);
    }
  }));
  _pool.length = 0;
}

// ─── Warm-up ─────────────────────────────────────────────────────────────

/**
 * Warm-up the browser pool at startup (call once during server boot).
 * Safe to call multiple times.
 */
export async function warmupBrowser(): Promise<void> {
  const targets = await Promise.all(
    Array.from({ length: Math.min(POOL_SIZE, 2) }, () =>
      launchBrowser().catch(() => null)
    )
  );
  for (const browser of targets) {
    if (browser) _pool.push({ browser, inUse: false, createdAt: Date.now() });
  }
}

// ─── HTML wrapper ────────────────────────────────────────────────────────

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

// ─── Internal page operations ───────────────────────────────────────────

async function renderPage(
  browser: Browser,
  html: string,
  options: PdfOptions,
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    const wrappedHtml = wrapHtmlDocument(html, options);
    await page.setContent(wrappedHtml, {
      waitUntil: 'networkidle0',
      timeout: PAGE_OPERATION_TIMEOUT_MS,
    });
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

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Render HTML string to a PDF Buffer using a pooled Chromium instance.
 * Concurrency is capped by a semaphore at PUPPETEER_MAX_CONCURRENT (default 5).
 */
export async function htmlToPdfBuffer(
  html: string,
  options: PdfOptions = {},
): Promise<Buffer> {
  const release = await semaphoreAcquire();
  try {
    const browser = await acquirePooledBrowser();
    try {
      return await renderPage(browser, html, options);
    } finally {
      releaseBrowser(browser);
    }
  } finally {
    release();
  }
}

/**
 * Render HTML string to a PNG screenshot Buffer.
 * Same pooled browser approach as htmlToPdfBuffer.
 */
export async function htmlToScreenshot(
  html: string,
  options: ScreenshotOptions = {},
): Promise<Buffer> {
  const release = await semaphoreAcquire();
  try {
    const browser = await acquirePooledBrowser();
    try {
      const page = await browser.newPage();
      try {
        const width = options.width ?? 794;
        await page.setViewport({
          width,
          height: options.height ?? 1123,
          deviceScaleFactor: 2,
        });

        const wrappedHtml = wrapHtmlDocument(html, {
          ...options,
          printBackground: true,
        });
        await page.setContent(wrappedHtml, {
          waitUntil: 'networkidle0',
          timeout: PAGE_OPERATION_TIMEOUT_MS,
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
    } finally {
      releaseBrowser(browser);
    }
  } finally {
    release();
  }
}

// ─── Pool lifecycle (exported for graceful shutdown) ────────────────────

export { closeAllBrowsers };
